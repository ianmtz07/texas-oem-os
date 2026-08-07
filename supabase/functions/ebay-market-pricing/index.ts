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
  const partName = normalizeText(input.part_name) || normalizeText(input.partName)
  const manufacturerPartNumber = normalizeText(input.manufacturer_part_number) || normalizeText(input.manufacturerPartNumber) || normalizeText(input.partNumber) || normalizeText(input.manufacturer_part_number)
  const year = normalizeText(input.year)
  const make = normalizeText(input.make)
  const model = normalizeText(input.model)

  const attempts: SearchAttempt[] = []

  if (manufacturerPartNumber) {
    attempts.push({ label: 'manufacturer part number', query: manufacturerPartNumber })
  }

  const vehiclePhrase = [year, make, model].filter(Boolean).join(' ').trim()
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

async function requestSoldListings(token: string, query: string, condition: string) {
  const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '10')
  url.searchParams.set('sort', 'price_plus_shipping_low_to_high')

  const conditionFilter = buildConditionFilter(condition)
  if (conditionFilter) {
    url.searchParams.set('filter', `soldItems:true,conditionIds:${conditionFilter}`)
  } else {
    url.searchParams.set('filter', 'soldItems:true')
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`eBay API request failed (${response.status}): ${body}`)
  }

  const json = await response.json() as { itemSummaries?: EbayItemSummary[] }
  const summaries = Array.isArray(json.itemSummaries) ? json.itemSummaries : []

  const soldComps = summaries
    .map((summary) => {
      const soldPrice = Number(summary.price?.value ?? summary.sellingStatus?.currentPrice?.value ?? 0)
      if (!Number.isFinite(soldPrice) || soldPrice <= 0) return null

      return {
        title: normalizeText(summary.title) || 'Untitled listing',
        sold_price: Number(soldPrice.toFixed(2)),
        shipping: Number(summary.shippingOptions?.[0]?.shippingCost?.value ?? 0),
        sold_date: normalizeText(summary.itemEndDate) || '',
        condition: normalizeText(summary.condition) || 'Unknown',
        item_web_url: normalizeText(summary.itemWebUrl) || normalizeText(summary.itemHref) || '',
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

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

    const token = await getEbayAccessToken()
    let soldComps: Array<{ title: string; sold_price: number; shipping: number; sold_date: string; condition: string; item_web_url: string }> = []
    let queryUsed = ''

    for (const attempt of attempts) {
      try {
        const comps = await requestSoldListings(token, attempt.query, condition)
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

    const prices = soldComps.map((item) => item.sold_price)
    const medianPrice = calculateMedian(prices)
    const quickSalePrice = Number((medianPrice * 0.9).toFixed(2))
    const suggestedPrice = Number((medianPrice * 0.95).toFixed(2))
    const maxPrice = Math.max(...prices)
    const confidence = Math.min(100, Math.round(70 + soldComps.length * 5))

    return new Response(JSON.stringify({
      success: true,
      suggested_price: suggestedPrice,
      quick_sale_price: quickSalePrice,
      max_price: maxPrice,
      median_price: medianPrice,
      sold_count: soldComps.length,
      confidence,
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
