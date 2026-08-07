import { describe, expect, it } from 'vitest'
import { buildGeneratedSku, buildSkuPreview, getFallbackPartCode, isInvalidSku } from './sku'

describe('SKU helpers', () => {
  it('builds a generated SKU from stock, code, and sequence', () => {
    expect(buildGeneratedSku('TX-20260806-1234', 'ALT', 7)).toBe('TX-20260806-1234-ALT-007')
    expect(buildSkuPreview('TX-20260806-1234', 'ALT', '7')).toBe('TX-20260806-1234-ALT-007')
  })

  it('derives a compact fallback code for common part names', () => {
    expect(getFallbackPartCode('Alternator', 'Engine')).toBe('ALT')
  })

  it('detects malformed SKUs', () => {
    expect(isInvalidSku('TX-ALT-001')).toBe(false)
    expect(isInvalidSku('bad-sku')).toBe(true)
  })
})
