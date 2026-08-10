const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
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
    const categoryId = clean(category.categoryId)

    const price =
      typeof part.listPrice === "number"
        ? part.listPrice
        : Number(part.listPrice ?? 0)

    const quantity =
      typeof part.quantity === "number"
        ? part.quantity
        : Number(part.quantity ?? 1)

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

      condition: clean(part.condition) || "Used",

      partNumber: clean(part.partNumber),
      interchangeNumber: clean(part.interchangeNumber),
      brand: clean(part.brand),

      photos: photoUrls,

      itemSpecifics:
        draft.itemSpecifics &&
        typeof draft.itemSpecifics === "object"
          ? draft.itemSpecifics
          : {},
    }

    /*
      SAFETY LOCK:

      This function does NOT call eBay's createOrReplaceInventoryItem,
      createOffer, or publishOffer endpoints yet.

      We first validate the exact payload Texas OEM OS intends to send.
    */

    return Response.json(
      {
        success: validationErrors.length === 0,
        mode: "PREVIEW_ONLY",
        readyForEbay: validationErrors.length === 0,
        validationErrors,
        preview,
        message:
          validationErrors.length === 0
            ? "Publisher payload validated. Nothing was sent to eBay."
            : "Publisher payload is incomplete. Nothing was sent to eBay.",
      },
      { headers: corsHeaders },
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        mode: "PREVIEW_ONLY",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500, headers: corsHeaders },
    )
  }
})
