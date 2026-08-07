export type MarketComp = {
  id?: string
  partId?: string | null
  query?: string | null
  source?: string | null
  listingType?: string | null
  ebayItemId?: string | null
  title?: string | null
  condition?: string | null
  price?: number | null
  shipping?: number | null
  totalPrice?: number | null
  soldDate?: string | null
  sellerFeedbackPercentage?: number | null
  itemUrl?: string | null
  matchScore?: number | null
}

export type MarketRecommendation = {
  id?: string
  partId?: string | null
  sampleSize?: number | null
  lowPrice?: number | null
  medianPrice?: number | null
  averagePrice?: number | null
  highPrice?: number | null
  recommendedPrice?: number | null
  quickSalePrice?: number | null
  maximumMarginPrice?: number | null
  confidenceScore?: number | null
  pricingStrategy?: string | null
  searchQuery?: string | null
  generatedAt?: string | null
}

export function calculateMedian(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length === 0) return 0
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

export function calculateAdjustedMedian(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  if (sorted.length <= 2) return calculateMedian(values)

  const trimmed = sorted.slice(1, sorted.length - 1)
  return calculateMedian(trimmed)
}

export function estimateRecommendation(values: number[]) {
  const baseline = calculateAdjustedMedian(values)
  const quickSale = baseline * 0.9
  const balanced = baseline * 0.95
  const maximumMargin = baseline * 1.0
  return { baseline, quickSale, balanced, maximumMargin }
}

export function normalizeSoldComps(rawComps: Array<Record<string, unknown>>): MarketComp[] {
  const normalized: MarketComp[] = []

  for (const item of rawComps) {
    const soldPrice = Number((item.sold_price as number | string | undefined) ?? (item.price as number | string | undefined) ?? 0)
    if (!Number.isFinite(soldPrice) || soldPrice <= 0) {
      continue
    }

    const shipping = Number((item.shipping as number | string | undefined) ?? 0)
    const totalPrice = Number((item.total_price as number | string | undefined) ?? (item.totalPrice as number | string | undefined) ?? soldPrice + shipping)

    normalized.push({
      id: (item.id as string | undefined) ?? (item.item_web_url as string | undefined) ?? (item.title as string | undefined),
      title: (item.title as string | undefined) ?? 'Untitled listing',
      condition: (item.condition as string | undefined) ?? 'Unknown',
      price: soldPrice,
      shipping,
      totalPrice: Number.isFinite(totalPrice) ? totalPrice : soldPrice + shipping,
      soldDate: (item.sold_date as string | undefined) ?? (item.soldDate as string | undefined) ?? '',
      itemUrl: (item.item_web_url as string | undefined) ?? (item.itemUrl as string | undefined) ?? '',
    })
  }

  return normalized
}

export function formatCurrency(value: number | null | undefined) {
  const normalized = Number.isFinite(value ?? NaN) ? Number(value) : 0
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(normalized)
}
