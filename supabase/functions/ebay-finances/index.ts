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

    return Response.json({
      success: true,
      financesScopeWorking: true,
      totalTransactions: total,
      fetchedTransactions: fetched,
      transactionTypeCounts: typeCounts,
      transactionTypeAmounts: typeAmounts,
      nonSaleChargeMemoCounts,
      nonSaleChargeMemoAmounts,
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
