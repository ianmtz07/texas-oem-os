import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

async function getAccessToken() {
  const clientId = Deno.env.get("EBAY_CLIENT_ID") ?? ""
  const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET") ?? ""
  const refreshToken = Deno.env.get("EBAY_REFRESH_TOKEN") ?? ""

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
    throw new Error(`Token refresh failed: ${await response.text()}`)
  }

  const data = await response.json()
  return data.access_token
}

async function getPage(accessToken: string, page: number) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>200</EntriesPerPage>
      <PageNumber>${page}</PageNumber>
    </Pagination>
  </ActiveList>
  <DetailLevel>ReturnAll</DetailLevel>
</GetMyeBaySellingRequest>`

  const response = await fetch("https://api.ebay.com/ws/api.dll", {
    method: "POST",
    headers: {
      "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
      "X-EBAY-API-IAF-TOKEN": accessToken,
      "Content-Type": "text/xml",
    },
    body: xml,
  })

  const text = await response.text()

  if (!response.ok) {
    throw new Error(`eBay listing request failed: ${text}`)
  }

  return text
}


type EbayPaidSale = {
  ebay_item_id: string
  sku: string | null
  title: string
  sale_price: number
  sold_at: string | null
  order_id: string
}

async function getPaidOrders(
  accessToken: string,
) {
  /*
   * Fulfillment API only returns transactions
   * that completed checkout.
   *
   * We still verify PAID status and reject
   * cancelled orders before treating anything
   * as a Texas OEM sale.
   */
  const orders: Record<string, unknown>[] = []
  const limit = 200

  for (
    let offset = 0;
    ;
    offset += limit
  ) {
    const url =
      new URL(
        "https://api.ebay.com/sell/fulfillment/v1/order",
      )

    url.searchParams.set(
      "limit",
      String(limit),
    )

    url.searchParams.set(
      "offset",
      String(offset),
    )

    const response =
      await fetch(
        url.toString(),
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
            "Content-Type":
              "application/json",
          },
        },
      )

    if (!response.ok) {
      throw new Error(
        `eBay order request failed (${response.status}): ${await response.text()}`,
      )
    }

    const json =
      await response.json() as {
        orders?: Record<string, unknown>[]
        total?: number
      }

    const pageOrders =
      Array.isArray(json.orders)
        ? json.orders
        : []

    orders.push(...pageOrders)

    const total =
      Number(
        json.total ?? 0,
      )

    if (
      pageOrders.length === 0 ||
      orders.length >= total
    ) {
      break
    }
  }

  return orders
}

function parsePaidSales(
  orders: Record<string, unknown>[],
) {
  const sales: EbayPaidSale[] = []

  for (const order of orders) {
    const paymentStatus =
      String(
        order.orderPaymentStatus ??
        "",
      ).toUpperCase()

    const cancelStatus =
      (
        order.cancelStatus &&
        typeof order.cancelStatus === "object"
          ? order.cancelStatus as Record<string, unknown>
          : {}
      )

    const cancelState =
      String(
        cancelStatus.cancelState ??
        "",
      ).toUpperCase()

    if (
      paymentStatus !== "PAID" ||
      cancelState === "CANCELED"
    ) {
      continue
    }

    const orderId =
      String(
        order.orderId ??
        "",
      )

    const paymentSummary =
      (
        order.paymentSummary &&
        typeof order.paymentSummary === "object"
          ? order.paymentSummary as Record<string, unknown>
          : {}
      )

    const payments =
      Array.isArray(
        paymentSummary.payments,
      )
        ? paymentSummary.payments as Record<string, unknown>[]
        : []

    const paidPayment =
      payments.find(
        (payment) =>
          String(
            payment.paymentStatus ??
            "",
          ).toUpperCase() ===
          "PAID",
      )

    const soldAt =
      paidPayment
        ? String(
            paidPayment.paymentDate ??
            "",
          ) || null
        : null

    const lineItems =
      Array.isArray(
        order.lineItems,
      )
        ? order.lineItems as Record<string, unknown>[]
        : []

    for (const lineItem of lineItems) {
      const legacyItemId =
        String(
          lineItem.legacyItemId ??
          "",
        ).trim()

      if (!legacyItemId) {
        continue
      }

      const lineItemCost =
        (
          lineItem.lineItemCost &&
          typeof lineItem.lineItemCost === "object"
            ? lineItem.lineItemCost as Record<string, unknown>
            : {}
        )

      const quantity =
        Math.max(
          1,
          Number(
            lineItem.quantity ?? 1,
          ) || 1,
        )

      const totalLinePrice =
        Number(
          lineItemCost.value ?? 0,
        )

      const perUnitPrice =
        totalLinePrice > 0
          ? totalLinePrice / quantity
          : 0

      sales.push({
        ebay_item_id:
          legacyItemId,

        sku:
          String(
            lineItem.sku ?? "",
          ).trim() ||
          null,

        title:
          String(
            lineItem.title ?? "",
          ).trim(),

        sale_price:
          Number.isFinite(
            perUnitPrice,
          )
            ? perUnitPrice
            : 0,

        sold_at:
          soldAt,

        order_id:
          orderId,
      })
    }
  }

  return sales
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function extractBlock(xml: string, name: string) {
  const match = xml.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`),
  )

  return match?.[1] ?? ""
}

function tag(xml: string, name: string) {
  return decodeXml(extractBlock(xml, name))
}

function allTags(xml: string, name: string) {
  const regex = new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,
    "g",
  )

  return Array.from(xml.matchAll(regex))
    .map((match) => decodeXml(match[1] ?? ""))
    .filter(Boolean)
}

function parseActiveList(xml: string) {
  const activeList = extractBlock(xml, "ActiveList")
  const itemArray = extractBlock(activeList, "ItemArray")

  const itemMatches =
    itemArray.match(/<Item(?:\s[^>]*)?>[\s\S]*?<\/Item>/g) ?? []

  const listings = itemMatches.map((itemXml) => {
    const sellingStatus = extractBlock(itemXml, "SellingStatus")
    const pictureDetails = extractBlock(itemXml, "PictureDetails")

    return {
      ebay_item_id: tag(itemXml, "ItemID"),
      sku: tag(itemXml, "SKU") || null,
      title: tag(itemXml, "Title"),
      price: Number(tag(sellingStatus, "CurrentPrice") || 0),
      quantity_available: Number(tag(itemXml, "QuantityAvailable") || 0),
      ebay_status: "active",
      pictures: allTags(pictureDetails, "PictureURL"),
    }
  })

  const pagination = extractBlock(activeList, "PaginationResult")

  return {
    listings,
    totalPages: Number(tag(pagination, "TotalNumberOfPages") || 0),
    totalEntries: Number(tag(pagination, "TotalNumberOfEntries") || 0),
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase service-role configuration")
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const accessToken = await getAccessToken()

    /*
     * PAID ORDER DISCOVERY
     *
     * Read-only for now.
     * We intentionally do not mutate any inventory
     * until we prove the current eBay OAuth token
     * can access Fulfillment orders correctly.
     */
    let paidSales: EbayPaidSale[] = []
    let paidOrderError: string | null = null

    try {
      const paidOrders =
        await getPaidOrders(
          accessToken,
        )

      paidSales =
        parsePaidSales(
          paidOrders,
        )
    } catch (error) {
      paidOrderError =
        error instanceof Error
          ? error.message
          : String(error)

      console.warn(
        "Paid-order discovery skipped:",
        paidOrderError,
      )
    }

    const firstXml = await getPage(accessToken, 1)
    const first = parseActiveList(firstXml)

    let listings = first.listings

    for (let page = 2; page <= first.totalPages; page++) {
      const xml = await getPage(accessToken, page)
      listings = listings.concat(parseActiveList(xml).listings)
    }

    const uniqueListings = Array.from(
      new Map(
        listings.map((listing) => [
          listing.ebay_item_id,
          listing,
        ]),
      ).values(),
    )

    const now = new Date().toISOString()

    const listingRows = uniqueListings.map((listing) => ({
      ebay_item_id: listing.ebay_item_id,
      sku: listing.sku,
      title: listing.title,
      price: listing.price,
      quantity_available: listing.quantity_available,
      ebay_status: listing.ebay_status,
      last_synced_at: now,
      updated_at: now,
    }))

    const { error: upsertError } = await supabase
      .from("ebay_listings")
      .upsert(listingRows, {
        onConflict: "ebay_item_id",
      })

    if (upsertError) {
      throw new Error(
        `Supabase listing upsert failed: ${upsertError.message}`,
      )
    }

    const activeIds = uniqueListings.map(
      (listing) => listing.ebay_item_id,
    )

    const { data: existingRows, error: existingError } =
      await supabase
        .from("ebay_listings")
        .select("ebay_item_id")
        .eq("ebay_status", "active")

    if (existingError) {
      throw new Error(
        `Existing-listing check failed: ${existingError.message}`,
      )
    }

    const endedIds = (existingRows ?? [])
      .map((row) => String(row.ebay_item_id))
      .filter((id) => !activeIds.includes(id))

    if (endedIds.length > 0) {
      const { error: endedError } = await supabase
        .from("ebay_listings")
        .update({
          ebay_status: "ended",
          last_synced_at: now,
          updated_at: now,
        })
        .in("ebay_item_id", endedIds)

      if (endedError) {
        throw new Error(
          `Ended-listing update failed: ${endedError.message}`,
        )
      }
    }

    // -------------------------------------------------------
    // CONNECT EBAY ITEM IDS TO PART IDS
    // -------------------------------------------------------

    const { data: linkedListings, error: linkedError } =
      await supabase
        .from("ebay_listings")
        .select("ebay_item_id, matched_part_id")
        .not("matched_part_id", "is", null)

    if (linkedError) {
      throw new Error(
        `Unable to load listing/part links: ${linkedError.message}`,
      )
    }

    const partByItemId = new Map(
      (linkedListings ?? []).map((row) => [
        String(row.ebay_item_id),
        String(row.matched_part_id),
      ]),
    )

    // -------------------------------------------------------
    // APPLY CONFIRMED PAID EBAY SALES
    // -------------------------------------------------------
    //
    // IMPORTANT:
    // A listing disappearing from ActiveList is NOT enough
    // to mark inventory sold.
    //
    // Only Fulfillment API orders that parsed as PAID and
    // non-cancelled are allowed to mutate sale records.
    // -------------------------------------------------------

    const confirmedSoldItemIds =
      Array.from(
        new Set(
          paidSales.map(
            (sale) =>
              sale.ebay_item_id,
          ),
        ),
      )

    if (
      confirmedSoldItemIds.length > 0
    ) {
      const { error: soldListingError } =
        await supabase
          .from("ebay_listings")
          .update({
            ebay_status: "sold",
            last_synced_at: now,
            updated_at: now,
          })
          .in(
            "ebay_item_id",
            confirmedSoldItemIds,
          )

      if (soldListingError) {
        throw new Error(
          `Unable to mark eBay listings sold: ${soldListingError.message}`,
        )
      }
    }

    let partsMarkedSold = 0

    for (const sale of paidSales) {
      const partId =
        partByItemId.get(
          sale.ebay_item_id,
        )

      if (!partId) {
        continue
      }

      const soldAt =
        sale.sold_at ??
        now

      const { error: partSaleError } =
        await supabase
          .from("parts")
          .update({
            sold: true,
            sale_price:
              sale.sale_price,
            sold_at:
              soldAt,
          })
          .eq(
            "id",
            partId,
          )

      if (partSaleError) {
        throw new Error(
          `Unable to mark part sold for eBay item ${sale.ebay_item_id}: ${partSaleError.message}`,
        )
      }

      partsMarkedSold += 1
    }

    // -------------------------------------------------------
    // BUILD PART_PHOTOS RECORDS FROM EBAY PICTUREURL VALUES
    // -------------------------------------------------------

    const photoRows: Array<{
      part_id: string
      storage_path: string
      public_url: string
      is_primary: boolean
      sort_order: number
    }> = []

    for (const listing of uniqueListings) {
      const partId = partByItemId.get(listing.ebay_item_id)

      if (!partId) continue

      listing.pictures.forEach((url, index) => {
        photoRows.push({
          part_id: partId,
          storage_path:
            `ebay/${listing.ebay_item_id}/${index + 1}`,
          public_url: url,
          is_primary: index === 0,
          sort_order: index,
        })
      })
    }

    // Insert in chunks so large stores do not exceed request limits.
    const chunkSize = 500

    for (let i = 0; i < photoRows.length; i += chunkSize) {
      const chunk = photoRows.slice(i, i + chunkSize)

      const { error: photoError } = await supabase
        .from("part_photos")
        .upsert(chunk, {
          onConflict: "part_id,storage_path",
        })

      if (photoError) {
        throw new Error(
          `Photo import failed: ${photoError.message}`,
        )
      }
    }

    // Mark parts with imported photos as photographed.
    const photographedPartIds = Array.from(
      new Set(photoRows.map((photo) => photo.part_id)),
    )

    if (photographedPartIds.length > 0) {
      const { error: photographedError } = await supabase
        .from("parts")
        .update({ photographed: true })
        .in("id", photographedPartIds)

      if (photographedError) {
        throw new Error(
          `Unable to mark parts photographed: ${photographedError.message}`,
        )
      }
    }

    return Response.json(
      {
        success: true,
        ebayTotal: first.totalEntries,
        received: listings.length,
        unique: uniqueListings.length,
        stored: listingRows.length,
        markedEnded: endedIds.length,
        paidSalesFound: paidSales.length,
        paidOrderError,
        confirmedSoldListings:
          confirmedSoldItemIds.length,
        partsMarkedSold,
        paidSalesPreview:
          paidSales
            .slice(0, 10)
            .map((sale) => ({
              ebay_item_id:
                sale.ebay_item_id,
              sku:
                sale.sku,
              title:
                sale.title,
              sale_price:
                sale.sale_price,
              sold_at:
                sale.sold_at,
              order_id:
                sale.order_id,
            })),
        photosFound: photoRows.length,
        partsWithPhotos: photographedPartIds.length,
        matchesExpectedTotal:
          uniqueListings.length === first.totalEntries,
      },
      { headers: corsHeaders },
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: String(error),
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }
})
