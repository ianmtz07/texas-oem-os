import { describe, expect, it } from 'vitest'
import { buildVehicleDecodeSummary, isValidVin, normalizeVin } from './vin'

describe('VIN helpers', () => {
  it('validates a standard 17-character VIN', () => {
    expect(isValidVin('1HGCM82633A004251')).toBe(true)
    expect(isValidVin('1HGCM82633A00425')).toBe(false)
  })

  it('normalizes a VIN for consistent matching', () => {
    expect(normalizeVin(' 1hgcm82633a004251 ')).toBe('1HGCM82633A004251')
  })

  it('builds a compact decode summary', () => {
    const summary = buildVehicleDecodeSummary({
      vin: '1HGCM82633A004251',
      modelYear: '2020',
      make: 'Honda',
      model: 'Civic',
      trim: 'EX',
      bodyClass: 'Sedan',
      driveType: 'Front Wheel Drive',
      engineDisplacement: '2.0L',
      engineCylinders: '4',
      fuelType: 'Gasoline',
      transmissionStyle: 'CVT',
      plant: 'Marysville',
      gvwr: '3500',
    })

    expect(summary.make).toBe('Honda')
    expect(summary.model).toBe('Civic')
    expect(summary.trim).toBe('EX')
  })
})
