export type PullListItem = {
  id: string
  partMasterId: string | null
  partName: string
  partCode: string
  category: string
  side: string
  position: string
  priority: number
  notes: string
  quantity: number
  selected: boolean
  status: 'planned' | 'pulled' | 'skipped' | 'damaged' | 'not_present'
}

export type PullListVehicle = {
  id?: string | null
  stockNumber?: string | null
  vin?: string | null
  year?: string | number | null
  make?: string | null
  model?: string | null
  trim?: string | null
}

export type PullListDecode = {
  make?: string | null
  model?: string | null
  trim?: string | null
  bodyClass?: string | null
  driveType?: string | null
  engineDisplacement?: string | null
  engineCylinders?: string | null
  fuelType?: string | null
  transmissionStyle?: string | null
  plant?: string | null
  gvwr?: string | null
}

export type PullListMaster = {
  id?: string | null
  part_name?: string | null
  part_code?: string | null
  category?: string | null
  side?: string | null
  position?: string | null
  default_pull_priority?: number | null
  typical_weight?: number | null
  requires_testing?: boolean | null
  normally_shipped?: boolean | null
  active?: boolean | null
}

export function estimateRecoverySeedValue(
  item: Pick<PullListItem, 'partName' | 'category'>,
) {
  const text =
    `${item.partName} ${item.category}`
      .toLowerCase()

  if (text.includes('engine')) return 4000
  if (text.includes('transmission')) return 2500

  if (
    text.includes('transfer case')
  ) return 1200

  if (text.includes('turbo')) return 1000

  if (
    text.includes('differential') ||
    text.includes('rear axle') ||
    text.includes('front axle')
  ) return 900

  if (
    text.includes('catalytic') ||
    text.includes('converter')
  ) return 800

  if (text.includes('headlight')) return 500

  if (
    text.includes('ecm') ||
    text.includes('pcm') ||
    text.includes('bcm') ||
    text.includes('tcm') ||
    text.includes('control module') ||
    text.includes('computer')
  ) return 400

  if (text.includes('door')) return 350
  if (text.includes('tail light')) return 300
  if (text.includes('radio')) return 250
  if (text.includes('wheel')) return 225

  if (
    text.includes('alternator') ||
    text.includes('starter')
  ) return 125

  if (text.includes('switch')) return 75

  return 150
}

export function rankPullListForRecovery(
  items: PullListItem[],
) {
  return [...items].sort(
    (left, right) =>
      estimateRecoverySeedValue(right) -
        estimateRecoverySeedValue(left) ||
      left.partName.localeCompare(
        right.partName,
      ),
  )
}

const defaultQuantityForPart = (partName: string) => {
  const normalized = partName.toLowerCase()
  if (normalized.includes('wheel') || normalized.includes('door') || normalized.includes('module')) {
    return 2
  }
  return 1
}

export function buildVehiclePullList(vehicle: PullListVehicle | null, decode: PullListDecode | null, masters: PullListMaster[] = []): PullListItem[] {
  return (masters || [])
    .filter((master) => master.active !== false)
    .map((master) => {
      const partName = String(master.part_name || 'Part').trim()
      const partCode = String(master.part_code || 'PRT').trim().toUpperCase()
      const category = String(master.category || 'Other').trim()
      const side = String(master.side || '').trim()
      const position = String(master.position || '').trim()

      return {
        id: `${vehicle?.id ?? 'vehicle'}-${partCode}`,
        partMasterId: typeof master.id === 'string' ? master.id : null,
        partName,
        partCode,
        category,
        side,
        position,
        priority: Number(master.default_pull_priority ?? 100),
        notes: [vehicle?.make, vehicle?.model, decode?.bodyClass, decode?.driveType].filter(Boolean).join(' • '),
        quantity: defaultQuantityForPart(partName),
        selected: true,
        status: 'planned' as const,
      }
    })
    .sort((left, right) => left.priority - right.priority || left.partName.localeCompare(right.partName))
}
