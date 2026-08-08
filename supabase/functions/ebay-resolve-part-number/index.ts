const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function stripHtml(value: string) {
  return decodeXml(value)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function extractBlock(xml: string, name: string) {
  const match = xml.match(
    new RegExp(
      `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,
      "i",
    ),
  )

  return match?.[1] ?? ""
}

function tag(xml: string, name: string) {
  return decodeXml(extractBlock(xml, name))
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
      `Token refresh failed: ${await response.text()}`,
    )
  }

  const data = await response.json()

  if (!data.access_token) {
    throw new Error("eBay did not return an access token")
  }

  return String(data.access_token)
}

async function getItem(accessToken: string, itemId: string) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${itemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
</GetItemRequest>`

  const response = await fetch(
    "https://api.ebay.com/ws/api.dll",
    {
      method: "POST",
      headers: {
        "X-EBAY-API-CALL-NAME": "GetItem",
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
        "X-EBAY-API-IAF-TOKEN": accessToken,
        "Content-Type": "text/xml",
      },
      body: xml,
    },
  )

  const text = await response.text()
  const ack = tag(text, "Ack")

  if (
    !response.ok ||
    (ack !== "Success" && ack !== "Warning")
  ) {
    throw new Error(
      tag(text, "LongMessage") ||
        tag(text, "ShortMessage") ||
        `GetItem failed: ${ack || response.status}`,
    )
  }

  return text
}

type Candidate = {
  value: string
  source: string
  score: number
}

function normalizeCandidate(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/^[#:\-_.\s]+|[#:\-_.\s]+$/g, "")
}

function isLikelyPartNumber(
  raw: string,
  ebayItemId: string,
) {
  const value = normalizeCandidate(raw)

  if (!value) return false

  const compact =
    value.replace(/[^A-Z0-9]/g, "")

  if (compact.length < 5 || compact.length > 18) {
    return false
  }

  if (compact === ebayItemId.replace(/\D/g, "")) {
    return false
  }

  if (/^EBAY\d+$/i.test(compact)) return false

  if (/^(19|20)\d{2}$/.test(value)) return false

  if (/^\d{2}-\d{2}$/.test(value)) return false

  if (/^(19|20)\d{2}-(19|20)\d{2}$/.test(value)) {
    return false
  }

  // VINs are 17 characters and commonly contaminate descriptions.
  if (
    compact.length === 17 &&
    /^[A-HJ-NPR-Z0-9]{17}$/.test(compact)
  ) {
    return false
  }

  if (!/\d/.test(value)) return false

  return true
}

function extractTextCandidates(
  text: string,
  ebayItemId: string,
  source: string,
  baseScore: number,
) {
  const tokens =
    text
      .toUpperCase()
      .match(/\b[A-Z0-9][A-Z0-9._/-]{4,20}\b/g) ?? []

  return tokens
    .map(normalizeCandidate)
    .filter((value) =>
      isLikelyPartNumber(value, ebayItemId)
    )
    .map((value) => ({
      value,
      source,
      score:
        baseScore +
        (/^\d+$/.test(value) ? 20 : 10) +
        Math.min(value.replace(/[^A-Z0-9]/g, "").length, 12),
    }))
}

function extractItemSpecifics(
  xml: string,
  ebayItemId: string,
) {
  const specifics = extractBlock(xml, "ItemSpecifics")

  const blocks =
    specifics.match(
      /<NameValueList(?:\s[^>]*)?>[\s\S]*?<\/NameValueList>/gi,
    ) ?? []

  const candidates: Candidate[] = []

  for (const block of blocks) {
    const name = tag(block, "Name")
    const value = tag(block, "Value")

    const normalizedName = name.toLowerCase()

    const isPartNumberField =
      normalizedName.includes("manufacturer part") ||
      normalizedName.includes("oem") ||
      normalizedName.includes("oe part") ||
      normalizedName === "mpn" ||
      normalizedName.includes("interchange") ||
      normalizedName.includes("part number")

    if (
      isPartNumberField &&
      isLikelyPartNumber(value, ebayItemId)
    ) {
      candidates.push({
        value: normalizeCandidate(value),
        source: `Item Specific: ${name}`,
        score: 300,
      })
    }
  }

  return candidates
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
    const body =
      await req.json().catch(() => ({}))

    const ebayItemId = String(
      body.ebayItemId ??
        body.ebay_item_id ??
        "",
    ).trim()

    if (!ebayItemId) {
      throw new Error("Missing eBay item ID")
    }

    const accessToken =
      await getAccessToken()

    const xml =
      await getItem(accessToken, ebayItemId)

    const title =
      tag(xml, "Title")

    const description =
      stripHtml(
        extractBlock(xml, "Description"),
      )

    const candidates: Candidate[] = [
      ...extractItemSpecifics(
        xml,
        ebayItemId,
      ),

      ...extractTextCandidates(
        title,
        ebayItemId,
        "Title",
        200,
      ),

      ...extractTextCandidates(
        description,
        ebayItemId,
        "Description",
        100,
      ),
    ]

    const deduped =
      Array.from(
        new Map(
          candidates
            .sort(
              (a, b) =>
                b.score - a.score,
            )
            .map((candidate) => [
              candidate.value,
              candidate,
            ]),
        ).values(),
      ).slice(0, 12)

    return new Response(
      JSON.stringify({
        success: true,
        ebay_item_id: ebayItemId,
        title,
        candidates: deduped,
        candidate_count: deduped.length,
        scanned: {
          item_specifics: true,
          title: true,
          description: true,
        },
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
        : String(error)

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
        candidates: [],
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
