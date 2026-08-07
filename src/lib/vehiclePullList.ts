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
