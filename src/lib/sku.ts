export type PartMasterRecord = {
  id: string
  part_code: string
  part_name: string
  category?: string | null
  is_active?: boolean | null
}

function normalizeToken(value: string) {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function getPartCodeFromPartMaster(partName: string, category: string, partMasters: PartMasterRecord[] = []) {
  const normalizedPartName = normalizeToken(partName)
  const normalizedCategory = normalizeToken(category)

  const match = partMasters.find((master) => {
    if (master.is_active === false) {
      return false
    }

    const normalizedMasterName = normalizeToken(master.part_name)
    const normalizedMasterCategory = normalizeToken(master.category ?? '')

    return (
      normalizedMasterName === normalizedPartName ||
      normalizedMasterName.includes(normalizedPartName) ||
      normalizedPartName.includes(normalizedMasterName) ||
      normalizedMasterCategory === normalizedCategory ||
      normalizedMasterCategory.includes(normalizedCategory)
    )
  })

  return match?.part_code?.trim().toUpperCase() || null
}

export function getFallbackPartCode(partName: string, category: string) {
  const combined = `${partName} ${category}`.toUpperCase()
  const cleaned = combined.replace(/[^A-Z0-9]+/g, ' ')
  const words = cleaned.split(/\s+/).filter(Boolean)

  if (!words.length) {
    return 'PRT'
  }

  const normalized = words.join(' ')
  const keywordMap: Record<string, string> = {
    ALTERNATOR: 'ALT',
    ENGINE: 'ENG',
    TRANSMISSION: 'TRN',
    CATALYTIC: 'CAT',
    CONVERTER: 'CAT',
    HEADLIGHT: 'HL',
    RIGHTHEADLIGHT: 'RHL',
    LEFTHEADLIGHT: 'LHL',
    FENDER: 'FDR',
    REARFENDER: 'RFDR',
    FRONTFENDER: 'FFDR',
    DOOR: 'DR',
    WINDOW: 'WND',
    BATTERY: 'BAT',
    SENSOR: 'SNS',
    MIRROR: 'MIR',
    WHEEL: 'WHL',
  }

  const directMatch = Object.keys(keywordMap).find((key) => normalized.includes(key))
  if (directMatch) {
    return keywordMap[directMatch]
  }

  const firstWord = words[0]
  const secondWord = words[1]
  const thirdWord = words[2]

  if (firstWord && secondWord && thirdWord) {
    return `${firstWord[0]}${secondWord[0]}${thirdWord[0]}`
  }

  if (firstWord && secondWord) {
    return `${firstWord[0]}${secondWord[0]}`
  }

  return firstWord.slice(0, 3) || 'PRT'
}

export function buildGeneratedSku(stockNumber: string, partCode: string, sequence: number | string) {
  const normalizedStock = (stockNumber || 'TX-000001').trim().toUpperCase()
  const normalizedCode = (partCode || 'PRT').trim().toUpperCase()
  const normalizedSequence = String(sequence).padStart(3, '0')
  return `${normalizedStock}-${normalizedCode}-${normalizedSequence}`
}

export function buildSkuPreview(stockNumber: string, partCode: string, sequence: number | string) {
  return buildGeneratedSku(stockNumber, partCode, sequence)
}

export function isInvalidSku(sku: string) {
  return !/^[A-Z0-9-]+-[A-Z0-9]+-\d{3}$/.test((sku || '').trim().toUpperCase())
}

export function buildCode128SvgDataUri(value: string) {
  const normalized = (value || '').trim().toUpperCase()
  if (!normalized) {
    return ''
  }

  const bars = normalized.split('').map((char, index) => {
    const code = char.charCodeAt(0) % 10
    const width = 1 + ((code + index) % 3)
    return { width, isBar: index % 2 === 0 }
  })

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="70" viewBox="0 0 240 70">
      <rect width="240" height="70" fill="white" />
      ${bars.map((bar, index) => `<rect x="${index * 4 + 8}" y="8" width="${bar.width * 2}" height="54" fill="${bar.isBar ? 'black' : 'white'}" />`).join('')}
    </svg>
  `

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
