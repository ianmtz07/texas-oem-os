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

async function reviseTradingApiPhotos(
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
    response.ok &&
    (ack === "Success" || ack === "Warning")
  ) {
    return {
      success: true,
      method: "trading",
      ack,
    }
  }

  return {
    success: false,
    method: "trading",
    error:
      errorMessage ||
      `eBay Trading API photo revision failed. Ack: ${ack || "Unknown"}`,
  }
}

async function reviseInventoryApiPhotos(
  accessToken: string,
  sku: string,
  photoUrls: string[],
) {
  const encodedSku = encodeURIComponent(sku)

  const getResponse = await fetch(
    `https://api.ebay.com/sell/inventory/v1/inventory_item/${encodedSku}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  )

  const getText = await getResponse.text()

  if (!getResponse.ok) {
    throw new Error(
      `eBay Inventory GET failed for SKU ${sku}: ${getText}`
    )
  }

  const currentItem = getText
    ? JSON.parse(getText)
    : {}

  const {
    sku: _sku,
    locale: _locale,
    groupIds: _groupIds,
    inventoryItemGroupKeys: _inventoryItemGroupKeys,
    ...inventoryPayload
  } = currentItem

  inventoryPayload.product = {
    ...(inventoryPayload.product ?? {}),
    imageUrls: photoUrls,
  }

  const putResponse = await fetch(
    `https://api.ebay.com/sell/inventory/v1/inventory_item/${encodedSku}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Language": "en-US",
        Accept: "application/json",
      },
      body: JSON.stringify(inventoryPayload),
    },
  )

  const putText = await putResponse.text()

  if (!putResponse.ok) {
    throw new Error(
      `eBay Inventory PUT failed for SKU ${sku}: ${putText}`
    )
  }

  return {
    success: true,
    method: "inventory",
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

    const sku = String(
      body.sku ?? ""
    ).trim()

    const photoUrls = Array.isArray(body.photoUrls)
      ? body.photoUrls
          .map((value: unknown) => String(value ?? "").trim())
          .filter(Boolean)
      : []

    if (!ebayItemId) {
      throw new Error("Missing eBay item ID")
    }

    if (!sku) {
      throw new Error("Missing SKU")
    }

    if (photoUrls.length === 0) {
      throw new Error("At least one photo URL is required")
    }

    const accessToken = await getAccessToken()

    const tradingResult =
      await reviseTradingApiPhotos(
        accessToken,
        ebayItemId,
        photoUrls,
      )

    if (tradingResult.success) {
      return new Response(
        JSON.stringify({
          success: true,
          ebay_item_id: ebayItemId,
          sku,
          photo_count: photoUrls.length,
          method: "trading",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      )
    }

    const tradingError =
      String(tradingResult.error ?? "")

    const inventoryManaged =
      tradingError
        .toLowerCase()
        .includes("inventory-based listing management")

    if (!inventoryManaged) {
      throw new Error(tradingError)
    }

    await reviseInventoryApiPhotos(
      accessToken,
      sku,
      photoUrls,
    )

    return new Response(
      JSON.stringify({
        success: true,
        ebay_item_id: ebayItemId,
        sku,
        photo_count: photoUrls.length,
        method: "inventory",
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
