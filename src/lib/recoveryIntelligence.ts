import {
  assessPartSurvival,
  type DamageProfile,
} from './damageIntelligence'

export type RecoveryPartInput = {
  partName: string
  oemPartNumber?: string | null
  interchangeNumber?: string | null

  sold90DayCount: number
  activeListingCount: number

  quickSalePrice: number
  marketConfidence: number

  damageZone?: string | null
}

export type RecoveryPartResult = {
  partName: string
  oemPartNumber: string | null
  interchangeNumber: string | null

  sold90DayCount: number
  activeListingCount: number

  quickSalePrice: number

  survivalProbability: number
  excludedByDamage: boolean
  exclusionReason: string | null

  sellProbability30Day: number
  projected30DayRevenue: number
  estimatedDaysToSell: number | null

  demandScore: number
  confidence: number

  recommendation:
    | 'PULL_FIRST'
    | 'PULL'
    | 'LOW_PRIORITY'
    | 'SKIP'
    | 'REVIEW'
}

export type RecoveryReport = {
  totalInvestment: number

  projected30DayRecovery: number
  projectedTotalRecovery: number
  projected30DayRecoveryPercent: number

  viablePartsCount: number
  priorityPartsCount: number
  excludedDamagePartsCount: number

  recommendation:
    | 'STRONG_BUY'
    | 'BUY'
    | 'MARGINAL'
    | 'PASS'
    | 'INSUFFICIENT_DATA'

  confidence: number

  parts: RecoveryPartResult[]
}

function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.max(
    min,
    Math.min(max, value),
  )
}

function roundMoney(value: number) {
  return Math.round(
    (value + Number.EPSILON) * 100,
  ) / 100
}

function calculateSellProbability30Day(
  sold90DayCount: number,
  activeListingCount: number,
) {
  const sold =
    Math.max(
      0,
      Number(sold90DayCount) || 0,
    )

  const active =
    Math.max(
      0,
      Number(activeListingCount) || 0,
    )

  if (sold <= 0) {
    return 0
  }

  /*
   * Estimate monthly market demand.
   */
  const monthlySold =
    sold / 3

  /*
   * Estimate how much monthly demand exists
   * for each currently competing listing.
   *
   * +1 represents our own future listing.
   */
  const monthlyDemandPerListing =
    monthlySold /
    Math.max(active + 1, 1)

  /*
   * Convert expected monthly demand into the
   * probability that one listed unit sells
   * within approximately 30 days.
   *
   * Poisson event probability:
   * P(sale) = 1 - e^-lambda
   */
  const probability =
    1 -
    Math.exp(
      -monthlyDemandPerListing,
    )

  /*
   * Never claim absolute certainty from
   * market comps alone.
   */
  return clamp(
    probability,
    0,
    0.95,
  )
}

function calculateEstimatedDaysToSell(
  sellProbability30Day: number,
) {
  if (
    sellProbability30Day <= 0
  ) {
    return null
  }

  /*
   * Convert 30-day probability back into
   * an approximate daily hazard.
   */
  const monthlyHazard =
    -Math.log(
      1 - sellProbability30Day,
    )

  if (
    !Number.isFinite(
      monthlyHazard,
    ) ||
    monthlyHazard <= 0
  ) {
    return null
  }

  const dailyHazard =
    monthlyHazard / 30

  const days =
    Math.round(
      1 / dailyHazard,
    )

  return clamp(
    days,
    1,
    365,
  )
}

function calculateDemandScore(
  sold90DayCount: number,
  activeListingCount: number,
  sellProbability30Day: number,
) {
  const soldScore =
    clamp(
      sold90DayCount / 30,
      0,
      1,
    )

  const competitionRatio =
    sold90DayCount > 0
      ? sold90DayCount /
        Math.max(
          activeListingCount,
          1,
        )
      : 0

  const competitionScore =
    clamp(
      competitionRatio / 2,
      0,
      1,
    )

  return Math.round(
    (
      sellProbability30Day *
        50 +
      soldScore * 25 +
      competitionScore * 25
    ),
  )
}

export function analyzeRecoveryPart(
  part: RecoveryPartInput,
  damageProfile: DamageProfile,
): RecoveryPartResult {
  const survival =
    assessPartSurvival(
      part.partName,
      damageProfile,
    )

  const quickSalePrice =
    Math.max(
      0,
      Number(
        part.quickSalePrice,
      ) || 0,
    )

  const sellProbability30Day =
    survival.excluded
      ? 0
      : calculateSellProbability30Day(
          part.sold90DayCount,
          part.activeListingCount,
        )

  /*
   * Survival probability remains in the
   * revenue calculation even when the part
   * isn't fully excluded.
   *
   * Example:
   * moderate damage may leave a part at
   * 35% survival confidence. We should not
   * count its full expected revenue.
   */
  const survivalFactor =
    survival.probability /
    100

  const projected30DayRevenue =
    survival.excluded
      ? 0
      : quickSalePrice *
        sellProbability30Day *
        survivalFactor

  const demandScore =
    calculateDemandScore(
      part.sold90DayCount,
      part.activeListingCount,
      sellProbability30Day,
    )

  const marketConfidence =
    clamp(
      Number(
        part.marketConfidence,
      ) || 0,
      0,
      100,
    )

  const combinedConfidence =
    Math.round(
      marketConfidence *
        0.65 +
      survival.probability *
        0.35,
    )

  let recommendation:
    RecoveryPartResult['recommendation'] =
      'REVIEW'

  if (survival.excluded) {
    recommendation = 'SKIP'
  } else if (
    demandScore >= 70 &&
    sellProbability30Day >= 0.55 &&
    quickSalePrice >= 40
  ) {
    recommendation =
      'PULL_FIRST'
  } else if (
    demandScore >= 40 &&
    sellProbability30Day >= 0.25
  ) {
    recommendation = 'PULL'
  } else if (
    quickSalePrice > 0 &&
    part.sold90DayCount > 0
  ) {
    recommendation =
      'LOW_PRIORITY'
  }

  return {
    partName:
      part.partName,

    oemPartNumber:
      part.oemPartNumber ??
      null,

    interchangeNumber:
      part.interchangeNumber ??
      null,

    sold90DayCount:
      Math.max(
        0,
        part.sold90DayCount,
      ),

    activeListingCount:
      Math.max(
        0,
        part.activeListingCount,
      ),

    quickSalePrice,

    survivalProbability:
      survival.probability,

    excludedByDamage:
      survival.excluded,

    exclusionReason:
      survival.reason,

    sellProbability30Day:
      Math.round(
        sellProbability30Day *
          100,
      ),

    projected30DayRevenue:
      roundMoney(
        projected30DayRevenue,
      ),

    estimatedDaysToSell:
      calculateEstimatedDaysToSell(
        sellProbability30Day,
      ),

    demandScore,

    confidence:
      combinedConfidence,

    recommendation,
  }
}

export function buildRecoveryReport(
  totalInvestment: number,
  parts: RecoveryPartInput[],
  damageProfile: DamageProfile,
): RecoveryReport {
  const investment =
    Math.max(
      0,
      Number(totalInvestment) ||
        0,
    )

  const analyzedParts =
    parts
      .map((part) =>
        analyzeRecoveryPart(
          part,
          damageProfile,
        ),
      )
      .sort(
        (left, right) =>
          right.projected30DayRevenue -
            left.projected30DayRevenue ||
          right.demandScore -
            left.demandScore,
      )

  const projected30DayRecovery =
    roundMoney(
      analyzedParts.reduce(
        (total, part) =>
          total +
          part.projected30DayRevenue,
        0,
      ),
    )

  /*
   * Total potential recovery uses quick-sale
   * value adjusted for survival probability,
   * but NOT the 30-day sale probability.
   */
  const projectedTotalRecovery =
    roundMoney(
      analyzedParts.reduce(
        (total, part) => {
          if (
            part.excludedByDamage
          ) {
            return total
          }

          return (
            total +
            part.quickSalePrice *
              (
                part.survivalProbability /
                100
              )
          )
        },
        0,
      ),
    )

  const recoveryPercent =
    investment > 0
      ? roundMoney(
          (
            projected30DayRecovery /
            investment
          ) * 100,
        )
      : 0

  const viableParts =
    analyzedParts.filter(
      (part) =>
        !part.excludedByDamage &&
        part.quickSalePrice > 0,
    )

  const priorityParts =
    analyzedParts.filter(
      (part) =>
        part.recommendation ===
        'PULL_FIRST',
    )

  const excludedParts =
    analyzedParts.filter(
      (part) =>
        part.excludedByDamage,
    )

  const pricedEvidenceParts =
    analyzedParts.filter(
      (part) =>
        part.sold90DayCount > 0 &&
        part.quickSalePrice > 0,
    )

  const averageConfidence =
    pricedEvidenceParts.length > 0
      ? Math.round(
          pricedEvidenceParts.reduce(
            (total, part) =>
              total +
              part.confidence,
            0,
          ) /
            pricedEvidenceParts.length,
        )
      : 0

  let recommendation:
    RecoveryReport['recommendation'] =
      'INSUFFICIENT_DATA'

  /*
   * Require several researched parts before
   * making a vehicle-level BUY / PASS call.
   */
  if (
    pricedEvidenceParts.length >= 5 &&
    investment > 0
  ) {
    if (
      recoveryPercent >= 120
    ) {
      recommendation =
        'STRONG_BUY'
    } else if (
      recoveryPercent >= 100
    ) {
      recommendation = 'BUY'
    } else if (
      recoveryPercent >= 80
    ) {
      recommendation =
        'MARGINAL'
    } else {
      recommendation = 'PASS'
    }
  }

  return {
    totalInvestment:
      roundMoney(investment),

    projected30DayRecovery,

    projectedTotalRecovery,

    projected30DayRecoveryPercent:
      recoveryPercent,

    viablePartsCount:
      viableParts.length,

    priorityPartsCount:
      priorityParts.length,

    excludedDamagePartsCount:
      excludedParts.length,

    recommendation,

    confidence:
      averageConfidence,

    parts:
      analyzedParts,
  }
}

export type PartFamilyMarketResult = {
  part_name?: string | null
  identity_family?: {
    oem_part_numbers?: string[]
    interchange_number?: string | null
  } | null
  market?: {
    sold_90_day_count?: number
    active_listing_count?: number
    quick_sale_price?: number
    pricing_comp_count?: number
    raw_price_count?: number
  } | null
}

export function recoveryInputFromFamilyMarket(
  marketResult: PartFamilyMarketResult,
  options?: {
    partName?: string
    oemPartNumber?: string | null
    interchangeNumber?: string | null
  },
): RecoveryPartInput {
  const market =
    marketResult.market ?? {}

  const identityFamily =
    marketResult.identity_family ?? {}

  const sold90DayCount =
    Math.max(
      0,
      Number(
        market.sold_90_day_count,
      ) || 0,
    )

  const activeListingCount =
    Math.max(
      0,
      Number(
        market.active_listing_count,
      ) || 0,
    )

  const quickSalePrice =
    Math.max(
      0,
      Number(
        market.quick_sale_price,
      ) || 0,
    )

  /*
   * Family-market confidence is based on
   * how much clean pricing evidence we have.
   *
   * This is intentionally conservative.
   */
  const pricingCompCount =
    Math.max(
      0,
      Number(
        market.pricing_comp_count ??
        market.raw_price_count,
      ) || 0,
    )

  const marketConfidence =
    Math.min(
      100,
      Math.round(
        25 +
        Math.min(
          pricingCompCount,
          20,
        ) * 3 +
        Math.min(
          sold90DayCount,
          20,
        ) * 2,
      ),
    )

  const oemPartNumber =
    options?.oemPartNumber ??
    identityFamily
      .oem_part_numbers
      ?.at(0) ??
    null

  const interchangeNumber =
    options?.interchangeNumber ??
    identityFamily
      .interchange_number ??
    null

  return {
    partName:
      options?.partName ??
      marketResult.part_name ??
      'Unknown Part',

    oemPartNumber,

    interchangeNumber,

    sold90DayCount,

    activeListingCount,

    quickSalePrice,

    marketConfidence,
  }
}
