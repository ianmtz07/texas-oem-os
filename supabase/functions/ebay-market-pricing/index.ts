import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type SearchAttempt = {
  label: string
  query: string
}

type EbayItemSummary = {
  title?: string
  itemId?: string
  itemWebUrl?: string
  itemHref?: string
  price?: {
    value?: number | string | null
  }
  shippingOptions?: Array<{
    shippingCost?: {
      value?: number | string | null
    }
  }>
  condition?: string
  conditionId?: string | number | null
  itemEndDate?: string
  sellingStatus?: {
    currentPrice?: { value?: number | string | null }
  }
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function calculateMedian(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

function buildSearchAttempts(input: Record<string, unknown>): SearchAttempt[] {
  const rawPartName =
  normalizeText(input.part_name) ||
  normalizeText(input.partName)

const partName = rawPartName
  .replace(/\b\d{1,2}\b/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  const manufacturerPartNumber = normalizeText(input.manufacturer_part_number) || normalizeText(input.manufacturerPartNumber) || normalizeText(input.partNumber) || normalizeText(input.manufacturer_part_number)
  const year = normalizeText(input.year)
  const make = normalizeText(input.make)
  const model = normalizeText(input.model)

  const attempts: SearchAttempt[] = []

  if (manufacturerPartNumber) {
    attempts.push({ label: 'manufacturer part number', query: manufacturerPartNumber })
  }

  const vehiclePhrase = [make, model]
  .filter(Boolean)
  .join(' ')
  .replace(/\b\d{1,2}\b/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  if (partName && vehiclePhrase) {
    attempts.push({ label: 'year make model + part name', query: `${vehiclePhrase} ${partName}`.trim() })
  }

  if (partName) {
    attempts.push({ label: 'part name only', query: partName })
  }

  return attempts
}

function buildConditionFilter(condition: string) {
  const normalized = condition.toLowerCase()
  if (normalized.includes('new')) return '1000'
  if (normalized.includes('used')) return '3000'
  if (normalized.includes('good')) return '3000'
  if (normalized.includes('fair')) return '3000'
  return ''
}

async function getEbayAccessToken() {
  const accessToken = normalizeText(Deno.env.get('EBAY_ACCESS_TOKEN'))
  if (accessToken) return accessToken

  const clientId = normalizeText(Deno.env.get('EBAY_CLIENT_ID'))
  const clientSecret = normalizeText(Deno.env.get('EBAY_CLIENT_SECRET'))
  if (!clientId || !clientSecret) {
    throw new Error('Missing eBay credentials. Set EBAY_ACCESS_TOKEN or EBAY_CLIENT_ID and EBAY_CLIENT_SECRET.')
  }

  const authHeader = btoa(`${clientId}:${clientSecret}`)
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${authHeader}`,
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope/buy.item.readonly',
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Failed to acquire eBay access token: ${response.status} ${body}`)
  }

  const json = await response.json() as { access_token?: string }
  if (!json.access_token) {
    throw new Error('eBay token response did not include an access token.')
  }

  return json.access_token
}

async function requestSoldListings(
  _token: string,
  query: string,
  condition: string,
) {
  const apiKey = Deno.env.get('SOLDCOMPS_API_KEY') ?? ''

  if (!apiKey) {
    throw new Error('Missing SOLDCOMPS_API_KEY')
  }

  const url = new URL('https://api.sold-comps.com/v1/scrape')

  url.searchParams.set('keyword', query)
  url.searchParams.set('ebaySite', 'ebay.com')
  url.searchParams.set('page', '1')
  url.searchParams.set('count', '240')
  url.searchParams.set('daysToScrape', '90')
  url.searchParams.set('sortOrder', 'endedRecently')

  const normalizedCondition = condition.toLowerCase()

  if (
    normalizedCondition.includes('used') ||
    normalizedCondition.includes('pre-owned') ||
    normalizedCondition.includes('preowned')
  ) {
    url.searchParams.set('itemCondition', 'used')
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const body = await response.text()

    throw new Error(
      `SoldComps request failed (${response.status}): ${body}`,
    )
  }

  const json = await response.json() as {
    items?: Array<Record<string, unknown>>
  }

  const items = Array.isArray(json.items) ? json.items : []

  const normalizedQuery = query
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

  const queryTokens =
    query
      .toUpperCase()
      .match(/[A-Z0-9]+/g)
      ?.filter((token) => token.length >= 2) ?? []

  const exactIdentifierSearch =
    queryTokens.length === 1 &&
    /\d/.test(normalizedQuery) &&
    normalizedQuery.length >= 5 &&
    normalizedQuery.length <= 18

  const soldComps = items
    .map((item) => {
      const listingType = String(item.listingType ?? '').toLowerCase()
      const title = String(item.title ?? '')
      const soldPrice = Number(item.soldPrice ?? 0)
      const shipping = Number(item.shippingPrice ?? 0)
      const soldDate = String(item.endedAt ?? '')
      const itemCondition = String(item.condition ?? 'Unknown')

      const normalizedTitle = title
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')

      if (listingType !== 'sold') return null
      if (!Number.isFinite(soldPrice) || soldPrice <= 0) return null
      if (!soldDate) return null

      if (exactIdentifierSearch) {
        // For OEM / interchange searches, require the exact identifier.
        if (
          normalizedQuery &&
          !normalizedTitle.includes(normalizedQuery)
        ) {
          return null
        }
      } else {
        // For descriptive fallback searches, allow natural title variations.
        const normalizedTitleWords =
          title.toUpperCase().match(/[A-Z0-9]+/g) ?? []

        const titleWordSet =
          new Set(normalizedTitleWords)

        const genericPartTokens = new Set([
          'OEM',
          'OE',
          'USED',
          'THE',
          'FOR',
          'AND',
          'WITH',
          'PART',
          'ENGINE',
          'MOTOR',
          'START',
          'STOP',
          'IGNITION',
          'SWITCH',
          'BUTTON',
          'CONTROL',
          'MODULE',
          'ASSEMBLY',
          'ASSY',
          'DASH',
          'DASHBOARD',
          'PANEL',
          'RADIO',
          'RECEIVER',
          'AUDIO',
          'UNIT',
          'FRONT',
          'REAR',
          'LEFT',
          'RIGHT',
          'DRIVER',
          'PASSENGER',
        ])

        const usefulTokens =
          queryTokens.filter((token) => {
            if (/^(19|20)\d{2}$/.test(token)) {
              return false
            }

            return !genericPartTokens.has(token)
          })

        const identityTokens =
          usefulTokens.filter(
            (token) =>
              token.length >= 3 ||
              /\d/.test(token),
          )

        const matchedIdentityTokens =
          identityTokens.filter(
            (token) => titleWordSet.has(token),
          )

        // A descriptive fallback must preserve vehicle identity.
        // Example:
        // CADILLAC CT4 CT5 -> require CADILLAC + CT4 or CADILLAC + CT5.
        const requiredIdentityMatches =
          identityTokens.length >= 3
            ? 2
            : identityTokens.length

        if (
          identityTokens.length > 0 &&
          matchedIdentityTokens.length <
            requiredIdentityMatches
        ) {
          return null
        }

        // Require the sold listing to describe the same TYPE of part,
        // not merely the same vehicle.
        const partDescriptorVocabulary = new Set([
          'ENGINE',
          'MOTOR',
          'START',
          'STOP',
          'IGNITION',
          'SWITCH',
          'BUTTON',
          'CONTROL',
          'MODULE',
          'RADIO',
          'RECEIVER',
          'AUDIO',
          'AMPLIFIER',
          'HEADLIGHT',
          'TAILLIGHT',
          'LAMP',
          'DOOR',
          'MIRROR',
          'WHEEL',
          'RIM',
          'TRANSMISSION',
          'TRANSFER',
          'CASE',
          'STARTER',
          'ALTERNATOR',
          'COMPRESSOR',
          'ABS',
          'ECU',
          'ECM',
          'TCM',
          'BCM',
          'CLUSTER',
          'SPEEDOMETER',
        ])

        const requestedPartTokens =
          queryTokens.filter(
            (token) =>
              partDescriptorVocabulary.has(token),
          )

        const matchedPartTokens =
          requestedPartTokens.filter(
            (token) => titleWordSet.has(token),
          )

        const requiredPartMatches =
          requestedPartTokens.length >= 3
            ? 2
            : requestedPartTokens.length

        if (
          requestedPartTokens.length > 0 &&
          matchedPartTokens.length < requiredPartMatches
        ) {
          return null
        }

        // Final safety check against extremely weak fuzzy matches.
        const matchedAllTokens =
          queryTokens.filter(
            (token) => titleWordSet.has(token),
          )

        if (matchedAllTokens.length < 3) {
          return null
        }
      }

      // Texas OEM Parts primarily prices used salvage components.
      // Keep new/NOS listings from inflating used-part recommendations.
      if (
        normalizedCondition.includes('used') ||
        normalizedCondition.includes('pre-owned') ||
        normalizedCondition.includes('preowned')
      ) {
        const c = itemCondition.toLowerCase()

        if (
          c.includes('brand new') ||
          c === 'new' ||
          c.includes('new other')
        ) {
          return null
        }
      }

      return {
        title,
        sold_price: Number(soldPrice.toFixed(2)),
        shipping:
          Number.isFinite(shipping) && shipping > 0
            ? Number(shipping.toFixed(2))
            : 0,
        sold_date: soldDate,
        condition: itemCondition,
        item_web_url: String(
          item.itemWebUrl ??
          item.itemUrl ??
          item.url ??
          '',
        ),
      }
    })
    .filter(
      (item): item is NonNullable<typeof item> =>
        item !== null,
    )

  return soldComps
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const attempts = buildSearchAttempts(body)
    const condition = normalizeText(body.condition) || normalizeText(body.partCondition) || 'Used'

    if (attempts.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No search terms provided.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let soldComps: Array<{ title: string; sold_price: number; shipping: number; sold_date: string; condition: string; item_web_url: string }> = []
    let queryUsed = ''

    for (const attempt of attempts) {
      try {
        const comps = await requestSoldListings('', attempt.query, condition)
        if (comps.length > 0) {
          soldComps = comps
          queryUsed = attempt.query
          break
        }
      } catch (error) {
        console.error(`eBay search attempt failed for ${attempt.label}:`, error)
      }
    }

    if (soldComps.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No real sold listings found for the supplied criteria.', sold_comps: [], query_used: queryUsed || attempts[0]?.query || '', confidence: 0 }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rawPrices = soldComps
      .map((item) => {
        const deliveredPrice =
          Number(item.sold_price ?? 0) +
          Number(item.shipping ?? 0)

        return deliveredPrice
      })
      .filter((price) => Number.isFinite(price) && price > 0)
      .sort((a, b) => a - b)

    const percentile = (values: number[], p: number) => {
      if (values.length === 0) return 0
      if (values.length === 1) return values[0]

      const index = (values.length - 1) * p
      const lower = Math.floor(index)
      const upper = Math.ceil(index)

      if (lower === upper) return values[lower]

      return (
        values[lower] +
        (values[upper] - values[lower]) * (index - lower)
      )
    }

    const rawQ1 = percentile(rawPrices, 0.25)
    const rawQ3 = percentile(rawPrices, 0.75)
    const iqr = rawQ3 - rawQ1

    const lowerFence =
      iqr > 0 ? Math.max(0, rawQ1 - iqr * 1.5) : 0

    const upperFence =
      iqr > 0 ? rawQ3 + iqr * 1.5 : Number.POSITIVE_INFINITY

    const prices = rawPrices.filter(
      (price) =>
        price >= lowerFence &&
        price <= upperFence,
    )

    const pricingPrices =
      prices.length >= 3 ? prices : rawPrices

    const medianPrice = calculateMedian(pricingPrices)
    const q1Price = percentile(pricingPrices, 0.25)
    const q3Price = percentile(pricingPrices, 0.75)

    // QUICK SALE is intentionally aggressive:
    // approximately the lower quartile of verified sold comps.
    const quickSalePrice = Number(
      Math.max(1, q1Price * 0.98).toFixed(2),
    )

    // Make the main recommendation Quick Sale because rapid turnover
    // is the operating priority for Texas OEM OS.
    const suggestedPrice = quickSalePrice

    const maxPrice = Number(q3Price.toFixed(2))

    const spread =
      medianPrice > 0
        ? (q3Price - q1Price) / medianPrice
        : 1

    const sampleScore = Math.min(
      45,
      pricingPrices.length * 2,
    )

    const consistencyScore = Math.max(
      0,
      Math.round(40 - spread * 30),
    )

    const recencyScore =
      soldComps.some((item) => {
        const age =
          Date.now() -
          new Date(item.sold_date).getTime()

        return age <= 30 * 24 * 60 * 60 * 1000
      })
        ? 15
        : 5

    const confidence = Math.min(
      100,
      sampleScore + consistencyScore + recencyScore,
    )

    return new Response(JSON.stringify({
      success: true,
      suggested_price: suggestedPrice,
      quick_sale_price: quickSalePrice,
      max_price: maxPrice,
      median_price: Number(medianPrice.toFixed(2)),
      sold_count: soldComps.length,
      raw_sold_count: soldComps.length,
      pricing_comp_count: pricingPrices.length,
      low_market_price: Number(q1Price.toFixed(2)),
      high_market_price: Number(q3Price.toFixed(2)),
      confidence,
      source: 'SoldComps 90-day completed sales',
      pricing_basis: 'buyer delivered price (sold price + shipping)',
      shipping_mode: 'free_shipping',
      query_used: queryUsed,
      sold_comps: soldComps,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ success: false, error: message, sold_comps: [], confidence: 0 }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
