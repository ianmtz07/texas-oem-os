const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function extractTag(xml: string, name: string) {
  const match = xml.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`)
  )

  return match?.[1]?.trim() ?? ""
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

  if (!response.ok) {
    throw new Error(
      `eBay token refresh failed: ${await response.text()}`
    )
  }

  const data = await response.json()

  if (!data.access_token) {
    throw new Error("eBay did not return an access token")
  }

  return String(data.access_token)
}

async function revisePhotos(
  accessToken: string,
  itemId: string,
  photoUrls: string[],
) {
  const pictureXml = photoUrls
    .map(
      (url) =>
        `      <PictureURL>${escapeXml(url)}</PictureURL>`
    )
    .join("\n")

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item>
    <ItemID>${escapeXml(itemId)}</ItemID>
    <PictureDetails>
${pictureXml}
    </PictureDetails>
  </Item>
</ReviseFixedPriceItemRequest>`

  const response = await fetch(
    "https://api.ebay.com/ws/api.dll",
    {
      method: "POST",
      headers: {
        "X-EBAY-API-CALL-NAME": "ReviseFixedPriceItem",
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
        "X-EBAY-API-IAF-TOKEN": accessToken,
        "Content-Type": "text/xml",
      },
      body: xml,
    },
  )

  const text = await response.text()
  const ack = extractTag(text, "Ack")
  const errorMessage =
    extractTag(text, "LongMessage") ||
    extractTag(text, "ShortMessage")

  if (
    !response.ok ||
    (ack !== "Success" && ack !== "Warning")
  ) {
    throw new Error(
      errorMessage ||
        `eBay photo revision failed. Ack: ${ack || "Unknown"}`
    )
  }

  return {
    ack,
    ebayItemId: extractTag(text, "ItemID") || itemId,
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    })
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Method not allowed",
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    )
  }

  try {
    const body = await req.json().catch(() => ({}))

    const ebayItemId = String(
      body.ebayItemId ?? body.ebay_item_id ?? ""
    ).trim()

    const photoUrls = Array.isArray(body.photoUrls)
      ? body.photoUrls
          .map((value: unknown) => String(value ?? "").trim())
          .filter(Boolean)
      : []

    if (!ebayItemId) {
      throw new Error("Missing eBay item ID")
    }

    if (photoUrls.length === 0) {
      throw new Error("At least one photo URL is required")
    }

    const accessToken = await getAccessToken()

    const result = await revisePhotos(
      accessToken,
      ebayItemId,
      photoUrls,
    )

    return new Response(
      JSON.stringify({
        success: true,
        ebay_item_id: result.ebayItemId,
        photo_count: photoUrls.length,
        ack: result.ack,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to update eBay listing photos"

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    )
  }
})
