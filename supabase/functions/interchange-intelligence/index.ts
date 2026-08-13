import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function normalizePartNumber(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^[#:\-_.\s]+|[#:\-_.\s]+$/g, "")
}

function compactPartNumber(value: string) {
  return normalizePartNumber(value)
    .replace(/[^A-Z0-9]/g, "")
}


function normalizeInterchangeIdentity(
  value: string,
) {
  const normalized =
    normalizePartNumber(value)

  /*
   * Hollander-style numeric interchanges may appear
   * with zero padding after the dash:
   *
   * 591-04039
   * 591-4039
   *
   * Treat them as the same canonical identity.
   *
   * Preserve non-Hollander/OEM formats unchanged.
   */
  const match =
    normalized.match(
      /^(\d{3})-(\d+)$/,
    )

  if (!match) {
    return normalized
  }

  const prefix = match[1]

  const suffix =
    match[2].replace(
      /^0+(?=\d)/,
      '',
    )

  return `${prefix}-${suffix}`
}

function isLikelyPartNumber(
  raw: string,
  sourcePartNumber: string,
) {
  const value = normalizePartNumber(raw)
  const compact = compactPartNumber(value)
  const sourceCompact =
    compactPartNumber(sourcePartNumber)

  if (!compact) return false

  if (
    compact.length < 5 ||
    compact.length > 18
  ) {
    return false
  }

  if (compact === sourceCompact) {
    return false
  }

  if (!/\d/.test(compact)) {
    return false
  }

  // Reject standalone model years.
  if (/^(19|20)\d{2}$/.test(compact)) {
    return false
  }

  // Reject year ranges such as 2018-2020 and 18-21.
  if (
    /^(19|20)\d{2}[-/]?(19|20)\d{2}$/.test(value) ||
    /^\d{2}[-/]\d{2}$/.test(value)
  ) {
    return false
  }

  // Reject VIN-looking values.
  if (
    compact.length === 17 &&
    /^[A-HJ-NPR-Z0-9]{17}$/.test(compact)
  ) {
    return false
  }

  // Common words/noise that can look like identifiers.
  const blocked = new Set([
    "OEM",
    "USED",
    "NEW",
    "FRONT",
    "REAR",
    "LEFT",
    "RIGHT",
    "DRIVER",
    "PASSENGER",
    "ENGINE",
    "MOTOR",
    "MODULE",
    "RADIO",
    "CONTROL",
    "SWITCH",
    "ASSEMBLY",
  ])

  if (blocked.has(compact)) {
    return false
  }

  return true
}

function extractCandidatesFromTitle(
  title: string,
  sourcePartNumber: string,
) {
  const tokens =
    title
      .toUpperCase()
      .match(/\b[A-Z0-9][A-Z0-9._/-]{4,20}\b/g) ??
    []

  return Array.from(
    new Set(
      tokens
        .map(normalizePartNumber)
        .filter((value) =>
          isLikelyPartNumber(
            value,
            sourcePartNumber,
          )
        ),
    ),
  )
}

function calculateConfidence(
  evidenceCount: number,
  eligibleListingCount: number,
) {
  if (
    evidenceCount < 2 ||
    eligibleListingCount <= 0
  ) {
    return 0
  }

  const coverage =
    evidenceCount / eligibleListingCount

  let score = 35

  score += Math.min(evidenceCount, 6) * 7
  score += Math.min(coverage, 1) * 30

  if (evidenceCount >= 4) score += 5
  if (evidenceCount >= 6) score += 5

  return Math.min(
    99,
    Math.round(score),
  )
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

function extractBlock(
  xml: string,
  name: string,
) {
  const match =
    xml.match(
      new RegExp(
        `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,
        "i",
      ),
    )

  return match?.[1] ?? ""
}

function tag(
  xml: string,
  name: string,
) {
  return decodeXml(
    extractBlock(xml, name),
  )
}

async function getEbayUserToken() {
  const clientId =
    Deno.env.get("EBAY_CLIENT_ID") ?? ""

  const clientSecret =
    Deno.env.get("EBAY_CLIENT_SECRET") ?? ""

  const refreshToken =
    Deno.env.get("EBAY_REFRESH_TOKEN") ?? ""

  if (
    !clientId ||
    !clientSecret ||
    !refreshToken
  ) {
    throw new Error(
      "Missing eBay OAuth configuration",
    )
  }

  const basic =
    btoa(`${clientId}:${clientSecret}`)

  const body =
    new URLSearchParams()

  body.set(
    "grant_type",
    "refresh_token",
  )

  body.set(
    "refresh_token",
    refreshToken,
  )

  const response =
    await fetch(
      "https://api.ebay.com/identity/v1/oauth2/token",
      {
        method: "POST",
        headers: {
          Authorization:
            `Basic ${basic}`,
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body,
      },
    )

  if (!response.ok) {
    throw new Error(
      `eBay token refresh failed: ${await response.text()}`,
    )
  }

  const data =
    await response.json()

  if (!data.access_token) {
    throw new Error(
      "eBay did not return an access token",
    )
  }

  return String(
    data.access_token,
  )
}

function extractSpecificCandidates(
  xml: string,
  sourcePartNumber: string,
) {
  const specifics =
    extractBlock(
      xml,
      "ItemSpecifics",
    )

  const blocks =
    specifics.match(
      /<NameValueList(?:\s[^>]*)?>[\s\S]*?<\/NameValueList>/gi,
    ) ?? []

  const results: Array<{
    value: string
    field: string
  }> = []

  for (const block of blocks) {
    const name =
      tag(block, "Name")

    const value =
      tag(block, "Value")

    const normalizedName =
      name.toLowerCase()

    const relevant =
      normalizedName.includes(
        "manufacturer part",
      ) ||
      normalizedName.includes(
        "oem",
      ) ||
      normalizedName.includes(
        "oe part",
      ) ||
      normalizedName.includes(
        "interchange",
      ) ||
      normalizedName === "mpn" ||
      normalizedName.includes(
        "part number",
      )

    if (!relevant) {
      continue
    }

    const possibleValues =
      value
        .split(
          /[,;|/]+/,
        )
        .map(normalizePartNumber)
        .filter((candidate) =>
          isLikelyPartNumber(
            candidate,
            sourcePartNumber,
          )
        )

    for (
      const candidate of possibleValues
    ) {
      results.push({
        value: candidate,
        field: name,
      })
    }
  }

  return results
}

async function inspectActiveItem(
  accessToken: string,
  itemId: string,
  sourcePartNumber: string,
) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${itemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
</GetItemRequest>`

  const response =
    await fetch(
      "https://api.ebay.com/ws/api.dll",
      {
        method: "POST",
        headers: {
          "X-EBAY-API-CALL-NAME":
            "GetItem",
          "X-EBAY-API-SITEID":
            "0",
          "X-EBAY-API-COMPATIBILITY-LEVEL":
            "967",
          "X-EBAY-API-IAF-TOKEN":
            accessToken,
          "Content-Type":
            "text/xml",
        },
        body: xml,
      },
    )

  const text =
    await response.text()

  const ack =
    tag(text, "Ack")

  if (
    !response.ok ||
    (
      ack !== "Success" &&
      ack !== "Warning"
    )
  ) {
    return {
      item_id: itemId,
      success: false,
      error:
        tag(
          text,
          "LongMessage",
        ) ||
        tag(
          text,
          "ShortMessage",
        ) ||
        `GetItem failed: ${ack}`,
    }
  }

  const sellerBlock =
    extractBlock(
      text,
      "Seller",
    )

  const seller =
    tag(
      sellerBlock,
      "UserID",
    )

  const title =
    tag(
      text,
      "Title",
    )

  const itemSpecificCandidates =
    extractSpecificCandidates(
      text,
      sourcePartNumber,
    )

  const titleCandidates =
    extractCandidatesFromTitle(
      title,
      sourcePartNumber,
    )

  return {
    item_id: itemId,
    success: true,
    seller:
      seller || null,
    title,
    item_specific_candidates:
      itemSpecificCandidates,
    title_candidates:
      titleCandidates,
  }
}

async function searchSoldComps(
  sourcePartNumber: string,
) {
  const apiKey =
    Deno.env.get("SOLDCOMPS_API_KEY") ?? ""

  if (!apiKey) {
    throw new Error(
      "Missing SOLDCOMPS_API_KEY",
    )
  }

  const url =
    new URL(
      "https://api.sold-comps.com/v1/scrape",
    )

  url.searchParams.set(
    "keyword",
    sourcePartNumber,
  )

  url.searchParams.set(
    "ebaySite",
    "ebay.com",
  )

  url.searchParams.set("page", "1")
  url.searchParams.set("count", "120")
  url.searchParams.set(
    "daysToScrape",
    "90",
  )

  url.searchParams.set(
    "sortOrder",
    "endedRecently",
  )

  const response =
    await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type":
          "application/json",
      },
    })

  if (!response.ok) {
    throw new Error(
      `SoldComps request failed (${response.status}): ${await response.text()}`,
    )
  }

  const json =
    await response.json() as {
      items?: Array<
        Record<string, unknown>
      >
    }

  return Array.isArray(json.items)
    ? json.items
    : []
}


async function searchActiveListings(
  sourcePartNumber: string,
) {
  const apiKey =
    Deno.env.get("SOLDCOMPS_API_KEY") ?? ""

  if (!apiKey) {
    throw new Error(
      "Missing SOLDCOMPS_API_KEY",
    )
  }

  const url =
    new URL(
      "https://api.sold-comps.com/v1/scrape",
    )

  url.searchParams.set(
    "keyword",
    sourcePartNumber,
  )

  url.searchParams.set(
    "ebaySite",
    "ebay.com",
  )

  url.searchParams.set("page", "1")
  url.searchParams.set("count", "240")

  /*
   * SoldComps active-market mode.
   */
  url.searchParams.set(
    "sold",
    "false",
  )

  const response =
    await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type":
          "application/json",
      },
    })

  if (!response.ok) {
    throw new Error(
      `SoldComps active request failed (${response.status}): ${await response.text()}`,
    )
  }

  const json =
    await response.json() as {
      items?: Array<
        Record<string, unknown>
      >
    }

  return Array.isArray(json.items)
    ? json.items
    : []
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
          "Content-Type":
            "application/json",
        },
      },
    )
  }

  try {
    const body =
      await req.json().catch(() => ({}))

    const sourcePartNumber =
      normalizePartNumber(
        body.partNumber ??
          body.part_number ??
          body.sourcePartNumber ??
          body.source_part_number,
      )

    if (!sourcePartNumber) {
      throw new Error(
        "Missing source part number",
      )
    }

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ?? ""

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY",
      ) ?? ""

    if (
      !supabaseUrl ||
      !serviceRoleKey
    ) {
      throw new Error(
        "Missing Supabase service configuration",
      )
    }

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey,
      )

    /*
     * STEP 1:
     * Check Texas OEM OS's private verified
     * interchange library first.
     */
    const {
      data: verifiedRows,
      error: verifiedError,
    } = await supabase
      .from("verified_interchanges")
      .select(
        "id, part_number_a, part_number_b, approved_at, notes",
      )
      .or(
        `part_number_a.eq.${sourcePartNumber},part_number_b.eq.${sourcePartNumber}`,
      )

    if (verifiedError) {
      throw verifiedError
    }

    const verified =
      (verifiedRows ?? []).map(
        (row) => ({
          part_number:
            row.part_number_a ===
            sourcePartNumber
              ? row.part_number_b
              : row.part_number_a,
          approved_at:
            row.approved_at,
          notes: row.notes,
        }),
      )


    /*
     * VERIFIED LIBRARY FAST PATH
     *
     * Once the owner has approved an interchange,
     * trust the private Texas OEM library and avoid
     * unnecessary market/API scans.
     */
    if (verified.length > 0) {
      return new Response(
        JSON.stringify(
          {
            success: true,
            source_part_number:
              sourcePartNumber,

            verified_interchanges:
              verified,

            verified_count:
              verified.length,

            market: {
              skipped: true,
              reason:
                "verified_interchange_found",
              candidates: [],
              candidate_count: 0,
            },

            message:
              "Verified interchange found in Texas OEM library.",
          },
          null,
          2,
        ),
        {
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        },
      )
    }

    /*
     * STEP 2:
     * Search completed eBay market listings.
     */
    const items =
      await searchSoldComps(
        sourcePartNumber,
      )

    const activeItems =
      await searchActiveListings(
        sourcePartNumber,
      )

    const sourceCompact =
      compactPartNumber(
        sourcePartNumber,
      )

    const activeExactListings =
      activeItems.filter((item) => {
        const title =
          String(
            item.title ?? "",
          )

        const normalizedTitle =
          title
            .toUpperCase()
            .replace(
              /[^A-Z0-9]/g,
              "",
            )

        return (
          normalizedTitle.includes(
            sourceCompact,
          ) &&
          Boolean(item.itemId)
        )
      })

    const ebayUserToken =
      await getEbayUserToken()

    const activeDeepScan =
      await Promise.all(
        activeExactListings
          .slice(0, 30)
          .map((item) =>
            inspectActiveItem(
              ebayUserToken,
              String(item.itemId),
              sourcePartNumber,
            )
          ),
      )


    /*
     * ACTIVE MARKET CONSENSUS
     *
     * Count each seller only once per candidate.
     * Texas OEM Parts' own listings are excluded
     * from independent market consensus.
     *
     * Item Specifics carry much more weight than
     * random numbers appearing in titles.
     */
    const ownSellerUsername =
      String(
        body.ownSellerUsername ??
          body.own_seller_username ??
          "texasoemparts",
      )
        .trim()
        .toLowerCase()

    const activeEvidence =
      new Map<
        string,
        {
          sellers: Set<string>
          listings: Set<string>
          fields: Set<string>
          examples: Array<{
            seller: string
            item_id: string
            title: string
            field: string
          }>
        }
      >()

    for (
      const scan of activeDeepScan as any[]
    ) {
      if (
        !scan?.success ||
        !scan?.seller
      ) {
        continue
      }

      const seller =
        String(scan.seller)
          .trim()
          .toLowerCase()

      if (
        !seller ||
        seller === ownSellerUsername
      ) {
        continue
      }

      const listingCandidates =
        new Set<string>()

      for (
        const candidate of
          scan.item_specific_candidates ??
          []
      ) {
        const rawValue =
          normalizePartNumber(
            candidate?.value,
          )

        if (
          !isLikelyPartNumber(
            rawValue,
            sourcePartNumber,
          )
        ) {
          continue
        }

        const value =
          normalizeInterchangeIdentity(
            rawValue,
          )

        listingCandidates.add(value)

        const current =
          activeEvidence.get(value) ?? {
            sellers: new Set<string>(),
            listings: new Set<string>(),
            fields: new Set<string>(),
            examples: [],
          }

        current.sellers.add(seller)
        current.listings.add(
          String(scan.item_id),
        )

        current.fields.add(
          String(
            candidate?.field ??
              "Item Specific",
          ),
        )

        if (
          current.examples.length < 8
        ) {
          current.examples.push({
            seller,
            item_id:
              String(scan.item_id),
            title:
              String(scan.title ?? ""),
            field:
              String(
                candidate?.field ??
                  "Item Specific",
              ),
          })
        }

        activeEvidence.set(
          value,
          current,
        )
      }
    }

    const activeCandidates =
      Array.from(
        activeEvidence.entries(),
      )
        .map(
          ([
            candidatePartNumber,
            data,
          ]) => {
            const externalSellerCount =
              data.sellers.size

            const listingCount =
              data.listings.size

            /*
             * Conservative confidence model.
             *
             * Independent sellers dominate the score.
             * Repeated listings add only a small bonus.
             */
            const confidence =
              Math.min(
                99,
                Math.round(
                  45 +
                    externalSellerCount *
                      7 +
                    Math.min(
                      listingCount,
                      10,
                    ),
                ),
              )

            return {
              candidate_part_number:
                candidatePartNumber,

              evidence_count:
                listingCount,

              external_seller_count:
                externalSellerCount,

              confidence,

              evidence_source:
                "active_item_specifics",

              fields:
                Array.from(
                  data.fields,
                ),

              sellers:
                Array.from(
                  data.sellers,
                ),

              examples:
                data.examples,
            }
          },
        )
        .filter(
          (candidate) =>
            candidate
              .external_seller_count >=
              3 &&
            candidate.confidence >= 65,
        )
        .sort(
          (a, b) =>
            b.confidence -
              a.confidence ||
            b.external_seller_count -
              a.external_seller_count,
        )
        .slice(0, 10)

    /*
     * Only use actual sold listings whose title
     * contains the exact source identifier.
     */
    const eligibleListings =
      items.filter((item) => {
        const listingType =
          String(
            item.listingType ?? "",
          ).toLowerCase()

        const title =
          String(item.title ?? "")

        const normalizedTitle =
          title
            .toUpperCase()
            .replace(
              /[^A-Z0-9]/g,
              "",
            )

        return (
          listingType === "sold" &&
          normalizedTitle.includes(
            sourceCompact,
          )
        )
      })

    /*
     * STEP 3:
     * Count each candidate only once per listing.
     * This prevents one spammy title from creating
     * fake consensus.
     */
    const evidence =
      new Map<
        string,
        {
          count: number
          examples: string[]
        }
      >()

    for (
      const item of eligibleListings
    ) {
      const title =
        String(item.title ?? "")

      const candidates =
        extractCandidatesFromTitle(
          title,
          sourcePartNumber,
        )

      for (
        const candidate of candidates
      ) {
        const normalized =
          normalizePartNumber(
            candidate,
          )

        const current =
          evidence.get(normalized) ?? {
            count: 0,
            examples: [],
          }

        current.count += 1

        if (
          current.examples.length < 3
        ) {
          current.examples.push(title)
        }

        evidence.set(
          normalized,
          current,
        )
      }
    }

    /*
     * STEP 4:
     * Conservative rule:
     * one seller/listing is NEVER enough.
     */
    const candidates =
      Array.from(
        evidence.entries(),
      )
        .map(
          ([
            candidatePartNumber,
            data,
          ]) => {
            const confidence =
              calculateConfidence(
                data.count,
                eligibleListings.length,
              )

            return {
              candidate_part_number:
                candidatePartNumber,
              evidence_count:
                data.count,
              confidence,
              examples:
                data.examples,
            }
          },
        )
        .filter(
          (candidate) =>
            candidate.evidence_count >=
              2 &&
            candidate.confidence >= 55,
        )
        .sort(
          (a, b) =>
            b.confidence -
              a.confidence ||
            b.evidence_count -
              a.evidence_count,
        )
        .slice(0, 10)


    /*
     * Merge sold-market candidates with active
     * independent-seller candidates.
     */
    const combinedMap =
      new Map<string, any>()

    for (const candidate of candidates) {
      combinedMap.set(
        candidate.candidate_part_number,
        {
          ...candidate,
          evidence_source:
            "sold_market",
          external_seller_count: 0,
          sellers: [],
        },
      )
    }

    for (
      const candidate of
        activeCandidates
    ) {
      const existing =
        combinedMap.get(
          candidate
            .candidate_part_number,
        )

      if (existing) {
        combinedMap.set(
          candidate
            .candidate_part_number,
          {
            ...candidate,

            confidence:
              Math.min(
                99,
                Math.max(
                  existing.confidence,
                  candidate.confidence,
                ) + 5,
              ),

            evidence_count:
              Number(
                existing.evidence_count ??
                  0,
              ) +
              Number(
                candidate.evidence_count ??
                  0,
              ),

            evidence_source:
              "sold_and_active_consensus",
          },
        )
      } else {
        combinedMap.set(
          candidate
            .candidate_part_number,
          candidate,
        )
      }
    }

    const combinedCandidates =
      Array.from(
        combinedMap.values(),
      )
        .sort(
          (a, b) =>
            b.confidence -
              a.confidence ||
            Number(
              b.external_seller_count ??
                0,
            ) -
              Number(
                a.external_seller_count ??
                  0,
              ),
        )
        .slice(0, 10)

    /*
     * STEP 5:
     * Refresh pending market findings for this
     * source number. Approved/rejected history
     * is not touched.
     */
    const {
      error: deleteError,
    } = await supabase
      .from(
        "interchange_candidates",
      )
      .delete()
      .eq(
        "source_part_number",
        sourcePartNumber,
      )
      .eq("status", "pending")

    if (deleteError) {
      throw deleteError
    }

    if (combinedCandidates.length > 0) {
      const {
        error: insertError,
      } = await supabase
        .from(
          "interchange_candidates",
        )
        .insert(
          combinedCandidates.map(
            (candidate) => ({
              source_part_number:
                sourcePartNumber,
              candidate_part_number:
                candidate
                  .candidate_part_number,
              source_type:
                candidate.evidence_source ??
                "market_consensus",

              source_name:
                candidate.evidence_source ===
                "active_item_specifics"
                  ? "eBay active Item Specifics consensus"
                  : candidate.evidence_source ===
                    "sold_and_active_consensus"
                  ? "eBay sold + active market consensus"
                  : "eBay sold listings via SoldComps",

              source_reference:
                JSON.stringify({
                  sellers:
                    candidate.sellers ?? [],
                  examples:
                    candidate.examples ?? [],
                }),
              confidence:
                candidate.confidence,
              evidence_count:
                candidate.evidence_count,
              status: "pending",
            }),
          ),
        )

      if (insertError) {
        throw insertError
      }
    }

    return new Response(
      JSON.stringify(
        {
          success: true,
          source_part_number:
            sourcePartNumber,

          verified_interchanges:
            verified,

          verified_count:
            verified.length,

          market: {
            listings_received:
              items.length,

            active_listings_received:
              activeItems.length,

            active_field_probe:
              activeItems.length > 0
                ? {
                    keys:
                      Object.keys(activeItems[0]),
                    sellerUsername:
                      activeItems[0].sellerUsername ?? null,
                    sellerPositivePercent:
                      activeItems[0].sellerPositivePercent ?? null,
                    sellerFeedbackScore:
                      activeItems[0].sellerFeedbackScore ?? null,
                  }
                : null,

            active_exact_listing_count:
              activeExactListings.length,

            active_deep_scan:
              activeDeepScan,

            active_preview:
              activeItems
                .slice(0, 10)
                .map((item) => ({
                  item_id:
                    item.itemId ?? null,
                  title:
                    item.title ?? "",
                  seller:
                    String(
                      item.sellerUsername ??
                        "",
                    ) || null,
                })),

            eligible_exact_source_listings:
              eligibleListings.length,
            candidates:
              combinedCandidates,

            candidate_count:
              combinedCandidates.length,

            active_consensus_candidates:
              activeCandidates,
          },

          message:
            combinedCandidates.length > 0
              ? "Possible interchange numbers found. Owner approval required."
              : "No reliable interchange # found.",
        },
        null,
        2,
      ),
      {
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
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
        verified_interchanges: [],
        market: {
          candidates: [],
        },
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      },
    )
  }
})
