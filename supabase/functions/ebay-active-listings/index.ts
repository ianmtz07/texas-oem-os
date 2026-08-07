const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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

  if (!response.ok) {
    throw new Error(`eBay listing request failed: ${await response.text()}`)
  }

  return await response.text()
}

function extractBlock(xml: string, name: string) {
  const match = xml.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`),
  )

  return match?.[1] ?? ""
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

function tag(xml: string, name: string) {
  return decodeXml(extractBlock(xml, name))
}

function parseActiveList(xml: string) {
  const activeList = extractBlock(xml, "ActiveList")
  const itemArray = extractBlock(activeList, "ItemArray")

  const itemMatches =
    itemArray.match(/<Item(?:\s[^>]*)?>[\s\S]*?<\/Item>/g) ?? []

  const listings = itemMatches.map((itemXml) => {
    const sellingStatus = extractBlock(itemXml, "SellingStatus")

    return {
      ebay_item_id: tag(itemXml, "ItemID"),
      sku: tag(itemXml, "SKU") || null,
      title: tag(itemXml, "Title"),
      price: Number(tag(sellingStatus, "CurrentPrice") || 0),
      quantity_available: Number(tag(itemXml, "QuantityAvailable") || 0),
      ebay_status: "active",
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase service-role configuration")
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const accessToken = await getAccessToken()

    const firstXml = await getPage(accessToken, 1)
    const first = parseActiveList(firstXml)

    let listings = first.listings

    for (let page = 2; page <= first.totalPages; page++) {
      const xml = await getPage(accessToken, page)
      listings = listings.concat(parseActiveList(xml).listings)
    }

    const uniqueListings = Array.from(
      new Map(listings.map((x) => [x.ebay_item_id, x])).values(),
    )

    const now = new Date().toISOString()

    const rows = uniqueListings.map((listing) => ({
      ...listing,
      last_synced_at: now,
      updated_at: now,
    }))

    const { error: upsertError } = await supabase
      .from("ebay_listings")
      .upsert(rows, {
        onConflict: "ebay_item_id",
      })

    if (upsertError) {
      throw new Error(`Supabase upsert failed: ${upsertError.message}`)
    }

    const activeIds = uniqueListings.map((x) => x.ebay_item_id)

    const { data: existingRows, error: existingError } = await supabase
      .from("ebay_listings")
      .select("ebay_item_id")
      .eq("ebay_status", "active")

    if (existingError) {
      throw new Error(`Existing-listing check failed: ${existingError.message}`)
    }

    const endedIds = (existingRows ?? [])
      .map((row) => row.ebay_item_id)
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
        throw new Error(`Ended-listing update failed: ${endedError.message}`)
      }
    }

    return Response.json({
      success: true,
      ebayTotal: first.totalEntries,
      received: listings.length,
      unique: uniqueListings.length,
      stored: rows.length,
      markedEnded: endedIds.length,
      matchesExpectedTotal: uniqueListings.length === first.totalEntries,
    }, { headers: corsHeaders })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: String(error),
      },
      { status: 500, headers: corsHeaders },
    )
  }
})
