import { describe, expect, it } from 'vitest'
import { assessPartSurvival } from './damageIntelligence'

describe('damage intelligence', () => {
  it('excludes a headlight in severe front damage', () => {
    const result = assessPartSurvival(
      'Left Headlight Assembly',
      {
        zones: ['front', 'left_front'],
        severity: 'severe',
      },
    )

    expect(result.excluded).toBe(true)
    expect(result.probability).toBeLessThan(25)
  })

  it('keeps an interior radio viable after moderate rear damage', () => {
    const result = assessPartSurvival(
      'Radio Receiver Module',
      {
        zones: ['rear'],
        severity: 'moderate',
      },
    )

    expect(result.excluded).toBe(false)
    expect(result.probability).toBe(100)
  })

  it('heavily discounts rear body parts after severe rear damage', () => {
    const result = assessPartSurvival(
      'Rear Bumper Reinforcement',
      {
        zones: ['rear'],
        severity: 'severe',
      },
    )

    expect(result.excluded).toBe(true)
    expect(result.probability).toBeLessThan(25)
  })

  it('protects tested drivetrain value when the vehicle runs and drives', () => {
    const result = assessPartSurvival(
      'Automatic Transmission',
      {
        zones: ['front'],
        severity: 'moderate',
        drivetrainTested: true,
        runsAndDrives: true,
      },
    )

    expect(result.excluded).toBe(false)
    expect(result.probability).toBeGreaterThanOrEqual(90)
  })

  it('discounts electronics in severe flood damage', () => {
    const result = assessPartSurvival(
      'Body Control Module BCM',
      {
        zones: ['flood'],
        severity: 'severe',
      },
    )

    expect(result.excluded).toBe(true)
    expect(result.probability).toBe(5)
  })

  it('damages only the affected side when side damage is specified', () => {
    const left = assessPartSurvival(
      'Left Driver Door Mirror',
      {
        zones: ['left_side'],
        severity: 'severe',
      },
    )

    const right = assessPartSurvival(
      'Right Passenger Door Mirror',
      {
        zones: ['left_side'],
        severity: 'severe',
      },
    )

    expect(left.excluded).toBe(true)
    expect(right.excluded).toBe(false)
    expect(right.probability).toBe(100)
  })
})
