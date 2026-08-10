const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
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
    throw new Error(`eBay token refresh failed: ${JSON.stringify(data)}`)
  }

  return String(data.access_token)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return Response.json(
      { success: false, error: "Method not allowed" },
      { status: 405, headers: corsHeaders },
    )
  }

  try {
    const body = await req.json().catch(() => ({}))

    const mode = clean(body.mode) || "PREVIEW_ONLY"

    const part = body.part && typeof body.part === "object"
      ? body.part
      : {}

    const draft = body.draft && typeof body.draft === "object"
      ? body.draft
      : {}

    const category = body.category && typeof body.category === "object"
      ? body.category
      : {}

    const photoUrls = Array.isArray(body.photoUrls)
      ? body.photoUrls
          .filter((value: unknown) => typeof value === "string")
          .map((value: string) => value.trim())
          .filter(Boolean)
      : []

    const sku = clean(part.sku)
    const title = clean(draft.title)
    const description = clean(draft.description)
    const conditionDescription = clean(draft.conditionDescription)
    const categoryId = clean(category.categoryId)

    const price =
      typeof part.listPrice === "number"
        ? part.listPrice
        : Number(part.listPrice ?? 0)

    const quantity =
      typeof part.quantity === "number"
        ? part.quantity
        : Number(part.quantity ?? 1)

    const brand = clean(part.brand) || "OEM"
    const partNumber = clean(part.partNumber)

    const validationErrors: string[] = []

    if (!sku) validationErrors.push("SKU is required")
    if (!title) validationErrors.push("Listing title is required")
    if (!description) validationErrors.push("Description is required")
    if (!categoryId) validationErrors.push("eBay category ID is required")
    if (!Number.isFinite(price) || price <= 0) {
      validationErrors.push("List price must be greater than $0")
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      validationErrors.push("Quantity must be at least 1")
    }
    if (photoUrls.length === 0) {
      validationErrors.push("At least one listing photo is required")
    }

    const aspects: Record<string, string[]> = {}

    const draftSpecifics =
      draft.itemSpecifics &&
      typeof draft.itemSpecifics === "object"
        ? draft.itemSpecifics
        : {}

    for (const [key, value] of Object.entries(draftSpecifics)) {
      if (typeof value === "string" && value.trim()) {
        aspects[key] = [value.trim()]
      } else if (Array.isArray(value)) {
        const values = value
          .filter((item) => typeof item === "string" && item.trim())
          .map((item) => String(item).trim())

        if (values.length) {
          aspects[key] = values
        }
      }
    }

    if (!aspects["Brand"]) {
      aspects["Brand"] = [brand]
    }

    if (partNumber) {
      if (!aspects["Manufacturer Part Number"]) {
        aspects["Manufacturer Part Number"] = [partNumber]
      }
      if (!aspects["OE/OEM Part Number"]) {
        aspects["OE/OEM Part Number"] = [partNumber]
      }
    }

    if (validationErrors.length > 0) {
      return Response.json(
        {
          success: false,
          mode,
          readyForEbay: false,
          validationErrors,
          message: "Nothing was sent to eBay.",
        },
        { headers: corsHeaders },
      )
    }

    const preview = {
      marketplaceId: "EBAY_US",
      merchantLocationKey: "texas-oem-main",
      sku,
      title: title.slice(0, 80),
      description,
      categoryId,
      price: {
        value: price.toFixed(2),
        currency: "USD",
      },
      quantity,
      photos: photoUrls,
      aspects,
    }

    if (mode !== "CREATE_DRAFT") {
      return Response.json(
        {
          success: true,
          mode: "PREVIEW_ONLY",
          readyForEbay: true,
          validationErrors: [],
          preview,
          message: "Publisher payload validated. Nothing was sent to eBay.",
        },
        { headers: corsHeaders },
      )
    }

    const accessToken = await getAccessToken()

    const inventoryPayload = {
      availability: {
        shipToLocationAvailability: {
          quantity,
        },
      },
      condition: "USED_GOOD",
      conditionDescription:
        conditionDescription ||
        "Used OEM automotive part. See photos and description for condition details.",
      product: {
        title: title.slice(0, 80),
        description,
        aspects,
        imageUrls: photoUrls,
      },
    }

    const inventoryResponse = await fetch(
      `https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Accept-Language": "en-US",
          "Content-Language": "en-US",
        },
        body: JSON.stringify(inventoryPayload),
      },
    )

    const inventoryText = await inventoryResponse.text()

    if (!inventoryResponse.ok) {
      return Response.json(
        {
          success: false,
          mode: "CREATE_DRAFT",
          stage: "inventory-item",
          ebayHttp: inventoryResponse.status,
          ebayResponse: inventoryText,
        },
        { headers: corsHeaders },
      )
    }

    const offerPayload = {
      sku,
      marketplaceId: "EBAY_US",
      format: "FIXED_PRICE",
      availableQuantity: quantity,
      categoryId,
      merchantLocationKey: "texas-oem-main",
      listingDescription: description,
      listingDuration: "GTC",
      pricingSummary: {
        price: {
          value: price.toFixed(2),
          currency: "USD",
        },
      },
      listingPolicies: {
        fulfillmentPolicyId: "251652756013",
        paymentPolicyId: "236649486013",
        returnPolicyId: "236649485013",
      },
    }

    const offerResponse = await fetch(
      "https://api.ebay.com/sell/inventory/v1/offer",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Accept-Language": "en-US",
          "Content-Language": "en-US",
        },
        body: JSON.stringify(offerPayload),
      },
    )

    const offerText = await offerResponse.text()

    let offerData: Record<string, unknown> = {}

    try {
      offerData = offerText
        ? JSON.parse(offerText) as Record<string, unknown>
        : {}
    } catch {
      offerData = {}
    }

    if (!offerResponse.ok) {
      return Response.json(
        {
          success: false,
          mode: "CREATE_DRAFT",
          stage: "offer",
          ebayHttp: offerResponse.status,
          ebayResponse: offerText,
        },
        { headers: corsHeaders },
      )
    }

    return Response.json(
      {
        success: true,
        mode: "CREATE_DRAFT",
        inventoryItemCreated: true,
        offerCreated: true,
        offerId: String(offerData.offerId ?? ""),
        sku,
        categoryId,
        price: price.toFixed(2),
        message:
          "eBay inventory item and unpublished offer created. Nothing is live yet.",
      },
      { headers: corsHeaders },
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500, headers: corsHeaders },
    )
  }
})
