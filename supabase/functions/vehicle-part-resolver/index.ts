import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type MarketItem = Record<string, unknown>

function normalizeText(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : ""
}

function normalizePartNumber(value: unknown) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/^[#:\-_.\s]+|[#:\-_.\s]+$/g, "")
}


function normalizeInterchangeIdentity(
  value: unknown,
) {
  const normalized =
    normalizePartNumber(value)

  const match =
    normalized.match(
      /^(\d{3})-(\d+)$/,
    )

  if (!match) {
    return normalized
  }

  const prefix =
    match[1]

  const suffix =
    match[2].replace(
      /^0+(?=\d)/,
      "",
    )

  return `${prefix}-${suffix}`
}

function getTitle(item: MarketItem) {
  return normalizeText(
    item.title ??
    item.name ??
    item.itemTitle ??
    item.item_title
  )
}

function getItemId(item: MarketItem) {
  return normalizeText(
    item.itemId ??
    item.item_id ??
    item.ebayItemId ??
    item.ebay_item_id ??
    item.id
  )
}

function isLikelyOemNumber(
  raw: string,
  itemId = "",
) {
  const value =
    normalizePartNumber(raw)

  if (!value) return false

  const compact =
    value.replace(/[^A-Z0-9]/g, "")

  if (
    compact.length < 5 ||
    compact.length > 18
  ) {
    return false
  }

  if (
    itemId &&
    compact ===
      itemId.replace(/\D/g, "")
  ) {
    return false
  }

  if (/^EBAY\d+$/i.test(compact)) {
    return false
  }

  if (/^(19|20)\d{2}$/.test(value)) {
    return false
  }

  /*
   * Reject vehicle fitment year ranges such as:
   * 2015-2020
   * 2014/2020
   * 18-20
   * 2018-21
   *
   * These commonly appear in eBay titles and are
   * fitment information, NOT OEM part numbers.
   */
  if (
    /^(19|20)\d{2}[-/]((19|20)?\d{2})$/.test(value) ||
    /^\d{2}[-/]\d{2}$/.test(value)
  ) {
    return false
  }

  if (
    compact.length === 17 &&
    /^[A-HJ-NPR-Z0-9]{17}$/.test(compact)
  ) {
    return false
  }

  if (!/\d/.test(value)) {
    return false
  }

  /*
   * Avoid common vehicle-engine tokens.
   */
  if (
    /^\d(\.\d)?L$/i.test(value) ||
    /^\d{1,2}SPD$/i.test(value)
  ) {
    return false
  }

  return true
}

function extractTitleCandidates(
  title: string,
  itemId: string,
) {
  const tokens =
    title
      .toUpperCase()
      .match(
        /\b[A-Z0-9][A-Z0-9._/-]{4,20}\b/g,
      ) ?? []

  return Array.from(
    new Set(
      tokens
        .map(normalizePartNumber)
        .filter((value) =>
          isLikelyOemNumber(
            value,
            itemId,
          )
        ),
    ),
  )
}


async function getInterchangeIntelligence(
  partNumber: string,
) {
  const supabaseUrl =
    Deno.env.get("SUPABASE_URL") ?? ""

  if (!supabaseUrl) {
    throw new Error(
      "Missing SUPABASE_URL for interchange lookup",
    )
  }

  const response =
    await fetch(
      `${supabaseUrl}/functions/v1/interchange-intelligence`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          partNumber,
        }),
      },
    )

  const json =
    await response.json()
      .catch(() => ({}))

  if (!response.ok) {
    throw new Error(
      String(
        json?.error ??
        `Interchange lookup failed (${response.status})`,
      ),
    )
  }

  return json
}

async function searchMarket(
  query: string,
) {
  const apiKey =
    Deno.env.get(
      "SOLDCOMPS_API_KEY",
    ) ?? ""

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
    query,
  )

  url.searchParams.set(
    "ebaySite",
    "ebay.com",
  )

  url.searchParams.set(
    "page",
    "1",
  )

  url.searchParams.set(
    "count",
    "120",
  )

  /*
   * We want current listings because
   * these provide candidate OEM numbers
   * that can later be validated against
   * sold demand.
   */
  url.searchParams.set(
    "sold",
    "false",
  )

  const response =
    await fetch(
      url.toString(),
      {
        headers: {
          Authorization:
            `Bearer ${apiKey}`,

          "Content-Type":
            "application/json",
        },
      },
    )

  if (!response.ok) {
    throw new Error(
      `SoldComps request failed (${response.status}): ${await response.text()}`,
    )
  }

  const json =
    await response.json() as {
      items?: MarketItem[]
    }

  return Array.isArray(json.items)
    ? json.items
    : []
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers: corsHeaders,
      },
    )
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          "Method not allowed",
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
      await req.json()
        .catch(() => ({}))

    const vehicleId =
      normalizeText(
        body.vehicleId ??
        body.vehicle_id,
      )

    const vin =
      normalizeText(
        body.vin,
      ).toUpperCase()

    const year =
      Number(body.year) || null

    const make =
      normalizeText(body.make)

    const model =
      normalizeText(body.model)

    const trim =
      normalizeText(body.trim)

    const partFamilyCode =
      normalizeText(
        body.partFamilyCode ??
        body.part_family_code,
      ).toUpperCase()

    const partName =
      normalizeText(
        body.partName ??
        body.part_name,
      )

    if (
      !year ||
      !make ||
      !model ||
      !partFamilyCode ||
      !partName
    ) {
      throw new Error(
        "Missing vehicle identity or part family",
      )
    }

    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL",
      ) ?? ""

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
     * Keep the query specific enough to
     * the vehicle but broad enough to
     * capture multiple sellers.
     */
    const query =
      [
        year,
        make,
        model,
        trim,
        partName,
        "OEM",
      ]
        .filter(Boolean)
        .join(" ")

    const items =
      await searchMarket(query)

    const evidence =
      new Map<
        string,
        {
          count: number
          itemIds: Set<string>
          titles: string[]
        }
      >()

    for (const item of items) {
      const title =
        getTitle(item)

      const itemId =
        getItemId(item)

      if (!title) continue

      /*
       * Vehicle relevance gate.
       *
       * Search results can contain related vehicles.
       * A listing only counts as OEM evidence if the
       * TARGET MODEL appears in its title.
       */
      const normalizedTitle =
        title.toUpperCase()

      const normalizedModel =
        model.toUpperCase()

      if (
        normalizedModel &&
        !normalizedTitle.includes(
          normalizedModel,
        )
      ) {
        continue
      }

      const candidates =
        extractTitleCandidates(
          title,
          itemId,
        )

      for (
        const candidate
        of candidates
      ) {
        const existing =
          evidence.get(candidate) ?? {
            count: 0,
            itemIds:
              new Set<string>(),
            titles: [],
          }

        /*
         * Count unique listings rather
         * than duplicate occurrences in
         * one title.
         */
        if (
          !itemId ||
          !existing.itemIds.has(
            itemId,
          )
        ) {
          existing.count += 1

          if (itemId) {
            existing.itemIds.add(
              itemId,
            )
          }

          if (
            existing.titles.length <
            5
          ) {
            existing.titles.push(
              title,
            )
          }
        }

        evidence.set(
          candidate,
          existing,
        )
      }
    }

    const ranked =
      Array.from(
        evidence.entries(),
      )
        .map(
          ([
            partNumber,
            info,
          ]) => {
            /*
             * Consensus confidence.
             *
             * 1 listing  = weak
             * 2 listings = possible
             * 3 listings = useful
             * 5+         = strong
             * 8+         = very strong
             */
            const confidence =
              Math.min(
                99,
                Math.round(
                  20 +
                  info.count * 10,
                ),
              )

            return {
              part_number:
                partNumber,

              evidence_count:
                info.count,

              confidence,

              sample_titles:
                info.titles,
            }
          },
        )
        .filter(
          (candidate) =>
            candidate.evidence_count >=
            2,
        )
        .sort(
          (a, b) =>
            b.evidence_count -
              a.evidence_count ||
            b.confidence -
              a.confidence,
        )
        .slice(0, 10)

    /*
     * PART IDENTITY ENRICHMENT
     *
     * Market consensus may produce a strong OEM
     * candidate, but it does NOT become permanent
     * verified truth automatically.
     *
     * For the strongest OEM candidates, ask our
     * Interchange Intelligence system whether an
     * owner-approved relationship already exists.
     */
    const enrichedCandidates = []

    for (
      const candidate
      of ranked.slice(0, 5)
    ) {
      let interchangeResult:
        Record<string, unknown> | null =
          null

      let interchangeError:
        string | null =
          null

      try {
        interchangeResult =
          await getInterchangeIntelligence(
            candidate.part_number,
          )
      } catch (error) {
        interchangeError =
          error instanceof Error
            ? error.message
            : String(error)
      }

      const verifiedInterchanges =
        Array.isArray(
          interchangeResult?.verified_interchanges,
        )
          ? interchangeResult
              ?.verified_interchanges
          : []

      enrichedCandidates.push({
        ...candidate,

        verified_interchanges:
          verifiedInterchanges,

        verified_interchange_count:
          verifiedInterchanges.length,

        interchange_market:
          interchangeResult?.market ??
          null,

        interchange_message:
          interchangeResult?.message ??
          null,

        interchange_error:
          interchangeError,
      })
    }

    /*
     * CROSS-OEM INTERCHANGE CONSENSUS
     *
     * Different OEM candidates for the same
     * vehicle/part family may independently point
     * to the same Hollander interchange.
     *
     * Example:
     *
     * 13506932 -> 591-04039
     * 13594769 -> 591-4039
     *
     * Both canonicalize to 591-4039.
     */
    const interchangeFamilyEvidence =
      new Map<
        string,
        {
          oemNumbers: Set<string>
          sellers: Set<string>
          listings: Set<string>
          rawValues: Set<string>
          examples: Array<{
            oem_part_number: string
            seller: string
            item_id: string
            raw_interchange: string
            title: string
          }>
        }
      >()

    for (
      const candidate
      of enrichedCandidates
    ) {
      const market =
        candidate.interchange_market as
          | Record<string, unknown>
          | null

      const deepScan =
        Array.isArray(
          market?.active_deep_scan,
        )
          ? market.active_deep_scan
          : []

      for (
        const scan
        of deepScan as Array<
          Record<string, unknown>
        >
      ) {
        if (!scan?.success) {
          continue
        }

        const seller =
          normalizeText(
            scan.seller,
          ).toLowerCase()

        if (
          !seller ||
          seller === "texasoemparts"
        ) {
          continue
        }

        const itemId =
          normalizeText(
            scan.item_id,
          )

        const title =
          normalizeText(
            scan.title,
          )

        const itemSpecificCandidates =
          Array.isArray(
            scan.item_specific_candidates,
          )
            ? scan.item_specific_candidates
            : []

        for (
          const rawCandidate
          of itemSpecificCandidates as Array<
            Record<string, unknown>
          >
        ) {
          const field =
            normalizeText(
              rawCandidate.field,
            ).toLowerCase()

          /*
           * Only treat actual interchange fields
           * as Hollander-family evidence.
           *
           * OEM / superseded numbers are a separate
           * identity relationship and should not
           * contaminate interchange consensus.
           */
          if (
            !field.includes(
              "interchange",
            )
          ) {
            continue
          }

          const rawValue =
            normalizePartNumber(
              rawCandidate.value,
            )

          if (!rawValue) {
            continue
          }

          const canonical =
            normalizeInterchangeIdentity(
              rawValue,
            )

          if (!canonical) {
            continue
          }

          const current =
            interchangeFamilyEvidence
              .get(canonical) ?? {
                oemNumbers:
                  new Set<string>(),

                sellers:
                  new Set<string>(),

                listings:
                  new Set<string>(),

                rawValues:
                  new Set<string>(),

                examples: [],
              }

          current.oemNumbers.add(
            candidate.part_number,
          )

          current.sellers.add(
            seller,
          )

          if (itemId) {
            current.listings.add(
              itemId,
            )
          }

          current.rawValues.add(
            rawValue,
          )

          if (
            current.examples.length <
            10
          ) {
            current.examples.push({
              oem_part_number:
                candidate.part_number,

              seller,

              item_id:
                itemId,

              raw_interchange:
                rawValue,

              title,
            })
          }

          interchangeFamilyEvidence.set(
            canonical,
            current,
          )
        }
      }
    }

    const interchangeFamilies =
      Array.from(
        interchangeFamilyEvidence.entries(),
      )
        .map(
          ([
            interchangeNumber,
            data,
          ]) => {
            const oemCount =
              data.oemNumbers.size

            const sellerCount =
              data.sellers.size

            const listingCount =
              data.listings.size

            const corroborated =
              oemCount >= 2 &&
              sellerCount >= 2 &&
              listingCount >= 2

            const confidence =
              Math.min(
                99,
                Math.round(
                  35 +
                  oemCount * 20 +
                  sellerCount * 10 +
                  Math.min(
                    listingCount,
                    10,
                  ) * 2,
                ),
              )

            return {
              interchange_number:
                interchangeNumber,

              raw_values:
                Array.from(
                  data.rawValues,
                ),

              oem_part_numbers:
                Array.from(
                  data.oemNumbers,
                ),

              oem_count:
                oemCount,

              external_seller_count:
                sellerCount,

              listing_count:
                listingCount,

              confidence,

              corroborated,

              status:
                corroborated
                  ? "cross_oem_corroborated"
                  : "insufficient_consensus",

              examples:
                data.examples,
            }
          },
        )
        .sort(
          (a, b) =>
            Number(b.corroborated) -
              Number(a.corroborated) ||
            b.confidence -
              a.confidence ||
            b.oem_count -
              a.oem_count,
        )

    const strongestCorroboratedInterchange =
      interchangeFamilies.find(
        (family) =>
          family.corroborated,
      ) ?? null

    const saved = []

    for (
      const candidate
      of enrichedCandidates
    ) {
      /*
       * IMPORTANT:
       * Market consensus alone remains pending.
       *
       * "verified" is reserved for owner-approved
       * or otherwise explicitly trusted data.
       */
      const status = "pending"

      const verifiedInterchange =
        Array.isArray(
          candidate.verified_interchanges,
        ) &&
        candidate.verified_interchanges.length > 0
          ? String(
              candidate
                .verified_interchanges[0]
                ?.part_number ?? "",
            ).trim()
          : ""

      const payload = {
        vehicle_id:
          vehicleId || null,

        vin:
          vin || null,

        year,
        make,
        model,
        trim:
          trim || null,

        part_family_code:
          partFamilyCode,

        part_name:
          partName,

        oem_part_number:
          candidate.part_number,

        interchange_number:
          verifiedInterchange ||
          (
            strongestCorroboratedInterchange
              ?.oem_part_numbers
              ?.includes(
                candidate.part_number,
              )
              ? strongestCorroboratedInterchange
                  .interchange_number
              : null
          ),

        source_type:
          "market",

        source_name:
          "SoldComps active eBay consensus",

        source_reference:
          query,

        evidence_count:
          candidate.evidence_count,

        confidence:
          candidate.confidence,

        status,

        updated_at:
          new Date()
            .toISOString(),
      }

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "vehicle_part_candidates",
          )
          .insert(payload)
          .select()
          .single()

      if (error) {
        /*
         * Don't destroy the entire
         * research run because one row
         * could not be persisted.
         */
        saved.push({
          ...payload,
          save_error:
            error.message,
        })
      } else {
        saved.push(data)
      }
    }

    return new Response(
      JSON.stringify(
        {
          success: true,

          vehicle: {
            vehicle_id:
              vehicleId || null,
            vin:
              vin || null,
            year,
            make,
            model,
            trim:
              trim || null,
          },

          part_family: {
            code:
              partFamilyCode,
            name:
              partName,
          },

          query_used:
            query,

          listings_scanned:
            items.length,

          candidates:
            enrichedCandidates,

          candidate_count:
            enrichedCandidates.length,

          interchange_families:
            interchangeFamilies,

          corroborated_interchange:
            strongestCorroboratedInterchange,

          saved_count:
            saved.filter(
              (row) =>
                !(
                  "save_error"
                  in row
                ),
            ).length,

          saved,

          message:
            enrichedCandidates.length
              ? "OEM candidates found and enriched with Texas OEM interchange intelligence. Owner approval remains required for new market-derived identities."
              : "No reliable OEM candidate found.",
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
      JSON.stringify(
        {
          success: false,
          error: message,
        },
        null,
        2,
      ),
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
