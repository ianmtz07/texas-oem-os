import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID") ?? "";
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET") ?? "";
const EBAY_REFRESH_TOKEN = Deno.env.get("EBAY_REFRESH_TOKEN") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
) {
  return Response.json(body, {
    ...init,
    headers: {
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

async function getAccessToken() {
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET || !EBAY_REFRESH_TOKEN) {
    throw new Error("Missing eBay OAuth configuration.");
  }

  const credentials = btoa(
    `${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`,
  );

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: EBAY_REFRESH_TOKEN,
    scope: [
      "https://api.ebay.com/oauth/api_scope",
      "https://api.ebay.com/oauth/api_scope/sell.finances",
      "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
    ].join(" "),
  });

  const response = await fetch(
    "https://api.ebay.com/identity/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `eBay access token request failed (${response.status}): ${text}`,
    );
  }

  const data = JSON.parse(text);

  if (!data.access_token) {
    throw new Error("eBay did not return an access token.");
  }

  return String(data.access_token);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase service-role configuration.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Manual shipping costs are used for freight or other shipping
    // purchased outside eBay. Handle these requests before contacting
    // eBay so saving a freight charge does not trigger a full Finance sync.
    let requestBody: any = {};

    if (request.method === "POST") {
      try {
        requestBody = await request.json();
      } catch {
        requestBody = {};
      }
    }

    if (requestBody?.action === "save_manual_shipping") {
      const orderId = String(requestBody.orderId ?? "").trim();
      const amount = Number(requestBody.amount);

      if (!orderId) {
        return jsonResponse(
          {
            success: false,
            error: "orderId is required.",
          },
          { status: 400, headers: corsHeaders },
        );
      }

      if (!Number.isFinite(amount) || amount < 0) {
        return jsonResponse(
          {
            success: false,
            error: "A valid non-negative shipping amount is required.",
          },
          { status: 400, headers: corsHeaders },
        );
      }

      const { data: order, error: orderError } = await supabase
        .from("ebay_fulfillment_orders")
        .select("order_id")
        .eq("order_id", orderId)
        .maybeSingle();

      if (orderError) {
        throw new Error(
          `Could not validate eBay order: ${orderError.message}`,
        );
      }

      if (!order) {
        return jsonResponse(
          {
            success: false,
            error: `Unknown eBay order ID: ${orderId}`,
          },
          { status: 404, headers: corsHeaders },
        );
      }

      const { data, error } = await supabase
        .from("ebay_manual_shipping_costs")
        .insert({
          order_id: orderId,
          amount,
          shipping_type: String(
            requestBody.shippingType ?? "FREIGHT",
          ),
          carrier:
            requestBody.carrier != null
              ? String(requestBody.carrier).trim() || null
              : null,
          reference_number:
            requestBody.referenceNumber != null
              ? String(requestBody.referenceNumber).trim() || null
              : null,
          notes:
            requestBody.notes != null
              ? String(requestBody.notes).trim() || null
              : null,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        throw new Error(
          `Could not save manual shipping cost: ${error.message}`,
        );
      }

      return jsonResponse(
        {
          success: true,
          action: "save_manual_shipping",
          manualShippingCost: data,
        },
        { headers: corsHeaders },
      );
    }

    const accessToken = await getAccessToken();

    // Fetch the permanent Fulfillment order dataset.
    // This gives Finance the order-side truth needed to reconcile
    // merchandise, buyer-paid shipping, tax, SKU, and item ID
    // against the eBay Finance transaction ledger.
    const fulfillmentOrders: any[] = [];
    const fulfillmentLimit = 200;
    let fulfillmentOffset = 0;
    let fulfillmentTotal = 0;

    do {
      const fulfillmentUrl = new URL(
        "https://api.ebay.com/sell/fulfillment/v1/order",
      );

      fulfillmentUrl.searchParams.set(
        "limit",
        String(fulfillmentLimit),
      );
      fulfillmentUrl.searchParams.set(
        "offset",
        String(fulfillmentOffset),
      );

      const fulfillmentResponse = await fetch(
        fulfillmentUrl.toString(),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      const fulfillmentText =
        await fulfillmentResponse.text();

      if (!fulfillmentResponse.ok) {
        return jsonResponse(
          {
            success: false,
            stage: "fulfillment_orders",
            status: fulfillmentResponse.status,
            ebayResponse: fulfillmentText,
          },
          { status: 500, headers: corsHeaders },
        );
      }

      const fulfillmentData =
        fulfillmentText
          ? JSON.parse(fulfillmentText)
          : {};

      const pageOrders =
        Array.isArray(fulfillmentData.orders)
          ? fulfillmentData.orders
          : [];

      fulfillmentOrders.push(...pageOrders);

      fulfillmentTotal = Number(
        fulfillmentData.total ?? fulfillmentOrders.length,
      );

      fulfillmentOffset += pageOrders.length;

      if (
        pageOrders.length === 0 ||
        fulfillmentOrders.length >= fulfillmentTotal
      ) {
        break;
      }
    } while (true);

    const paidFulfillmentOrders = fulfillmentOrders.filter(
      (order: any) =>
        String(order.orderPaymentStatus ?? "").toUpperCase() === "PAID" &&
        String(order.cancelStatus?.cancelState ?? "").toUpperCase() !==
          "CANCELED",
    );

    const fulfillmentOrderDates = fulfillmentOrders
      .map((order: any) => String(order.creationDate ?? ""))
      .filter(Boolean)
      .sort();

    const oldestFulfillmentOrderDate =
      fulfillmentOrderDates[0] ?? null;

    const newestFulfillmentOrderDate =
      fulfillmentOrderDates[fulfillmentOrderDates.length - 1] ?? null;

    // Permanently archive every Fulfillment order returned by eBay.
    // eBay only exposes a limited historical Fulfillment window, so once
    // Texas OEM OS sees an order we retain the order-side financial truth.
    const fulfillmentLedgerRows = fulfillmentOrders
      .filter((order: any) => String(order.orderId ?? "").trim())
      .map((order: any) => ({
        order_id: String(order.orderId),
        legacy_order_id:
          order.legacyOrderId != null
            ? String(order.legacyOrderId)
            : null,
        sales_record_reference:
          order.salesRecordReference != null
            ? String(order.salesRecordReference)
            : null,
        creation_date:
          order.creationDate != null
            ? String(order.creationDate)
            : null,
        last_modified_date:
          order.lastModifiedDate != null
            ? String(order.lastModifiedDate)
            : null,
        payment_status:
          order.orderPaymentStatus != null
            ? String(order.orderPaymentStatus)
            : null,
        fulfillment_status:
          order.orderFulfillmentStatus != null
            ? String(order.orderFulfillmentStatus)
            : null,
        cancel_state:
          order.cancelStatus?.cancelState != null
            ? String(order.cancelStatus.cancelState)
            : null,
        price_subtotal:
          order.pricingSummary?.priceSubtotal?.value != null
            ? String(order.pricingSummary.priceSubtotal.value)
            : null,
        delivery_cost:
          order.pricingSummary?.deliveryCost?.value != null
            ? String(order.pricingSummary.deliveryCost.value)
            : null,
        order_total:
          order.pricingSummary?.total?.value != null
            ? String(order.pricingSummary.total.value)
            : null,
        total_due_seller:
          order.paymentSummary?.totalDueSeller?.value != null
            ? String(order.paymentSummary.totalDueSeller.value)
            : null,
        total_fee_basis_amount:
          order.totalFeeBasisAmount?.value != null
            ? String(order.totalFeeBasisAmount.value)
            : null,
        total_marketplace_fee:
          order.totalMarketplaceFee?.value != null
            ? String(order.totalMarketplaceFee.value)
            : null,
        currency: String(
          order.pricingSummary?.total?.currency ??
            order.pricingSummary?.priceSubtotal?.currency ??
            "USD",
        ),
        raw_order: order,
        last_synced_at: new Date().toISOString(),
      }));

    if (fulfillmentLedgerRows.length > 0) {
      const { error: fulfillmentLedgerError } = await supabase
        .from("ebay_fulfillment_orders")
        .upsert(fulfillmentLedgerRows, {
          onConflict: "order_id",
        });

      if (fulfillmentLedgerError) {
        throw new Error(
          `eBay Fulfillment order upsert failed: ${fulfillmentLedgerError.message}`,
        );
      }
    }

    // Permanently archive every line item inside the Fulfillment orders.
    // This connects order-level money to the actual Texas OEM SKU/item sold.
    const fulfillmentItemRows = fulfillmentOrders.flatMap((order: any) => {
      const orderId = String(order.orderId ?? "").trim();

      if (!orderId || !Array.isArray(order.lineItems)) {
        return [];
      }

      return order.lineItems
        .filter((lineItem: any) =>
          String(lineItem.lineItemId ?? "").trim()
        )
        .map((lineItem: any) => {
          const collectedTax = Array.isArray(
            lineItem.ebayCollectAndRemitTaxes,
          )
            ? lineItem.ebayCollectAndRemitTaxes.reduce(
                (sum: number, tax: any) =>
                  sum + Number(tax.amount?.value ?? 0),
                0,
              )
            : 0;

          return {
            line_item_id: String(lineItem.lineItemId),
            order_id: orderId,
            ebay_item_id:
              lineItem.legacyItemId != null
                ? String(lineItem.legacyItemId)
                : null,
            sku:
              lineItem.sku != null
                ? String(lineItem.sku)
                : null,
            title:
              lineItem.title != null
                ? String(lineItem.title)
                : null,
            quantity: Math.max(
              1,
              Number(lineItem.quantity ?? 1) || 1,
            ),
            line_item_cost:
              lineItem.lineItemCost?.value != null
                ? String(lineItem.lineItemCost.value)
                : null,
            line_total:
              lineItem.total?.value != null
                ? String(lineItem.total.value)
                : null,
            shipping_cost:
              lineItem.deliveryCost?.shippingCost?.value != null
                ? String(lineItem.deliveryCost.shippingCost.value)
                : null,
            ebay_collected_tax: String(collectedTax),
            currency: String(
              lineItem.total?.currency ??
                lineItem.lineItemCost?.currency ??
                "USD",
            ),
            fulfillment_status:
              lineItem.lineItemFulfillmentStatus != null
                ? String(lineItem.lineItemFulfillmentStatus)
                : null,
            raw_line_item: lineItem,
            last_synced_at: new Date().toISOString(),
          };
        });
    });

    if (fulfillmentItemRows.length > 0) {
      const { error: fulfillmentItemError } = await supabase
        .from("ebay_fulfillment_order_items")
        .upsert(fulfillmentItemRows, {
          onConflict: "line_item_id",
        });

      if (fulfillmentItemError) {
        throw new Error(
          `eBay Fulfillment item upsert failed: ${fulfillmentItemError.message}`,
        );
      }
    }

    const fulfillmentOrderIds = new Set(
      paidFulfillmentOrders
        .map((order: any) => String(order.orderId ?? "").trim())
        .filter(Boolean),
    );

    const typeCounts: Record<string, number> = {};
    const typeAmounts: Record<
      string,
      { credit: number; debit: number }
    > = {};
    const nonSaleChargeMemoCounts: Record<string, number> = {};
    const nonSaleChargeMemoAmounts: Record<string, number> = {};
    const oddballTransactions: unknown[] = [];
    let rawSaleProbe: unknown = null;
    const specialTypeMemoSummary: Record<
      string,
      Record<string, { count: number; credit: number; debit: number }>
    > = {};
    const disputeCreditMatches: Array<{
      type: string;
      transactionId: string | null;
      orderId: string | null;
      amount: number;
      bookingEntry: string;
      transactionDate: string | null;
    }> = [];
    const refundSaleMatches: Array<{
      type: string;
      transactionId: string | null;
      orderId: string | null;
      amount: number;
      bookingEntry: string;
      transactionDate: string | null;
      totalFeeBasisAmount: number | null;
      totalFeeAmount: number | null;
    }> = [];
    const refundedOrderIds = new Set<string>();
    const allSaleTransactions: Array<{
      type: string;
      transactionId: string | null;
      orderId: string | null;
      amount: number;
      bookingEntry: string;
      transactionDate: string | null;
      totalFeeBasisAmount: number | null;
      totalFeeAmount: number | null;
    }> = [];
    let offset = 0;
    const limit = 1000;
    let total = 0;
    let fetched = 0;
    let ledgerRowsUpserted = 0;

    do {
      const response = await fetch(
        `https://apiz.ebay.com/sell/finances/v1/transaction?limit=${limit}&offset=${offset}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      const text = await response.text();

      if (!response.ok) {
        return jsonResponse(
          {
            success: false,
            stage: "transactions",
            status: response.status,
            ebayResponse: text,
          },
          { status: 500, headers: corsHeaders },
        );
      }

      const data = text ? JSON.parse(text) : {};
      const transactions = Array.isArray(data.transactions)
        ? data.transactions
        : [];

      total = Number(data.total ?? total);

      const invalidLedgerTransactions = transactions.filter(
        (transaction: any) =>
          transaction.transactionId == null ||
          transaction.transactionDate == null ||
          transaction.amount?.value == null,
      );

      if (invalidLedgerTransactions.length > 0) {
        throw new Error(
          `eBay returned ${invalidLedgerTransactions.length} transaction(s) without a transaction ID, transaction date, or amount; ledger sync stopped.`,
        );
      }

      const ledgerRows = transactions
        .map((transaction: any) => ({
          transaction_id: String(transaction.transactionId),
          order_id:
            transaction.orderId != null
              ? String(transaction.orderId)
              : null,
          payout_id:
            transaction.payoutId != null
              ? String(transaction.payoutId)
              : null,
          sales_record_reference:
            transaction.salesRecordReference != null
              ? String(transaction.salesRecordReference)
              : null,
          transaction_type: String(
            transaction.transactionType ?? "UNKNOWN",
          ),
          booking_entry: String(
            transaction.bookingEntry ?? "UNKNOWN",
          ),
          amount: String(transaction.amount.value),
          currency: String(
            transaction.amount.currency ?? "USD",
          ),
          transaction_date:
            transaction.transactionDate != null
              ? String(transaction.transactionDate)
              : null,
          transaction_status:
            transaction.transactionStatus != null
              ? String(transaction.transactionStatus)
              : null,
          transaction_memo:
            transaction.transactionMemo != null
              ? String(transaction.transactionMemo)
              : null,
          fee_type:
            transaction.feeType != null
              ? String(transaction.feeType)
              : null,
          total_fee_basis_amount:
            transaction.totalFeeBasisAmount?.value != null
              ? String(transaction.totalFeeBasisAmount.value)
              : null,
          total_fee_amount:
            transaction.totalFeeAmount?.value != null
              ? String(transaction.totalFeeAmount.value)
              : null,
          ebay_collected_tax_amount:
            transaction.ebayCollectedTaxAmount?.value != null
              ? String(transaction.ebayCollectedTaxAmount.value)
              : null,
          raw_transaction: transaction,
          last_synced_at: new Date().toISOString(),
        }));

      if (ledgerRows.length > 0) {
        const { error: ledgerError } = await supabase
          .from("ebay_finance_transactions")
          .upsert(ledgerRows, {
            onConflict: "transaction_id,transaction_type,transaction_date",
          });

        if (ledgerError) {
          throw new Error(
            `eBay finance ledger upsert failed: ${ledgerError.message}`,
          );
        }

        ledgerRowsUpserted += ledgerRows.length;
      }

      for (const transaction of transactions) {
        const type = String(transaction.transactionType ?? "UNKNOWN");
        typeCounts[type] = (typeCounts[type] ?? 0) + 1;

        const amount = Number(transaction.amount?.value ?? 0);
        const bookingEntry = String(
          transaction.bookingEntry ?? "UNKNOWN",
        );

        if (!typeAmounts[type]) {
          typeAmounts[type] = { credit: 0, debit: 0 };
        }

        if (bookingEntry === "CREDIT") {
          typeAmounts[type].credit += amount;
        } else if (bookingEntry === "DEBIT") {
          typeAmounts[type].debit += amount;
        }

        const orderId =
          transaction.orderId != null
            ? String(transaction.orderId)
            : null;

        const financeMatchRow = {
          type,
          transactionId:
            transaction.transactionId != null
              ? String(transaction.transactionId)
              : null,
          orderId,
          amount,
          bookingEntry,
          transactionDate:
            transaction.transactionDate != null
              ? String(transaction.transactionDate)
              : null,
          totalFeeBasisAmount:
            transaction.totalFeeBasisAmount?.value != null
              ? Number(transaction.totalFeeBasisAmount.value)
              : null,
          totalFeeAmount:
            transaction.totalFeeAmount?.value != null
              ? Number(transaction.totalFeeAmount.value)
              : null,
        };

        if (type === "REFUND") {
          refundSaleMatches.push(financeMatchRow);
          if (orderId) {
            refundedOrderIds.add(orderId);
          }
        }

        if (type === "SALE") {
          allSaleTransactions.push(financeMatchRow);

          if (rawSaleProbe === null) {
            rawSaleProbe = transaction;
          }
        }

        if (type === "CREDIT" || type === "DISPUTE") {
          disputeCreditMatches.push({
            type,
            transactionId:
              transaction.transactionId != null
                ? String(transaction.transactionId)
                : null,
            orderId:
              transaction.orderId != null
                ? String(transaction.orderId)
                : null,
            amount,
            bookingEntry,
            transactionDate:
              transaction.transactionDate != null
                ? String(transaction.transactionDate)
                : null,
          });
        }

        if (
          ["REFUND", "CREDIT", "DISPUTE", "TRANSFER", "ADJUSTMENT"].includes(type)
        ) {
          const memo = String(
            transaction.transactionMemo ?? "NO_MEMO",
          );

          if (!specialTypeMemoSummary[type]) {
            specialTypeMemoSummary[type] = {};
          }

          if (!specialTypeMemoSummary[type][memo]) {
            specialTypeMemoSummary[type][memo] = {
              count: 0,
              credit: 0,
              debit: 0,
            };
          }

          const summary = specialTypeMemoSummary[type][memo];
          summary.count += 1;

          if (bookingEntry === "CREDIT") {
            summary.credit += amount;
          } else if (bookingEntry === "DEBIT") {
            summary.debit += amount;
          }
        }

        const transactionId = String(
          transaction.transactionId ?? "",
        );
        const transactionMemo = String(
          transaction.transactionMemo ?? "",
        );

        if (
          (type === "REFUND" && transactionId.includes("CCM_RECOUP")) ||
          (
            type === "NON_SALE_CHARGE" &&
            (Math.abs(amount - 21.95) < 0.001 ||
              Math.abs(amount - 23.40) < 0.001)
          )
        ) {
          oddballTransactions.push(transaction);
        }

        if (type === "NON_SALE_CHARGE") {
          const memo = String(
            transaction.transactionMemo ?? "NO_MEMO",
          );
          nonSaleChargeMemoCounts[memo] =
            (nonSaleChargeMemoCounts[memo] ?? 0) + 1;

          nonSaleChargeMemoAmounts[memo] =
            (nonSaleChargeMemoAmounts[memo] ?? 0) + amount;
        }
      }

      fetched += transactions.length;
      offset += transactions.length;

      if (transactions.length === 0) break;
    } while (fetched < total);

    // Build actual seller-paid shipping totals by order.
    //
    // eBay shipping includes:
    //   DEBIT  = money Texas OEM paid
    //   CREDIT = postage refund/credit back to Texas OEM
    //
    // Manual shipping covers freight or other shipping purchased
    // outside eBay.
    const { data: ebayShippingRows, error: ebayShippingError } =
      await supabase
        .from("ebay_finance_transactions")
        .select("order_id, amount, booking_entry")
        .eq("transaction_type", "SHIPPING_LABEL");

    if (ebayShippingError) {
      throw new Error(
        `Unable to load eBay shipping costs: ${ebayShippingError.message}`,
      );
    }

    const ebayShippingByOrder = new Map<string, number>();

    for (const row of ebayShippingRows ?? []) {
      const orderId = String(row.order_id ?? "").trim();

      if (!orderId) continue;

      const amount = Number(row.amount ?? 0);
      const bookingEntry = String(row.booking_entry ?? "").toUpperCase();

      const signedShippingCost =
        bookingEntry === "DEBIT"
          ? amount
          : bookingEntry === "CREDIT"
            ? -amount
            : 0;

      ebayShippingByOrder.set(
        orderId,
        (ebayShippingByOrder.get(orderId) ?? 0) +
          signedShippingCost,
      );
    }

    const { data: manualShippingRows, error: manualShippingError } =
      await supabase
        .from("ebay_manual_shipping_costs")
        .select("order_id, amount");

    if (manualShippingError) {
      throw new Error(
        `Unable to load manual shipping costs: ${manualShippingError.message}`,
      );
    }

    const manualShippingByOrder = new Map<string, number>();

    for (const row of manualShippingRows ?? []) {
      const orderId = String(row.order_id ?? "").trim();

      if (!orderId) continue;

      manualShippingByOrder.set(
        orderId,
        (manualShippingByOrder.get(orderId) ?? 0) +
          Number(row.amount ?? 0),
      );
    }

    // Calculate the current archived Fulfillment window using real
    // order revenue, real eBay marketplace fees, real eBay postage,
    // and manually entered freight/outside shipping.
    const actualOrderFinancials = paidFulfillmentOrders.map(
      (order: any) => {
        const orderId = String(order.orderId ?? "").trim();

        const merchandise = Number(
          order.pricingSummary?.priceSubtotal?.value ?? 0,
        );

        const buyerPaidShipping = Number(
          order.pricingSummary?.deliveryCost?.value ?? 0,
        );

        const ebayFee = Number(
          order.totalMarketplaceFee?.value ?? 0,
        );

        const ebayShipping =
          ebayShippingByOrder.get(orderId) ?? 0;

        const manualShipping =
          manualShippingByOrder.get(orderId) ?? 0;

        const grossRevenue =
          merchandise + buyerPaidShipping;

        const sellerShipping =
          ebayShipping + manualShipping;

        const actualNet =
          grossRevenue - ebayFee - sellerShipping;

        return {
          orderId,
          merchandise: Number(merchandise.toFixed(2)),
          buyerPaidShipping: Number(
            buyerPaidShipping.toFixed(2),
          ),
          grossRevenue: Number(grossRevenue.toFixed(2)),
          ebayFee: Number(ebayFee.toFixed(2)),
          ebayShipping: Number(ebayShipping.toFixed(2)),
          manualShipping: Number(manualShipping.toFixed(2)),
          sellerShipping: Number(sellerShipping.toFixed(2)),
          actualNet: Number(actualNet.toFixed(2)),
        };
      },
    );

    const actualFinancialTotals = actualOrderFinancials.reduce(
      (
        totals,
        order,
      ) => {
        totals.merchandise += order.merchandise;
        totals.buyerPaidShipping += order.buyerPaidShipping;
        totals.grossRevenue += order.grossRevenue;
        totals.ebayFees += order.ebayFee;
        totals.ebayShipping += order.ebayShipping;
        totals.manualShipping += order.manualShipping;
        totals.sellerShipping += order.sellerShipping;
        totals.actualNet += order.actualNet;

        return totals;
      },
      {
        merchandise: 0,
        buyerPaidShipping: 0,
        grossRevenue: 0,
        ebayFees: 0,
        ebayShipping: 0,
        manualShipping: 0,
        sellerShipping: 0,
        actualNet: 0,
      },
    );

    for (const key of Object.keys(actualFinancialTotals)) {
      const typedKey =
        key as keyof typeof actualFinancialTotals;

      actualFinancialTotals[typedKey] =
        Number(actualFinancialTotals[typedKey].toFixed(2));
    }

    for (const sale of allSaleTransactions) {
      if (sale.orderId && refundedOrderIds.has(sale.orderId)) {
        refundSaleMatches.push(sale);
      }
    }

    // Reconcile Finance SALE transactions against paid,
    // non-cancelled Fulfillment orders by eBay order ID.
    const financeSaleOrderIds = new Set(
      allSaleTransactions
        .map((sale) => String(sale.orderId ?? "").trim())
        .filter(Boolean),
    );

    const matchedOrderIds = [...financeSaleOrderIds].filter(
      (orderId) => fulfillmentOrderIds.has(orderId),
    );

    const financeSalesMissingFromFulfillment =
      [...financeSaleOrderIds].filter(
        (orderId) => !fulfillmentOrderIds.has(orderId),
      );

    const fulfillmentOrdersMissingFromFinance =
      [...fulfillmentOrderIds].filter(
        (orderId) => !financeSaleOrderIds.has(orderId),
      );

    const reconciliationMatchPct =
      financeSaleOrderIds.size > 0
        ? Number(
            (
              (matchedOrderIds.length / financeSaleOrderIds.size) *
              100
            ).toFixed(2),
          )
        : 0;

    return jsonResponse({
      success: true,
      financesScopeWorking: true,
      totalTransactions: total,
      fetchedTransactions: fetched,
      fulfillmentTotalOrders: fulfillmentTotal,
      paidFulfillmentOrders: paidFulfillmentOrders.length,
      oldestFulfillmentOrderDate,
      newestFulfillmentOrderDate,
      financeSaleOrderIds: financeSaleOrderIds.size,
      matchedOrderIds: matchedOrderIds.length,
      reconciliationMatchPct,
      actualFinancialTotals,
      actualOrderFinancials,
      financeSalesMissingFromFulfillment,
      fulfillmentOrdersMissingFromFinance,
      transactionTypeCounts: typeCounts,
      transactionTypeAmounts: typeAmounts,
      nonSaleChargeMemoCounts,
      nonSaleChargeMemoAmounts,
      specialTypeMemoSummary,
      disputeCreditMatches,
      refundSaleMatches,
      oddballTransactions,
      rawSaleProbe,
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500, headers: corsHeaders },
    );
  }
});
