import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  analyzeRecoveryPart,
  buildRecoveryReport,
  recoveryInputFromFamilyMarket,
} from './recoveryIntelligence'

describe(
  'vehicle recovery intelligence',
  () => {
    it(
      'does not count a destroyed front-end part toward 30-day recovery',
      () => {
        const result =
          analyzeRecoveryPart(
            {
              partName:
                'Left Headlight Assembly',

              sold90DayCount: 30,
              activeListingCount: 10,

              quickSalePrice: 450,
              marketConfidence: 90,
            },
            {
              zones: [
                'front',
                'left_front',
              ],

              severity:
                'severe',
            },
          )

        expect(
          result.excludedByDamage,
        ).toBe(true)

        expect(
          result.projected30DayRevenue,
        ).toBe(0)

        expect(
          result.recommendation,
        ).toBe('SKIP')
      },
    )

    it(
      'keeps strong unaffected electronics in the recovery forecast',
      () => {
        const result =
          analyzeRecoveryPart(
            {
              partName:
                'Radio Receiver Module',

              sold90DayCount: 45,
              activeListingCount: 8,

              quickSalePrice: 120,
              marketConfidence: 90,
            },
            {
              zones: ['rear'],
              severity:
                'severe',
            },
          )

        expect(
          result.excludedByDamage,
        ).toBe(false)

        expect(
          result.projected30DayRevenue,
        ).toBeGreaterThan(0)

        expect(
          result.recommendation,
        ).toBe('PULL_FIRST')
      },
    )

    it(
      'does not treat a valuable but slow-moving part as guaranteed 30-day revenue',
      () => {
        const result =
          analyzeRecoveryPart(
            {
              partName:
                'Transfer Case',

              sold90DayCount: 2,
              activeListingCount: 30,

              quickSalePrice: 900,
              marketConfidence: 75,
            },
            {
              zones: [],
              severity:
                'unknown',
            },
          )

        expect(
          result.projected30DayRevenue,
        ).toBeLessThan(100)

        expect(
          result.sellProbability30Day,
        ).toBeLessThan(10)
      },
    )

    it(
      'produces a strong-buy recovery report when likely 30-day revenue exceeds investment',
      () => {
        const parts =
          Array.from(
            { length: 6 },
            (_, index) => ({
              partName:
                `High Demand Part ${index + 1}`,

              sold90DayCount: 90,
              activeListingCount: 2,

              quickSalePrice: 700,
              marketConfidence: 90,
            }),
          )

        const report =
          buildRecoveryReport(
            2000,
            parts,
            {
              zones: [],
              severity:
                'unknown',
            },
          )

        expect(
          report.projected30DayRecoveryPercent,
        ).toBeGreaterThanOrEqual(
          120,
        )

        expect(
          report.recommendation,
        ).toBe(
          'STRONG_BUY',
        )
      },
    )

    it(
      'refuses to make a buy-pass decision when there is too little evidence',
      () => {
        const report =
          buildRecoveryReport(
            2500,
            [
              {
                partName:
                  'Radio',

                sold90DayCount: 10,
                activeListingCount: 5,

                quickSalePrice: 100,
                marketConfidence: 80,
              },
            ],
            {
              zones: [],
              severity:
                'unknown',
            },
          )

        expect(
          report.recommendation,
        ).toBe(
          'INSUFFICIENT_DATA',
        )
      },
    )
  },
)

it(
  'converts a live part-family market result into recovery input',
  () => {
    const input =
      recoveryInputFromFamilyMarket({
        part_name:
          'Body Control Module',

        identity_family: {
          oem_part_numbers: [
            '13506932',
            '13594769',
          ],

          interchange_number:
            '591-4039',
        },

        market: {
          sold_90_day_count: 10,
          active_listing_count: 7,
          quick_sale_price: 38.22,
          pricing_comp_count: 9,
        },
      })

    expect(input).toEqual(
      expect.objectContaining({
        partName:
          'Body Control Module',

        oemPartNumber:
          '13506932',

        interchangeNumber:
          '591-4039',

        sold90DayCount: 10,

        activeListingCount: 7,

        quickSalePrice: 38.22,
      }),
    )

    expect(
      input.marketConfidence,
    ).toBeGreaterThan(50)
  },
)
