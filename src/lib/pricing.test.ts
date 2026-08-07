import { describe, expect, it } from 'vitest'
import { normalizeSoldComps } from './pricing'

describe('normalizeSoldComps', () => {
  it('normalizes sold comps into the UI shape', () => {
    const comps = normalizeSoldComps([
      {
        title: 'OEM Alternator',
        sold_price: 145.5,
        shipping: 15,
        sold_date: '2026-07-01',
        condition: 'Used',
        item_web_url: 'https://ebay.com/example',
      },
    ])

    expect(comps).toHaveLength(1)
    expect(comps[0]?.totalPrice).toBe(160.5)
    expect(comps[0]?.itemUrl).toBe('https://ebay.com/example')
  })
})
