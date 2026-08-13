export type DamageSeverity =
  | 'light'
  | 'moderate'
  | 'severe'
  | 'unknown'

export type DamageZone =
  | 'front'
  | 'rear'
  | 'left_front'
  | 'left_side'
  | 'left_rear'
  | 'right_front'
  | 'right_side'
  | 'right_rear'
  | 'roof'
  | 'underbody'
  | 'flood'
  | 'fire'
  | 'mechanical'
  | 'unknown'

export type DamageProfile = {
  zones: DamageZone[]
  severity: DamageSeverity
  runsAndDrives?: boolean | null
  drivetrainTested?: boolean
}

export type PartSurvivalAssessment = {
  probability: number
  excluded: boolean
  reason: string | null
  matchedDamageZones: DamageZone[]
}

type PartDamageRule = {
  keywords: string[]
  zones: DamageZone[]
  severityPenalty: {
    light: number
    moderate: number
    severe: number
    unknown: number
  }
}

const rules: PartDamageRule[] = [
  {
    keywords: [
      'headlight',
      'headlamp',
      'fog light',
      'grille',
      'front bumper',
      'radiator support',
      'radiator',
      'condenser',
      'cooling fan',
      'fan assembly',
      'front impact',
      'front radar',
      'front camera',
    ],
    zones: ['front', 'left_front', 'right_front'],
    severityPenalty: {
      light: 25,
      moderate: 65,
      severe: 95,
      unknown: 45,
    },
  },
  {
    keywords: [
      'left headlight',
      'left headlamp',
      'left fender',
      'driver fender',
      'left fog',
      'driver fog',
      'left front door',
      'driver front door',
      'left mirror',
      'driver mirror',
    ],
    zones: ['left_front'],
    severityPenalty: {
      light: 35,
      moderate: 75,
      severe: 100,
      unknown: 55,
    },
  },
  {
    keywords: [
      'right headlight',
      'right headlamp',
      'right fender',
      'passenger fender',
      'right fog',
      'passenger fog',
      'right front door',
      'passenger front door',
      'right mirror',
      'passenger mirror',
    ],
    zones: ['right_front'],
    severityPenalty: {
      light: 35,
      moderate: 75,
      severe: 100,
      unknown: 55,
    },
  },
  {
    keywords: [
      'tail light',
      'taillight',
      'rear bumper',
      'decklid',
      'deck lid',
      'trunk lid',
      'liftgate',
      'tailgate',
      'rear camera',
      'rear radar',
      'rear impact',
    ],
    zones: ['rear', 'left_rear', 'right_rear'],
    severityPenalty: {
      light: 25,
      moderate: 65,
      severe: 95,
      unknown: 45,
    },
  },
  {
    keywords: [
      'left rear door',
      'driver rear door',
      'left quarter',
      'left tail light',
      'left taillight',
    ],
    zones: ['left_rear'],
    severityPenalty: {
      light: 35,
      moderate: 75,
      severe: 100,
      unknown: 55,
    },
  },
  {
    keywords: [
      'right rear door',
      'passenger rear door',
      'right quarter',
      'right tail light',
      'right taillight',
    ],
    zones: ['right_rear'],
    severityPenalty: {
      light: 35,
      moderate: 75,
      severe: 100,
      unknown: 55,
    },
  },
  {
    keywords: [
      'left door',
      'driver door',
      'left mirror',
      'driver mirror',
      'left window regulator',
      'left window motor',
      'left seat',
      'driver seat',
    ],
    zones: ['left_side'],
    severityPenalty: {
      light: 30,
      moderate: 70,
      severe: 95,
      unknown: 50,
    },
  },
  {
    keywords: [
      'right door',
      'passenger door',
      'right mirror',
      'passenger mirror',
      'right window regulator',
      'right window motor',
      'right seat',
      'passenger seat',
    ],
    zones: ['right_side'],
    severityPenalty: {
      light: 30,
      moderate: 70,
      severe: 95,
      unknown: 50,
    },
  },
  {
    keywords: [
      'sunroof',
      'moonroof',
      'roof rail',
      'roof rack',
      'headliner',
      'overhead console',
    ],
    zones: ['roof'],
    severityPenalty: {
      light: 30,
      moderate: 70,
      severe: 95,
      unknown: 50,
    },
  },
  {
    keywords: [
      'subframe',
      'crossmember',
      'control arm',
      'steering rack',
      'differential',
      'transfer case',
      'fuel tank',
      'exhaust',
      'driveshaft',
      'drive shaft',
    ],
    zones: ['underbody'],
    severityPenalty: {
      light: 20,
      moderate: 55,
      severe: 90,
      unknown: 40,
    },
  },
]

const electricalKeywords = [
  'module',
  'computer',
  'ecu',
  'ecm',
  'pcm',
  'bcm',
  'tcm',
  'radio',
  'amplifier',
  'screen',
  'display',
  'cluster',
  'switch',
  'sensor',
  'camera',
  'radar',
]

const fireSensitiveKeywords = [
  ...electricalKeywords,
  'engine',
  'transmission',
  'harness',
  'starter',
  'alternator',
  'compressor',
]

const drivetrainKeywords = [
  'engine',
  'motor',
  'transmission',
  'transaxle',
  'transfer case',
  'differential',
]

function containsAny(
  value: string,
  keywords: string[],
) {
  return keywords.some((keyword) =>
    value.includes(keyword),
  )
}

function clampProbability(value: number) {
  return Math.max(
    0,
    Math.min(100, Math.round(value)),
  )
}

export function assessPartSurvival(
  partName: string,
  profile: DamageProfile,
): PartSurvivalAssessment {
  const normalizedPartName =
    String(partName || '')
      .trim()
      .toLowerCase()

  const zones =
    Array.isArray(profile.zones)
      ? profile.zones
      : []

  const severity =
    profile.severity || 'unknown'

  let probability = 100
  const reasons: string[] = []
  const matchedZones =
    new Set<DamageZone>()

  for (const rule of rules) {
    if (
      !containsAny(
        normalizedPartName,
        rule.keywords,
      )
    ) {
      continue
    }

    const matchingZones =
      rule.zones.filter((zone) =>
        zones.includes(zone),
      )

    if (!matchingZones.length) {
      continue
    }

    const penalty =
      rule.severityPenalty[severity]

    probability =
      Math.min(
        probability,
        100 - penalty,
      )

    for (const zone of matchingZones) {
      matchedZones.add(zone)
    }

    reasons.push(
      `${severity} ${matchingZones.join(
        '/',
      )} damage`,
    )
  }

  if (
    zones.includes('flood') &&
    containsAny(
      normalizedPartName,
      electricalKeywords,
    )
  ) {
    const floodProbability =
      severity === 'light'
        ? 50
        : severity === 'moderate'
          ? 20
          : severity === 'severe'
            ? 5
            : 30

    probability =
      Math.min(
        probability,
        floodProbability,
      )

    matchedZones.add('flood')
    reasons.push(
      'flood exposure risk for electronics',
    )
  }

  if (
    zones.includes('fire') &&
    containsAny(
      normalizedPartName,
      fireSensitiveKeywords,
    )
  ) {
    const fireProbability =
      severity === 'light'
        ? 35
        : severity === 'moderate'
          ? 10
          : severity === 'severe'
            ? 0
            : 20

    probability =
      Math.min(
        probability,
        fireProbability,
      )

    matchedZones.add('fire')
    reasons.push(
      'fire exposure risk',
    )
  }

  if (
    containsAny(
      normalizedPartName,
      drivetrainKeywords,
    )
  ) {
    if (
      profile.drivetrainTested &&
      profile.runsAndDrives === true
    ) {
      probability =
        Math.max(
          probability,
          90,
        )

      reasons.push(
        'drivetrain successfully tested',
      )
    } else if (
      profile.runsAndDrives === false
    ) {
      probability =
        Math.min(
          probability,
          55,
        )

      reasons.push(
        'vehicle does not run and drive',
      )
    }
  }

  const finalProbability =
    clampProbability(probability)

  return {
    probability: finalProbability,

    /*
     * Under 25% survival probability:
     * do NOT count toward investment recovery
     * unless the owner later confirms the part good.
     */
    excluded:
      finalProbability < 25,

    reason:
      reasons.length
        ? reasons.join(' • ')
        : null,

    matchedDamageZones:
      Array.from(matchedZones),
  }
}
