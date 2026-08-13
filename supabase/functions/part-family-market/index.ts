const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type SoldComp = {
  title: string
  sold_price: number
  shipping: number
  sold_date: string
  condition: string
  item_web_url: string
}

type MarketItem =
  Record<string, unknown>

function normalizeText(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim()
    : ""
}

function compactIdentity(
  value: unknown,
) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

function percentile(
  values: number[],
  p: number,
) {
  if (!values.length) return 0
  if (values.length === 1) {
    return values[0]
  }

  const index =
    (values.length - 1) * p

  const lower =
    Math.floor(index)

  const upper =
    Math.ceil(index)

  if (lower === upper) {
    return values[lower]
  }

  return (
    values[lower] +
    (
      values[upper] -
      values[lower]
    ) *
      (index - lower)
  )
}

function median(
  values: number[],
) {
  if (!values.length) {
    return 0
  }

  const sorted =
    [...values].sort(
      (a, b) => a - b,
    )

  const middle =
    Math.floor(
      sorted.length / 2,
    )

  return (
    sorted.length % 2
      ? sorted[middle]
      : (
          sorted[middle - 1] +
          sorted[middle]
        ) / 2
  )
}


function isSalvageMarketListing(
  titleValue: unknown,
  conditionValue: unknown,
) {
  const title =
    normalizeText(titleValue)
      .toUpperCase()

  const condition =
    normalizeText(conditionValue)
      .toUpperCase()

  /*
   * Texas OEM recovery forecasts are based on
   * normal USED OEM salvage parts.
   *
   * Exclude businesses selling programming,
   * cloning, rebuilding, repair, or reman services.
   */
  const excludedTitleTerms = [
    "PROGRAMMED",
    "PROGRAMMING",
    "CLONED",
    "CLONE SERVICE",
    "PLUG & PLAY",
    "PLUG AND PLAY",
    "REMANUFACTURED",
    "REMAN",
    "REBUILT",
    "REBUILD SERVICE",
    "REPAIR SERVICE",
    "MAIL IN",
    "MAIL-IN",
    "CORE SERVICE",
  ]

  if (
    excludedTitleTerms.some(
      (term) =>
        title.includes(term),
    )
  ) {
    return false
  }

  /*
   * Explicit remanufactured condition is not
   * comparable to a dismantled used OEM part.
   */
  if (
    condition.includes(
      "REMANUFACTURED",
    ) ||
    condition.includes(
      "REFURBISHED",
    )
  ) {
    return false
  }

  return true
}

function significantPartTokens(
  partName: string,
) {
  const stop =
    new Set([
      "OEM",
      "OE",
      "USED",
      "ASSEMBLY",
      "MODULE",
      "UNIT",
      "PART",
    ])

  return partName
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(
      (token) =>
        token.length >= 3 &&
        !stop.has(token),
    )
}

function activeListingMatchesFamily(
  item: MarketItem,
  identities: string[],
  _model: string,
  _partName: string,
) {
  const title =
    normalizeText(
      item.title,
    )

  if (!title) {
    return false
  }

  const compactTitle =
    compactIdentity(title)

  /*
   * STRICT PART IDENTITY RULE
   *
   * Once Texas OEM OS has established a trusted
   * OEM/interchange family, market competition
   * must contain at least one member of that
   * identity family.
   *
   * Generic "Impala BCM" listings are not enough,
   * because multiple BCM variants may exist.
   */
  return identities.some(
    (identity) =>
      compactTitle.includes(
        compactIdentity(identity),
      ),
  )
}

async function getPricingForIdentity(
  identity: string,
) {
  const supabaseUrl =
    Deno.env.get(
      "SUPABASE_URL",
    ) ?? ""

  if (!supabaseUrl) {
    throw new Error(
      "Missing SUPABASE_URL",
    )
  }

  const response =
    await fetch(
      `${supabaseUrl}/functions/v1/ebay-market-pricing`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          partNumber:
            identity,
          condition:
            "Used",
        }),
      },
    )

  const json =
    await response.json()
      .catch(() => ({}))

  /*
   * No sold comps for one identity is not
   * fatal. Other identities in the family
   * may have strong market evidence.
   */
  if (!response.ok) {
    return {
      success: false,
      identity,
      sold_comps: [],
      error:
        String(
          json?.error ??
          `Pricing request failed (${response.status})`,
        ),
    }
  }

  return {
    ...json,
    identity,
  }
}

async function searchActiveListings(
  identity: string,
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
    identity,
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
    "240",
  )

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
      `Active market request failed for ${identity} (${response.status}): ${await response.text()}`,
    )
  }

  const json =
    await response.json() as {
      items?: MarketItem[]
    }

  return Array.isArray(
    json.items,
  )
    ? json.items
    : []
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers:
          corsHeaders,
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

    const partName =
      normalizeText(
        body.partName ??
        body.part_name,
      )

    const model =
      normalizeText(
        body.model,
      )

    const oemPartNumbers =
      Array.isArray(
        body.oemPartNumbers ??
        body.oem_part_numbers,
      )
        ? (
            body.oemPartNumbers ??
            body.oem_part_numbers
          )
            .map(
              (value: unknown) =>
                normalizeText(value),
            )
            .filter(Boolean)
        : []

    const interchangeNumber =
      normalizeText(
        body.interchangeNumber ??
        body.interchange_number,
      )

    const identities =
      Array.from(
        new Set([
          ...oemPartNumbers,
          ...(interchangeNumber
            ? [interchangeNumber]
            : []),
        ]),
      )

    if (
      !partName ||
      identities.length === 0
    ) {
      throw new Error(
        "Missing part family identity",
      )
    }

    /*
     * Run identity research in parallel.
     */
    const pricingResults =
      await Promise.all(
        identities.map(
          (identity) =>
            getPricingForIdentity(
              identity,
            ),
        ),
      )

    const activeResults =
      await Promise.all(
        identities.map(
          async (identity) => ({
            identity,
            items:
              await searchActiveListings(
                identity,
              ),
          }),
        ),
      )

    /*
     * SOLD FAMILY POOL
     *
     * Deduplicate because one listing may
     * contain multiple OEM/interchange IDs
     * and therefore appear in several searches.
     */
    let excludedSoldListingCount = 0

    const soldMap =
      new Map<
        string,
        SoldComp & {
          matched_identities:
            Set<string>
        }
      >()

    for (
      const result
      of pricingResults
    ) {
      const comps =
        Array.isArray(
          result?.sold_comps,
        )
          ? result.sold_comps
          : []

      for (
        const comp
        of comps as SoldComp[]
      ) {
        if (
          !isSalvageMarketListing(
            comp.title,
            comp.condition,
          )
        ) {
          excludedSoldListingCount += 1
          continue
        }

        const compactTitle =
          compactIdentity(
            comp.title,
          )

        const exactFamilyMatch =
          identities.some(
            (identity) =>
              compactTitle.includes(
                compactIdentity(identity),
              ),
          )

        if (!exactFamilyMatch) {
          continue
        }

        const url =
          normalizeText(
            comp.item_web_url,
          )

        const fallbackKey =
          [
            normalizeText(
              comp.title,
            ).toUpperCase(),

            Number(
              comp.sold_price,
            ).toFixed(2),

            Number(
              comp.shipping,
            ).toFixed(2),

            normalizeText(
              comp.sold_date,
            ),
          ].join("|")

        const key =
          url ||
          fallbackKey

        const existing =
          soldMap.get(key)

        if (existing) {
          existing
            .matched_identities
            .add(
              result.identity,
            )

          continue
        }

        soldMap.set(
          key,
          {
            ...comp,
            matched_identities:
              new Set([
                result.identity,
              ]),
          },
        )
      }
    }

    const soldComps =
      Array.from(
        soldMap.values(),
      ).map((comp) => ({
        ...comp,

        matched_identities:
          Array.from(
            comp.matched_identities,
          ),
      }))

    /*
     * ACTIVE FAMILY POOL
     */
    let excludedActiveListingCount = 0

    const activeMap =
      new Map<
        string,
        MarketItem & {
          matched_identities:
            Set<string>
        }
      >()

    for (
      const result
      of activeResults
    ) {
      for (
        const item
        of result.items
      ) {
        if (
          !isSalvageMarketListing(
            item.title,
            item.condition,
          )
        ) {
          excludedActiveListingCount += 1
          continue
        }

        if (
          !activeListingMatchesFamily(
            item,
            identities,
            model,
            partName,
          )
        ) {
          continue
        }

        const itemId =
          normalizeText(
            item.itemId ??
            item.item_id,
          )

        const fallbackKey =
          [
            normalizeText(
              item.title,
            ).toUpperCase(),

            normalizeText(
              item.currentPrice,
            ),
          ].join("|")

        const key =
          itemId ||
          fallbackKey

        const existing =
          activeMap.get(key)

        if (existing) {
          existing
            .matched_identities
            .add(
              result.identity,
            )

          continue
        }

        activeMap.set(
          key,
          {
            ...item,

            matched_identities:
              new Set([
                result.identity,
              ]),
          },
        )
      }
    }

    const activeListings =
      Array.from(
        activeMap.values(),
      ).map((item) => ({
        ...item,

        matched_identities:
          Array.from(
            item.matched_identities,
          ),
      }))

    /*
     * PRICE FAMILY
     */
    const rawPrices =
      soldComps
        .map((comp) =>
          Number(
            comp.sold_price ?? 0,
          ) +
          Number(
            comp.shipping ?? 0,
          ),
        )
        .filter(
          (price) =>
            Number.isFinite(price) &&
            price > 0,
        )
        .sort(
          (a, b) => a - b,
        )

    const rawQ1 =
      percentile(
        rawPrices,
        0.25,
      )

    const rawQ3 =
      percentile(
        rawPrices,
        0.75,
      )

    const iqr =
      rawQ3 -
      rawQ1

    const lowerFence =
      iqr > 0
        ? Math.max(
            0,
            rawQ1 -
              iqr * 1.5,
          )
        : 0

    const upperFence =
      iqr > 0
        ? rawQ3 +
          iqr * 1.5
        : Number
            .POSITIVE_INFINITY

    const cleanPrices =
      rawPrices.filter(
        (price) =>
          price >= lowerFence &&
          price <= upperFence,
      )

    const pricingPrices =
      cleanPrices.length >= 3
        ? cleanPrices
        : rawPrices

    const q1Price =
      percentile(
        pricingPrices,
        0.25,
      )

    const q3Price =
      percentile(
        pricingPrices,
        0.75,
      )

    const medianPrice =
      median(
        pricingPrices,
      )

    const quickSalePrice =
      pricingPrices.length
        ? Number(
            Math.max(
              1,
              q1Price * 0.98,
            ).toFixed(2),
          )
        : 0

    const soldCount =
      soldComps.length

    const activeCount =
      activeListings.length

    /*
     * Basic market ratio for debugging
     * and future recovery input.
     *
     * Recovery Intelligence will perform
     * the actual 30-day probability math.
     */
    const ninetyDaySellThroughRatio =
      activeCount > 0
        ? Number(
            (
              soldCount /
              activeCount
            ).toFixed(3),
          )
        : soldCount > 0
          ? soldCount
          : 0

    return new Response(
      JSON.stringify(
        {
          success: true,

          part_name:
            partName,

          model:
            model || null,

          identity_family: {
            oem_part_numbers:
              oemPartNumbers,

            interchange_number:
              interchangeNumber ||
              null,

            searched_identities:
              identities,
          },

          market: {
            sold_90_day_count:
              soldCount,

            active_listing_count:
              activeCount,

            ninety_day_sell_through_ratio:
              ninetyDaySellThroughRatio,

            quick_sale_price:
              quickSalePrice,

            median_price:
              Number(
                medianPrice
                  .toFixed(2),
              ),

            low_market_price:
              Number(
                q1Price
                  .toFixed(2),
              ),

            high_market_price:
              Number(
                q3Price
                  .toFixed(2),
              ),

            raw_price_count:
              rawPrices.length,

            pricing_comp_count:
              pricingPrices.length,

            excluded_non_salvage_sold:
              excludedSoldListingCount,

            excluded_non_salvage_active:
              excludedActiveListingCount,

            market_basis:
              "used OEM salvage only",
          },

          identity_research:
            pricingResults.map(
              (result) => ({
                identity:
                  result.identity,

                success:
                  Boolean(
                    result.success,
                  ),

                sold_count:
                  Number(
                    result.sold_count ??
                    0,
                  ),

                quick_sale_price:
                  Number(
                    result.quick_sale_price ??
                    0,
                  ),

                confidence:
                  Number(
                    result.confidence ??
                    0,
                  ),

                error:
                  result.error ??
                  null,
              }),
            ),

          /*
           * Keep API output readable.
           * Full arrays are not needed for normal OS use.
           */
          sold_comps_preview:
            soldComps.slice(0, 20),

          active_listings_preview:
            activeListings.slice(0, 20),

          message:
            "Part identity family market aggregated successfully.",
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
