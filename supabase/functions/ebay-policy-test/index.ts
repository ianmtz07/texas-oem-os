const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

async function getAccessToken() {
  const clientId = Deno.env.get("EBAY_CLIENT_ID") ?? ""
  const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET") ?? ""
  const refreshToken = Deno.env.get("EBAY_REFRESH_TOKEN") ?? ""

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing eBay OAuth configuration")
  }

  const basic = btoa(`${clientId}:${clientSecret}`)

  const body = new URLSearchParams()
  body.set("grant_type", "refresh_token")
  body.set("refresh_token", refreshToken)

  const response = await fetch(
    "https://api.ebay.com/identity/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  )

  const data = await response.json()

  if (!response.ok || !data.access_token) {
    throw new Error(
      `eBay token refresh failed: ${JSON.stringify(data)}`
    )
  }

  return String(data.access_token)
}

async function ebayGet(
  accessToken: string,
  path: string,
) {
  const response = await fetch(`https://api.ebay.com${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  })

  const text = await response.text()

  let data: unknown = text

  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    // Keep raw response text.
  }

  return {
    httpStatus: response.status,
    ok: response.ok,
    data,
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const accessToken = await getAccessToken()

    const [
      fulfillment,
      payment,
      returns,
      locations,
    ] = await Promise.all([
      ebayGet(
        accessToken,
        "/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US",
      ),
      ebayGet(
        accessToken,
        "/sell/account/v1/payment_policy?marketplace_id=EBAY_US",
      ),
      ebayGet(
        accessToken,
        "/sell/account/v1/return_policy?marketplace_id=EBAY_US",
      ),
      ebayGet(
        accessToken,
        "/sell/inventory/v1/location?limit=100",
      ),
    ])

    return Response.json({
      success: true,
      fulfillment,
      payment,
      returns,
      locations,
    }, {
      headers: corsHeaders,
    })
  } catch (error) {
    return Response.json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    }, {
      status: 500,
      headers: corsHeaders,
    })
  }
})
