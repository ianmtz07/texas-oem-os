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

async function getPictures(accessToken: string, itemId: string) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${itemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`

  const response = await fetch("https://api.ebay.com/ws/api.dll", {
    method: "POST",
    headers: {
      "X-EBAY-API-CALL-NAME": "GetItem",
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
      "X-EBAY-API-IAF-TOKEN": accessToken,
      "Content-Type": "text/xml",
    },
    body: xml,
  })

  const text = await response.text()

  const ack =
    text.match(/<Ack>(.*?)<\/Ack>/)?.[1] ?? "NONE"

  if (ack !== "Success" && ack !== "Warning") {
    return []
  }

  return Array.from(
    text.matchAll(/<PictureURL>(.*?)<\/PictureURL>/g),
  )
    .map((match) => decodeXml(match[1] ?? ""))
    .filter(Boolean)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)

    const offset = Math.max(
      0,
      Number(url.searchParams.get("offset") ?? 0),
    )

    const limit = Math.min(
      25,
      Math.max(1, Number(url.searchParams.get("limit") ?? 25)),
    )

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
    )

    const { count: total, error: countError } = await supabase
      .from("ebay_listings")
      .select("*", { count: "exact", head: true })
      .not("matched_part_id", "is", null)

    if (countError) {
      throw countError
    }

    const { data: listings, error: listingError } =
      await supabase
        .from("ebay_listings")
        .select("ebay_item_id, matched_part_id")
        .not("matched_part_id", "is", null)
        .order("ebay_item_id", { ascending: true })
        .range(offset, offset + limit - 1)

    if (listingError) {
      throw listingError
    }

    const accessToken = await getAccessToken()

    let listingsProcessed = 0
    let photosImported = 0
    let partsWithPhotos = 0

    for (const listing of listings ?? []) {
      const itemId = String(listing.ebay_item_id)
      const partId = String(listing.matched_part_id)

      const pictures = await getPictures(
        accessToken,
        itemId,
      )

      listingsProcessed += 1

      if (pictures.length === 0) {
        continue
      }

      const photoRows = pictures.map((pictureUrl, index) => ({
        part_id: partId,
        storage_path: `ebay/${itemId}/${index + 1}`,
        public_url: pictureUrl,
        is_primary: index === 0,
        sort_order: index,
      }))

      const { error: photoError } = await supabase
        .from("part_photos")
        .upsert(photoRows, {
          onConflict: "part_id,storage_path",
        })

      if (photoError) {
        throw new Error(
          `Photo save failed for ${itemId}: ${photoError.message}`,
        )
      }

      await supabase
        .from("parts")
        .update({ photographed: true })
        .eq("id", partId)

      photosImported += photoRows.length
      partsWithPhotos += 1
    }

    const nextOffset = offset + listingsProcessed
    const done = nextOffset >= Number(total ?? 0)

    return Response.json(
      {
        success: true,
        totalListings: total ?? 0,
        offset,
        listingsProcessed,
        photosImported,
        partsWithPhotos,
        nextOffset,
        done,
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
