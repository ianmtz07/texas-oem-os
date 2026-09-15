import "@supabase/functions-js/edge-runtime.d.ts";

const EBAY_CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID") ?? "";
const EBAY_CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET") ?? "";
const EBAY_REFRESH_TOKEN = Deno.env.get("EBAY_REFRESH_TOKEN") ?? "";

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

Deno.serve(async () => {
  try {
    const accessToken = await getAccessToken();

    const typeCounts: Record<string, number> = {};
    const typeAmounts: Record<
      string,
      { credit: number; debit: number }
    > = {};
    const nonSaleChargeMemoCounts: Record<string, number> = {};
    const nonSaleChargeMemoAmounts: Record<string, number> = {};
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
        return Response.json(
          {
            success: false,
            stage: "transactions",
            status: response.status,
            ebayResponse: text,
          },
          { status: 500 },
        );
      }

      const data = text ? JSON.parse(text) : {};
      const transactions = Array.isArray(data.transactions)
        ? data.transactions
        : [];

      total = Number(data.total ?? total);

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

    for (const sale of allSaleTransactions) {
      if (sale.orderId && refundedOrderIds.has(sale.orderId)) {
        refundSaleMatches.push(sale);
      }
    }

    return Response.json({
      success: true,
      financesScopeWorking: true,
      totalTransactions: total,
      fetchedTransactions: fetched,
      transactionTypeCounts: typeCounts,
      transactionTypeAmounts: typeAmounts,
      nonSaleChargeMemoCounts,
      nonSaleChargeMemoAmounts,
      specialTypeMemoSummary,
      disputeCreditMatches,
      refundSaleMatches,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 },
    );
  }
});
