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
  buyer_username: string | null
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

    const buyer =
      (
        order.buyer &&
        typeof order.buyer === "object"
          ? order.buyer as Record<string, unknown>
          : {}
      )

    const buyerUsername =
      String(
        buyer.username ??
        "",
      ).trim() ||
      null

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

        buyer_username:
          buyerUsername,
      })
    }
  }

  return sales
}

// -------------------------------------------------------
// BUYER MESSAGE AUTOMATION — DRY RUN
// -------------------------------------------------------
//
// IMPORTANT:
// Only orders paid AFTER this cutoff are eligible.
// This prevents historical Texas OEM orders from suddenly
// receiving automated messages when the feature launches.
//
// Dry-run mode NEVER contacts a buyer.
// -------------------------------------------------------

const BUYER_MESSAGE_AUTOMATION_ENABLED = true

const BUYER_MESSAGE_ACTIVATION_CUTOFF =
  "2026-08-17T15:56:02.827Z"

function isFreightDrivetrainSale(
  sale: EbayPaidSale,
) {
  const sku =
    String(
      sale.sku ?? "",
    )
      .trim()
      .toUpperCase()

  // Production Texas OEM SKU examples:
  // TX-20260817-0001-ENG-001
  // TX-20260817-0001-TRN-001
  //
  // Do NOT classify freight from title words alone.
  // "Engine Air Cleaner Duct" is not an engine.
  return /-(ENG|TRN)-\d{3}$/.test(sku)
}

function buildPaidOrderBuyerMessage(
  sale: EbayPaidSale,
) {
  const isFreight =
    isFreightDrivetrainSale(sale)

  const orderId =
    sale.order_id

  if (isFreight) {
    return {
      message_type:
        "paid_order_welcome",
      is_freight:
        true,
      freight_confirmation_status:
        "awaiting_confirmation",
      subject:
        `Thank You for Your Order - ${orderId}`,
      message_text:
        `Hello, and thank you for your order! We appreciate your business with Texas OEM Parts. Your order #${orderId} has been received and payment has been confirmed. We are currently preparing your item for freight shipment.\n\nBefore we arrange freight, please confirm your preferred delivery method: (1) delivery to a commercial business address with forklift or loading-dock access, or (2) pickup from your nearest freight terminal.\n\nIf using a commercial address, please confirm the business name and that forklift or dock access is available. If you prefer terminal pickup, we will arrange shipment to the nearest available freight terminal.\n\nWe aim to have your order prepared for shipment by the next business day. Freight and tracking information will be added to your eBay order as soon as it is available.\n\nIf you have any questions or concerns, please message us through eBay. Thank you for choosing Texas OEM Parts!`,
    }
  }

  return {
    message_type:
      "paid_order_welcome",
    is_freight:
      false,
    freight_confirmation_status:
      "not_required",
    subject:
      `Thank You for Your Order - ${orderId}`,
    message_text:
      `Hello, and thank you for your order! We appreciate your business with Texas OEM Parts. Your order #${orderId} has been received and payment has been confirmed. We are currently preparing your item for shipment and aim to have it shipped by the next business day.\n\nTracking information will be uploaded to your eBay order as soon as your package is on the way.\n\nIf you have any questions or concerns, please do not hesitate to message us through eBay. We are happy to help.\n\nThank you for choosing Texas OEM Parts!`,
  }
}

function buildBuyerMessageDryRun(
  paidSales: EbayPaidSale[],
) {
  const cutoff =
    Date.parse(
      BUYER_MESSAGE_ACTIVATION_CUTOFF,
    )

  return paidSales
    .filter((sale) => {
      if (
        !sale.sold_at ||
        !sale.buyer_username ||
        !sale.order_id ||
        !sale.ebay_item_id
      ) {
        return false
      }

      const soldAt =
        Date.parse(sale.sold_at)

      return (
        Number.isFinite(soldAt) &&
        soldAt > cutoff
      )
    })
    .map((sale) => {
      const message =
        buildPaidOrderBuyerMessage(
          sale,
        )

      return {
        ebay_order_id:
          sale.order_id,
        ebay_item_id:
          sale.ebay_item_id,
        buyer_username:
          sale.buyer_username,
        sku:
          sale.sku,
        title:
          sale.title,
        sold_at:
          sale.sold_at,
        automation_enabled:
          BUYER_MESSAGE_AUTOMATION_ENABLED,
        ...message,
      }
    })
}

async function runBuyerMessageAutomation(
  paidSales: EbayPaidSale[],
  supabaseUrl: string,
  serviceRoleKey: string,
) {
  const candidates =
    buildBuyerMessageDryRun(
      paidSales,
    )

  if (!BUYER_MESSAGE_AUTOMATION_ENABLED) {
    return {
      mode: "dry_run",
      candidates,
      results: [],
    }
  }

  const results: Record<string, unknown>[] = []

  for (const candidate of candidates) {
    try {
      const response =
        await fetch(
          `${supabaseUrl}/functions/v1/ebay-send-message`,
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${serviceRoleKey}`,
              apikey:
                serviceRoleKey,
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              ebay_order_id:
                candidate.ebay_order_id,
              ebay_item_id:
                candidate.ebay_item_id,
              buyer_username:
                candidate.buyer_username,
              message_type:
                candidate.message_type,
              subject:
                candidate.subject,
              message_text:
                candidate.message_text,
              is_freight:
                candidate.is_freight,
              freight_confirmation_status:
                candidate.freight_confirmation_status,
            }),
          },
        )

      const responseText =
        await response.text()

      let responseJson:
        Record<string, unknown> | null =
        null

      try {
        responseJson =
          JSON.parse(
            responseText,
          ) as Record<string, unknown>
      } catch {
        responseJson = null
      }

      results.push({
        ebay_order_id:
          candidate.ebay_order_id,
        ebay_item_id:
          candidate.ebay_item_id,
        buyer_username:
          candidate.buyer_username,
        is_freight:
          candidate.is_freight,
        http_status:
          response.status,
        ok:
          response.ok,
        response:
          responseJson ??
          responseText,
      })
    } catch (error) {
      results.push({
        ebay_order_id:
          candidate.ebay_order_id,
        ebay_item_id:
          candidate.ebay_item_id,
        buyer_username:
          candidate.buyer_username,
        is_freight:
          candidate.is_freight,
        ok:
          false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      })
    }
  }

  return {
    mode: "live",
    candidates,
    results,
  }
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
    // BUYER COMMUNICATION AUTOMATION
    // -------------------------------------------------------
    //
    // MASTER SWITCH IS CURRENTLY FALSE.
    // In dry-run mode this performs ZERO buyer sends.
    // -------------------------------------------------------

    const buyerMessageAutomation =
      await runBuyerMessageAutomation(
        paidSales,
        supabaseUrl,
        serviceRoleKey,
      )

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
        buyerMessageAutomationEnabled:
          BUYER_MESSAGE_AUTOMATION_ENABLED,
        buyerMessageActivationCutoff:
          BUYER_MESSAGE_ACTIVATION_CUTOFF,
        buyerMessageDryRun:
          buildBuyerMessageDryRun(paidSales),
        buyerMessageAutomation:
          buyerMessageAutomation,
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
              buyer_username:
                sale.buyer_username,
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
