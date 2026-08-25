import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import './App.css'
import { TagPreview, type TagMode, type TagPreviewData } from './components/TagPreview'
import MobileCaptureMode from './components/MobileCaptureMode'
import { supabase } from './lib/supabase'
import { buildPartPhotoStoragePath, compressImage, getPhotoValidationError, type PartPhoto } from './lib/partPhotos'
import { buildCode128SvgDataUri, buildSkuPreview, getFallbackPartCode, getPartCodeFromPartMaster, isInvalidSku, type PartMasterRecord } from './lib/sku'
import { TEXAS_OEM_ZEBRA_LOGO } from './lib/zebraLogo'
import QRCode from 'qrcode'
import { buildVehicleDecodeSummary, isValidVin, normalizeVin, type VinDecodeResult } from './lib/vin'
import {
  buildVehiclePullList,
  rankPullListForRecovery,
  type PullListItem,
} from './lib/vehiclePullList'
import {
  type DamageProfile,
  type DamageSeverity,
  type DamageZone,
} from './lib/damageIntelligence'
import {
  buildRecoveryReport,
  recoveryInputFromFamilyMarket,
  type RecoveryPartInput,
  type RecoveryReport,
  type PartFamilyMarketResult,
} from './lib/recoveryIntelligence'
import { calculateAdjustedMedian, estimateRecommendation, normalizeSoldComps, type MarketComp, type MarketRecommendation } from './lib/pricing'
import { buildFallbackListingDraft, normalizeServerListingDraft, type ListingDraft, type ListingDraftHistory } from './lib/listingDraft'
import { buildTexasOemEbayDescription as buildTexasOemEbayDescriptionV3 } from './lib/ebayDescriptionTemplateV3'

type VehicleFormState = {
  vin: string
  year: string
  make: string
  model: string
  trim: string
  purchasePrice: string
  auctionFees: string
  transportCost: string
  purchaseDate: string
  notes: string
  damageZones: DamageZone[]
  damageSeverity: DamageSeverity
  runsAndDrives: '' | 'yes' | 'no'
  drivetrainTested: boolean
}

type Vehicle = {
  id: string
  stockNumber: string
  vin: string
  year: string
  make: string
  model: string
  trim: string
  purchasePrice: number
  totalInvestment: number
  stage: string
  progress: number
  jobsCompleted: number
  totalJobs: number
  remainingEstimatedProfit: number
  scrapValue: number
  catalyticConverterValue: number
}

type VehicleRecord = {
  id: string
  company_id: string
  stock_number: string
  vin: string
  year: string
  make: string
  model: string
  trim: string
  purchase_price: number | null
  purchase_date: string | null
  status: string | null
  workflow_stage: string | null
  stage: string | null
  progress: number | null
}

type JobRecord = {
  id: string
  vehicle_id: string
  job_name: string
  job_type: string
  estimated_value: number | null
  status: string | null
  created_at: string | null
  completed_at: string | null
}

type Part = {
  id: string
  createdAt?: string | null
  vehicleId: string | null
  vehicleStockNumber?: string | null
  vehicleYear: string
  vehicleMake: string
  vehicleModel: string
  vehicleVin: string
  primaryPhotoUrl?: string | null
  sku: string
  side?: string | null
  position?: string | null
  skuCode?: string | null
  skuPreview?: string | null
  barcodeData?: string | null
  partName: string
  partNumber: string
  interchangeNumber: string
  brand: string
  category: string
  condition: string
  engine: string
  transmission: string
  color: string
  location: string
  shelf: string
  bin: string
  quantity: number
  cost: number
  listPrice: number
  soldPrice: number
  weight: number
  ebayItemId: string
  ebayStatus: string
  dateListed: string
  dateSold: string
  listed: boolean
  sold: boolean
  cleaned?: boolean
  photographed?: boolean
  status: string
  notes: string
  photoCount: number
}


type InterchangeCandidate = {
  candidatePartNumber: string
  confidence: number
  evidenceCount: number
  externalSellerCount: number
  evidenceSource: string
  sellers: string[]
}

type VerifiedInterchange = {
  partNumber: string
  approvedAt: string | null
  notes: string | null
}

type InterchangeIntelligenceResult = {
  sourcePartNumber: string
  verified: VerifiedInterchange[]
  candidates: InterchangeCandidate[]
  marketSkipped: boolean
  message: string
}

type ListingDraftRecord = {
  part_id: string
  title: string
  condition_description: string
  description: string
  description_html: string
  category_suggestion: string
  item_specifics: Record<string, unknown>
  compatibility_notes: string
  pricing_status: string
  draft_status: string
  ebay_offer_id: string | null
  ebay_category_id: string | null
  ebay_category_name: string | null
  ebay_draft_created_at: string | null
  updated_at: string | null
}

type InventoryFilter = 'all' | 'not-listed' | 'drafts' | 'listed' | 'sold' | 'no-shelf' | 'no-photos'

type InventorySort = 'newest' | 'oldest' | 'part-name' | 'shelf-location' | 'sku'

type PartFormState = {
  partName: string
  partNumber: string
  interchangeNumber: string
  brand: string
  category: string
  condition: string
  engine: string
  transmission: string
  color: string
  location: string
  shelf: string
  bin: string
  quantity: string
  cost: string
  listPrice: string
  soldPrice: string
  weight: string
  ebayItemId: string
  ebayStatus: string
  dateListed: string
  dateSold: string
  notes: string
  photoCount: string
  skuCode: string
  skuPreview: string
}

const initialPartFormState: PartFormState = {
  partName: '',
  partNumber: '',
  interchangeNumber: '',
  brand: '',
  category: '',
  condition: '',
  engine: '',
  transmission: '',
  color: '',
  location: '',
  shelf: '',
  bin: '',
  quantity: '1',
  cost: '0',
  listPrice: '0',
  soldPrice: '0',
  weight: '',
  ebayItemId: '',
  ebayStatus: 'Not Listed',
  dateListed: '',
  dateSold: '',
  notes: '',
  photoCount: '0',
  skuCode: '',
  skuPreview: '',
}

const queue = [
  { title: '2020 Silverado 1500', status: 'Engine out', note: 'Trans and harness next' },
  { title: '2017 Toyota Camry', status: 'Interior stripped', note: 'Battery and ECU pending' },
  { title: '2014 F-250', status: 'Body ready', note: 'Doors and bed panels staged' },
]

const PART_TYPE_OPTIONS = [
  { label: 'Engine', code: 'ENG' },
  { label: 'Transmission', code: 'TRN' },
  { label: 'Module / Computer', code: 'MOD' },
  { label: 'Electrical Wiring / Harness', code: 'HAR' },
  { label: 'Brake Component', code: 'BRK' },
  { label: 'Wheel / Rim', code: 'WHL' },
  { label: 'Exhaust', code: 'EXH' },
  { label: 'Catalytic Converter', code: 'CAT' },
  { label: 'Door', code: 'DR' },
  { label: 'Body Panel', code: 'PNL' },
  { label: 'Fuel Tank', code: 'FTK' },
  { label: 'Headlight', code: 'HL' },
  { label: 'Taillight', code: 'TL' },
  { label: 'Mirror', code: 'MIR' },
  { label: 'Radio / Infotainment', code: 'RAD' },
  { label: 'Screen / Display', code: 'SCR' },
  { label: 'Switch / Control', code: 'SWT' },
  { label: 'Suspension', code: 'SUS' },
  { label: 'Steering', code: 'STR' },
  { label: 'Axle / Differential', code: 'AXL' },
  { label: 'Driveshaft', code: 'DRV' },
  { label: 'Transfer Case', code: 'TCS' },
  { label: 'Starter', code: 'STA' },
  { label: 'Alternator', code: 'ALT' },
  { label: 'A/C Component', code: 'AC' },
  { label: 'A/C Vent', code: 'VENT' },
  { label: 'Cab Light', code: 'CBL' },
  { label: 'Cooling', code: 'CLG' },
  { label: 'Interior', code: 'INT' },
  { label: 'Intake', code: 'INTK' },
  { label: 'Trim', code: 'TRIM' },
  { label: 'Seat', code: 'SEAT' },
  { label: 'Seat Belt', code: 'SBLT' },
  { label: 'Seat Track', code: 'STRK' },
  { label: 'Spare Tire Kit / Jack', code: 'JACK' },
  { label: 'Glass', code: 'GLS' },
  { label: 'Fuel System', code: 'FUEL' },
  { label: 'Fuse Box', code: 'FBX' },
  { label: 'Hose', code: 'HOS' },
  { label: 'Latch', code: 'LAT' },
  { label: 'Emissions', code: 'EMS' },
  { label: 'Other', code: 'PRT' },
].sort((a, b) => a.label.localeCompare(b.label))

const metrics = [
  { label: 'Ready to list', value: '128', detail: 'Parts tagged and priced' },
  { label: 'Active vehicles', value: '4', detail: 'In process this week' },
  { label: 'Projected gross', value: '$18.2k', detail: 'Based on current pulls' },
  { label: 'Next pickup', value: '2:30 PM', detail: 'North Austin yard' },
]

const partStorageKey = 'texas-oem-os.parts'
const vinDecodeCacheKey = 'texas-oem-os.vin-decode-cache'
const inventoryFilterOptions: Array<{ value: InventoryFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'not-listed', label: 'Not Listed' },
  { value: 'drafts', label: 'Drafts' },
  { value: 'listed', label: 'Listed' },
  { value: 'sold', label: 'Sold' },
  { value: 'no-shelf', label: 'No BIN Location' },
  { value: 'no-photos', label: 'No Photos' },
]
const inventorySortOptions: Array<{ value: InventorySort; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'part-name', label: 'Part Name' },
  { value: 'shelf-location', label: 'BIN Location' },
  { value: 'sku', label: 'SKU' },
]

function readStoredParts() {
  if (typeof window === 'undefined') {
    return [] as Part[]
  }

  try {
    const storedValue = window.localStorage.getItem(partStorageKey)
    if (!storedValue) {
      return [] as Part[]
    }

    const parsed = JSON.parse(storedValue) as Part[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return [] as Part[]
  }
}

function persistPartsToStorage(parts: Part[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(partStorageKey, JSON.stringify(parts))
}

function readStoredVinDecodes() {
  if (typeof window === 'undefined') {
    return {} as Record<string, VinDecodeResult>
  }

  try {
    const storedValue = window.localStorage.getItem(vinDecodeCacheKey)
    if (!storedValue) {
      return {} as Record<string, VinDecodeResult>
    }

    const parsed = JSON.parse(storedValue) as Record<string, VinDecodeResult>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {} as Record<string, VinDecodeResult>
  }
}

function persistVinDecodes(decodes: Record<string, VinDecodeResult>) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(vinDecodeCacheKey, JSON.stringify(decodes))
}

const workflowStages = [
  'Purchased',
  'Power Wash',
  'Test Drivetrain / Electrical',
  'Pull Interior & Body Parts',
  'Pull Modules / Electronics',
  'Pull Catalytic Converters',
  'Pull Engine',
  'Pull Transmission / Drivetrain',
  'Pull Suspension / Remaining Valuable Parts',
  'Pull Chassis Harness / Final Scrap Recovery',
  'Scrap Shell',
  'Clean Parts',
  'Tag / Generate SKUs + Photograph + Shelf Parts',
  'Create eBay Listings',
  'Sold Out',
] as const

const productionJobOrder = [
  { label: 'Power Wash', aliases: ['Power Wash'] },
  { label: 'Test Drivetrain / Electrical', aliases: ['Test Drivetrain / Electrical', 'Test Drivetrain'] },
  { label: 'Pull Interior & Body Parts', aliases: ['Pull Interior & Body Parts'] },
  { label: 'Pull Modules / Electronics', aliases: ['Pull Modules / Electronics', 'Pull Modules'] },
  { label: 'Pull Catalytic Converters', aliases: ['Pull Catalytic Converters'] },
  { label: 'Pull Engine', aliases: ['Pull Engine'] },
  { label: 'Pull Transmission / Drivetrain', aliases: ['Pull Transmission / Drivetrain', 'Pull Transmission'] },
  { label: 'Pull Suspension / Remaining Valuable Parts', aliases: ['Pull Suspension / Remaining Valuable Parts'] },
  { label: 'Pull Chassis Harness / Final Scrap Recovery', aliases: ['Pull Chassis Harness / Final Scrap Recovery', 'Pull Chassis Harness'] },
  { label: 'Scrap Shell', aliases: ['Scrap Shell'] },
  { label: 'Clean Parts', aliases: ['Clean Parts'] },
  {
    label: 'Tag / Generate SKUs + Photograph + Shelf Parts',
    aliases: ['Tag / Generate SKUs + Photograph + Shelf Parts', 'Generate SKUs', 'Photograph Parts', 'Shelf Parts'],
    groupedLegacy: ['Generate SKUs', 'Photograph Parts', 'Shelf Parts'],
  },
  { label: 'Create eBay Listings', aliases: ['Create eBay Listings'] },
] as const

type ProductionChecklistItem = {
  key: string
  label: string
  jobs: JobRecord[]
  status: 'Not Started' | 'In Progress' | 'Complete'
}

const initialFormState: VehicleFormState = {
  vin: '',
  year: '',
  make: '',
  model: '',
  trim: '',
  purchasePrice: '',
  auctionFees: '',
  transportCost: '',
  purchaseDate: '',
  notes: '',
  damageZones: [],
  damageSeverity: 'unknown',
  runsAndDrives: '',
  drivetrainTested: false,
}

const COMPANY_ID = '7eaea6d8-d6d5-495e-97e8-430376b46c6f'

function formatCurrency(value: number | null | undefined) {
  const normalized = Number.isFinite(value ?? NaN) ? Number(value) : 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(normalized)
}

function getOemBrandFromVehicleMake(
  make: string | null | undefined,
) {
  const normalized =
    String(make ?? '')
      .trim()
      .toLowerCase()

  if (
    [
      'chevrolet',
      'chevy',
      'gmc',
      'buick',
      'cadillac',
      'pontiac',
      'saturn',
      'hummer',
      'oldsmobile',
    ].includes(normalized)
  ) {
    return 'GM'
  }

  if (
    [
      'ford',
      'lincoln',
      'mercury',
    ].includes(normalized)
  ) {
    return 'Ford'
  }

  if (
    [
      'dodge',
      'ram',
      'jeep',
      'chrysler',
      'plymouth',
    ].includes(normalized)
  ) {
    return 'Mopar'
  }

  if (
    [
      'toyota',
      'lexus',
      'scion',
    ].includes(normalized)
  ) {
    return 'Toyota'
  }

  if (
    [
      'honda',
      'acura',
    ].includes(normalized)
  ) {
    return 'Honda'
  }

  if (
    [
      'nissan',
      'infiniti',
      'datsun',
    ].includes(normalized)
  ) {
    return 'Nissan'
  }

  return make
    ? String(make).trim()
    : ''
}

function getVehicleTitle(vehicle: Vehicle | null) {
  if (!vehicle) {
    return 'Loading live vehicle data…'
  }

  const parts = [vehicle.year, vehicle.make, vehicle.model].filter((value): value is string => Boolean(value && String(value).trim()))
  return parts.join(' ')
}

function generateStockNumber() {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const suffix = String(now.getTime()).slice(-4)
  return `TX-${stamp}-${suffix}`
}

function readStringValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  }
  return ''
}

function getPartVehicleTitle(part: Part) {
  const parts = [part.vehicleYear, part.vehicleMake, part.vehicleModel].filter((value) => Boolean(value && String(value).trim()))
  return parts.join(' ')
}


function getPartShelfLocation(part: Part) {
  return (part.bin || part.shelf || part.location || '').trim()
}

function getInventoryWorkflowStatus(part: Part) {
  if (part.sold) return 'Sold'
  if (part.listed) return 'Listed'
  if (part.photographed || (part.photoCount || 0) > 0) return 'Photographed'
  if (part.cleaned) return 'Cleaned'
  if (getPartShelfLocation(part)) return 'Shelved'
  return 'Intake'
}

function getListedStatusBadgeClass(isActive: boolean) {
  return isActive ? 'inventoryBadge listed' : 'inventoryBadge pending'
}

function getSoldStatusBadgeClass(isActive: boolean) {
  return isActive ? 'inventoryBadge sold' : 'inventoryBadge pending'
}

function normalizeSearchToken(value: string | number | null | undefined) {
  return String(value ?? '').trim().toLowerCase()
}

function getSuggestedPartName(vehicle: Vehicle | null, stage?: string | null) {
  const normalizedStage = String(stage ?? vehicle?.stage ?? '').trim().toLowerCase()

  if (normalizedStage.includes('compressor')) return 'AC Compressor'
  if (normalizedStage.includes('alternator')) return 'Alternator'
  if (normalizedStage.includes('engine')) return 'Engine'
  if (normalizedStage.includes('transmission')) return 'Transmission'
  if (normalizedStage.includes('catalytic')) return 'Catalytic Converter'
  if (normalizedStage.includes('harness')) return 'Harness'
  if (normalizedStage.includes('interior')) return 'Interior'
  if (normalizedStage.includes('suspension')) return 'Suspension'
  if (normalizedStage.includes('battery')) return 'Battery'
  return ''
}



function generateShelfLocation(existingParts: Part[]) {
  const existingNumbers = existingParts
    .map((part) => part.shelf.match(/^A-(\d+)$/i)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))

  const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1
  return `A-${String(nextNumber).padStart(2, '0')}`
}

function readNumericValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return 0
}


function readBooleanValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
      if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
    }
  }
  return false
}

function mapPartRecordToPart(record: Record<string, unknown>): Part {
  const relatedPartMaster = Array.isArray(record.part_master)
    ? record.part_master[0]
    : record.part_master
  const partMasterRecord = relatedPartMaster && typeof relatedPartMaster === 'object'
    ? relatedPartMaster as Record<string, unknown>
    : null
  const relatedVehicle = Array.isArray(record.vehicle)
    ? record.vehicle[0]
    : record.vehicle
  const vehicleRecord = relatedVehicle && typeof relatedVehicle === 'object'
    ? relatedVehicle as Record<string, unknown>
    : null
  const relatedPhotos = Array.isArray(record.part_photos)
    ? record.part_photos.filter((photo): photo is Record<string, unknown> => Boolean(photo && typeof photo === 'object'))
    : []
  const sortedPhotos = [...relatedPhotos].sort((left, right) => {
    const leftPrimary = readBooleanValue(left, ['is_primary']) ? 1 : 0
    const rightPrimary = readBooleanValue(right, ['is_primary']) ? 1 : 0
    if (leftPrimary !== rightPrimary) {
      return rightPrimary - leftPrimary
    }

    const leftOrder = readNumericValue(left, ['sort_order'])
    const rightOrder = readNumericValue(right, ['sort_order'])
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }

    const leftCreated = Date.parse(readStringValue(left, ['created_at'])) || 0
    const rightCreated = Date.parse(readStringValue(right, ['created_at'])) || 0
    return leftCreated - rightCreated
  })
  const primaryPhotoRecord = sortedPhotos[0] ?? null

  return {
    id: typeof record.id === 'string' ? record.id : String(record.id ?? ''),
    createdAt: typeof record.created_at === 'string' ? record.created_at : null,
    vehicleId: typeof record.vehicle_id === 'string' ? record.vehicle_id : null,
    vehicleStockNumber: readStringValue(vehicleRecord ?? {}, ['stock_number']) || null,
    vehicleYear: readStringValue(vehicleRecord ?? {}, ['year']) || readStringValue(record, ['vehicle_year', 'year']),
    vehicleMake: readStringValue(vehicleRecord ?? {}, ['make']) || readStringValue(record, ['vehicle_make', 'make']),
    vehicleModel: readStringValue(vehicleRecord ?? {}, ['model']) || readStringValue(record, ['vehicle_model', 'model']),
    vehicleVin: readStringValue(vehicleRecord ?? {}, ['vin']) || readStringValue(record, ['vehicle_vin', 'vin']),
    primaryPhotoUrl: readStringValue(primaryPhotoRecord ?? {}, ['public_url']) || null,
    sku: typeof record.sku === 'string' ? record.sku : '',
    skuCode: typeof record.sku_code === 'string' ? record.sku_code : null,
    skuPreview: typeof record.sku_preview === 'string' ? record.sku_preview : null,
    barcodeData: typeof record.barcode_data === 'string' ? record.barcode_data : null,
    partName: readStringValue(partMasterRecord ?? {}, ['part_name']) || readStringValue(record, ['part_name', 'name', 'part', 'item_name', 'title']),
    partNumber: (() => {
      const masterCode =
        readStringValue(
          partMasterRecord ?? {},
          ['part_code'],
        )

      if (
        /^UNIDENTIFIED-/i.test(
          masterCode,
        )
      ) {
        return ''
      }

      return (
        masterCode ||
        readStringValue(
          record,
          [
            'part_number',
            'number',
            'item_number',
            'reference',
          ],
        )
      )
    })(),
    interchangeNumber: readStringValue(record, ['interchange_number', 'interchange']),
    brand:
      readStringValue(
        record,
        ['brand'],
      ) ||
      getOemBrandFromVehicleMake(
        readStringValue(
          vehicleRecord ?? {},
          ['make'],
        ),
      ),
    category: readStringValue(partMasterRecord ?? {}, ['category']) || readStringValue(record, ['category']),
    condition: readStringValue(record, ['condition']),
    engine: readStringValue(record, ['engine']),
    transmission: readStringValue(record, ['transmission']),
    color: readStringValue(record, ['color']),
    location: readStringValue(record, ['location']),
    shelf: readStringValue(record, ['shelf', 'shelf_location']),
    bin: readStringValue(record, ['bin']),
    quantity: readNumericValue(record, ['quantity', 'qty']) || 1,
    cost: readNumericValue(record, ['cost']),
    listPrice: readNumericValue(record, ['list_price', 'price']),
    soldPrice: readNumericValue(record, ['sale_price', 'sold_price']),
    weight: readNumericValue(record, ['weight']),
    ebayItemId: readStringValue(record, ['ebay_item_id', 'imported_ebay_item_id', 'ebay_item']),
    ebayStatus: readStringValue(record, ['ebay_status']) || (readBooleanValue(record, ['sold']) ? 'Sold' : readBooleanValue(record, ['listed']) ? 'Listed' : 'Not Listed'),
    dateListed: readStringValue(record, ['date_listed', 'listed_at']),
    dateSold: readStringValue(record, ['date_sold', 'sold_at']),
    listed: readBooleanValue(record, ['listed']),
    sold: readBooleanValue(record, ['sold']),
    cleaned: readBooleanValue(record, ['cleaned']),
    photographed: readBooleanValue(record, ['photographed']),
    status: readStringValue(record, ['status', 'part_status']) || (readBooleanValue(record, ['sold']) ? 'Sold' : readBooleanValue(record, ['listed']) ? 'Listed' : 'Not Listed'),
    notes: readStringValue(record, ['notes']),
    photoCount: Math.max(readNumericValue(record, ['photo_count']) || 0, sortedPhotos.length),
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getSkuPrefix(stockNumber: string, partCode: string) {
  const normalizedStock = (stockNumber || 'TX').trim().toUpperCase()
  const normalizedCode = (partCode || 'PRT').trim().toUpperCase()
  return `${normalizedStock}-${normalizedCode}`
}

function getSkuSuffixValue(sku: string, prefix: string) {
  const match = sku.trim().toUpperCase().match(new RegExp(`^${escapeRegExp(prefix)}-(\\d{3})$`))
  return match ? Number(match[1]) : 0
}

function isDuplicateSkuInsertError(error: { message?: string | null; code?: string | null } | null) {
  const message = error?.message ?? ''
  const code = error?.code ?? ''
  return code === '23505' || /duplicate key value violates unique constraint\s+"parts_sku_key"/i.test(message)
}

function buildTagPreviewData(part: Part, vehicle: Vehicle | null): TagPreviewData {
  const isStandalone = !part.vehicleId

  return {
    id: part.id,
    sku: part.sku,
    partName: part.partName || 'Unnamed Part',
    oemPartNumber: part.partNumber || 'N/A',
    donorYear: isStandalone ? '' : (part.vehicleYear || vehicle?.year || ''),
    donorMake: isStandalone ? '' : (part.vehicleMake || vehicle?.make || ''),
    donorModel: isStandalone ? '' : (part.vehicleModel || vehicle?.model || ''),
    vin: isStandalone ? '' : (part.vehicleVin || vehicle?.vin || ''),
    stockNumber: isStandalone ? '' : (part.vehicleStockNumber || vehicle?.stockNumber || ''),
    condition: part.condition || 'N/A',
    shelfLocation: part.shelf || part.location || 'UNASSIGNED',
    dateInventoried: part.createdAt || '',
    listPrice: part.listPrice || 0,
    notes: part.notes || '',
    cleaned: Boolean(part.cleaned),
    photographed: Boolean(part.photographed || part.photoCount > 0),
    listed: Boolean(part.listed),
    sold: Boolean(part.sold),
    internalUrl: `/parts/${part.id}`,
  }
}



function sanitizeZplText(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/\^/g, ' ')
    .replace(/~/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateZplText(value: string, maxLength: number) {
  const normalized = sanitizeZplText(value)

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

function buildTexasOemPartTagZpl(
  part: Part,
  vehicle: Vehicle | null,
) {
  const isStandalone = !part.vehicleId

  const partName =
    truncateZplText(
      part.partName || 'UNNAMED PART',
      64,
    )

  const sku =
    truncateZplText(
      part.sku || 'NO-SKU',
      42,
    )

  const safeSku =
    sanitizeZplText(sku)

  const oemNumber =
    truncateZplText(
      part.partNumber || 'N/A',
      30,
    )

  const warehouseLocation =
    truncateZplText(
      part.bin ||
        part.shelf ||
        part.location ||
        'UNASSIGNED',
      28,
    )

  const donorVehicle = isStandalone
    ? 'STANDALONE INVENTORY'
    : truncateZplText(
        [
          part.vehicleYear || vehicle?.year || '',
          part.vehicleMake || vehicle?.make || '',
          part.vehicleModel || vehicle?.model || '',
        ]
          .filter(Boolean)
          .join(' '),
        42,
      )

  const stockNumber = isStandalone
    ? 'N/A'
    : truncateZplText(
        part.vehicleStockNumber ||
          vehicle?.stockNumber ||
          '',
        28,
      ) || 'N/A'

  const vin = isStandalone
    ? 'N/A'
    : truncateZplText(
        part.vehicleVin ||
          vehicle?.vin ||
          '',
        24,
      ) || 'N/A'

  const condition =
    truncateZplText(
      part.condition || 'N/A',
      22,
    )

  const inventoriedDate = (() => {
    const raw =
      String(part.createdAt ?? '').trim()

    if (!raw) {
      return 'N/A'
    }

    const parsed =
      new Date(raw)

    if (Number.isNaN(parsed.getTime())) {
      return truncateZplText(raw, 16)
    }

    return parsed.toLocaleDateString('en-US')
  })()

  const tested =
    String(part.condition ?? '')
      .toLowerCase()
      .includes('tested')

  const testedMark =
    tested ? '[X] TESTED' : '[ ] TESTED'

  const cleanedMark =
    part.cleaned ? '[X] CLEANED' : '[ ] CLEANED'

  const photoMark =
    part.photographed ? '[X] PHOTO' : '[ ] PHOTO'

  const listedMark =
    part.listed ? '[X] LISTED' : '[ ] LISTED'

  const internalRecord =
    sanitizeZplText(
      part.id || safeSku,
    )

  return `^XA
^CI28
^PW1200
^LL900
^LH0,0
^PR4
^MD10

^FO22,18^GB1156,864,4^FS

^FX ===== BRAND HEADER =====
^FO320,30${TEXAS_OEM_ZEBRA_LOGO}^FS
^FO42,136^GB1116,3,3^FS
^FO42,145^GB1116,1,1^FS

^FX ===== PART NAME =====
^FO42,158^GB1116,112,3^FS
^FO62,175^A0N,44,44^FB1076,2,3,C,0^FD${partName}^FS

^FX ===== SKU / OEM =====
^FO42,270^GB1116,112,3^FS
^FO600,270^GB3,112,3^FS

^FO62,282^A0N,20,20^FB518,1,0,C,0^FDSKU^FS
^FO62,313^A0N,31,31^FB518,2,0,C,0^FD${sku}^FS

^FO620,282^A0N,20,20^FB518,1,0,C,0^FDOEM #^FS
^FO620,313^A0N,34,34^FB518,1,0,C,0^FD${oemNumber}^FS

^FX ===== BARCODE =====
^FO42,382^GB1116,128,3^FS
^FO130,395^BY3,2,78
^BCN,78,N,N,N
^FD${safeSku}^FS
^FO60,478^A0N,21,21^FB1080,1,0,C,0^FD${sku}^FS

^FX ===== DONOR / STORAGE =====
^FO42,510^GB1116,176,3^FS
^FO650,510^GB3,176,3^FS

^FO62,522^A0N,20,20^FB568,1,0,C,0^FDDONOR VEHICLE^FS
^FO62,552^A0N,29,29^FB568,2,2,C,0^FD${donorVehicle}^FS
^FO62,616^A0N,20,20^FB568,1,0,C,0^FDSTOCK #: ${stockNumber}^FS
^FO62,646^A0N,18,18^FB568,1,0,C,0^FDVIN: ${vin}^FS

^FO670,522^A0N,20,20^FB468,1,0,C,0^FDSTORAGE^FS
^FO670,554^A0N,40,40^FB468,1,0,C,0^FD${warehouseLocation}^FS
^FO670,612^A0N,20,20^FB468,1,0,C,0^FDCONDITION: ${condition}^FS
^FO670,646^A0N,18,18^FB468,1,0,C,0^FDINVENTORIED: ${inventoriedDate}^FS

^FX ===== BOTTOM / INTERNAL RECORD / QC =====
^FO42,686^GB1116,176,3^FS
^FO590,686^GB3,176,3^FS

^FO62,698^A0N,20,20^FB508,1,0,C,0^FDINTERNAL RECORD^FS

^FO82,728^BQN,2,5
^FDLA,${internalRecord}^FS

^FO230,750^A0N,17,17^FB330,4,0,L,0^FDID:^FS
^FO230,776^A0N,15,15^FB330,4,0,L,0^FD${internalRecord}^FS

^FO610,698^A0N,20,20^FB528,1,0,C,0^FDQUALITY CONTROL^FS

^FO640,742^A0N,24,24^FD${testedMark}^FS
^FO900,742^A0N,24,24^FD${cleanedMark}^FS

^FO640,800^A0N,24,24^FD${photoMark}^FS
^FO900,800^A0N,24,24^FD${listedMark}^FS

^XZ`
}

function buildTexasOemCompactTagZpl(
  part: Part,
  vehicle: Vehicle | null,
) {
  const isStandalone = !part.vehicleId

  const sku =
    truncateZplText(
      part.sku || 'NO-SKU',
      38,
    )

  const safeSku =
    sanitizeZplText(sku)

  const partName =
    truncateZplText(
      part.partName || 'UNNAMED PART',
      44,
    )

  const oemNumber =
    truncateZplText(
      part.partNumber || 'N/A',
      28,
    )

  const donorVehicle = isStandalone
    ? 'STANDALONE PART'
    : truncateZplText(
        [
          part.vehicleYear || vehicle?.year || '',
          part.vehicleMake || vehicle?.make || '',
          part.vehicleModel || vehicle?.model || '',
        ]
          .filter(Boolean)
          .join(' '),
        38,
      )

  const warehouseLocation =
    truncateZplText(
      part.bin ||
        part.shelf ||
        part.location ||
        'UNASSIGNED',
      26,
    )

  const price =
    Number.isFinite(Number(part.listPrice))
      ? `$${Math.round(Number(part.listPrice))}`
      : '$0'

  const internalRecord =
    part.id
      ? `/parts/${part.id}`
      : ''

  return `^XA
^CI28
^PW1200
^LL900
^LH0,0
^PR4
^MD10

^FO22,18^GB1156,864,4^FS

^FO320,35${TEXAS_OEM_ZEBRA_LOGO}^FS
^FO42,150^GB1116,3,3^FS

^FO70,190^A0N,22,22^FDSKU^FS
^FO70,225^A0N,48,48^FD${sku}^FS

^FO70,300^A0N,42,42^FB1060,2,5,L,0^FD${partName}^FS

^FO70,410^A0N,25,25^FDOEM # ${oemNumber}^FS

^FO70,465^A0N,24,24^FD${donorVehicle}^FS

^FO70,515^A0N,24,24^FDSHELF: ${warehouseLocation}   ${price}^FS

^FX ===== INTERNAL RECORD QR =====
^FX Larger readable QR, safely above Code 128
^FO930,390^BQN,2,4
^FDLA,${internalRecord}^FS

^FX ===== SKU CODE 128 =====
^FX Module width reduced to 2 so long SKUs stay inside 4x3 tag
^FO80,640^BY2,2,110
^BCN,110,N,N,N
^FD${safeSku}^FS

^FO60,770^A0N,24,24^FB1080,1,0,C,0^FD${sku}^FS

^XZ`
}


void buildTexasOemPartTagZpl

function getPartStatusLabel(part: Part) {
  if (part.status && part.status.trim()) return part.status.trim()
  if (part.sold) return 'Sold'
  if (part.listed) return 'Listed'
  return 'Not Listed'
}

function getPartStatusClass(part: Part) {
  const label = getPartStatusLabel(part)
  if (label === 'Sold') return 'inventoryBadge sold'
  if (label === 'Listed') return 'inventoryBadge listed'
  return 'inventoryBadge pending'
}

function normalizeJobStatus(status: string | null | undefined): 'Not Started' | 'In Progress' | 'Complete' {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (normalized === 'completed' || normalized === 'complete' || normalized === 'done') {
    return 'Complete'
  }
  if (normalized === 'in progress' || normalized === 'in_progress' || normalized === 'started') {
    return 'In Progress'
  }
  return 'Not Started'
}

function buildProductionChecklist(jobs: JobRecord[]): ProductionChecklistItem[] {
  const jobsByName = new Map<string, JobRecord[]>()
  jobs.forEach((job) => {
    const key = String(job.job_name ?? '').trim().toLowerCase()
    if (!key) return
    const current = jobsByName.get(key) ?? []
    jobsByName.set(key, [...current, job])
  })

  return productionJobOrder.map((step) => {
    let matchedJobs: JobRecord[] = []
    if ('groupedLegacy' in step && step.groupedLegacy.length > 0) {
      matchedJobs = step.groupedLegacy.flatMap((name) => jobsByName.get(name.toLowerCase()) ?? [])
      const combined = jobsByName.get(step.label.toLowerCase()) ?? []
      if (combined.length > 0) {
        matchedJobs = combined
      }
    } else {
      for (const alias of step.aliases) {
        const matched = jobsByName.get(alias.toLowerCase()) ?? []
        if (matched.length > 0) {
          matchedJobs = matched
          break
        }
      }
    }

    const statuses = matchedJobs.map((job) => normalizeJobStatus(job.status))
    const hasComplete = statuses.includes('Complete')
    const hasInProgress = statuses.includes('In Progress')
    const allComplete = statuses.length > 0 && statuses.every((status) => status === 'Complete')
    const status: 'Not Started' | 'In Progress' | 'Complete' = allComplete
      ? 'Complete'
      : hasInProgress || hasComplete
        ? 'In Progress'
        : 'Not Started'

    return {
      key: step.label,
      label: step.label,
      jobs: matchedJobs,
      status,
    }
  })
}

function getChecklistProgress(checklist: ProductionChecklistItem[]) {
  if (checklist.length === 0) return 0
  const completed = checklist.filter((item) => item.status === 'Complete').length
  return Math.round((completed / checklist.length) * 100)
}

function getChecklistStage(checklist: ProductionChecklistItem[]) {
  const firstIncomplete = checklist.find((item) => item.status !== 'Complete')
  if (!firstIncomplete) {
    return 'Sold Out'
  }
  return firstIncomplete.label
}

function getStageIndex(stage: string | null | undefined) {
  const normalizedStage = String(stage ?? 'Purchased').trim()
  const foundIndex = workflowStages.findIndex((workflowStage) => workflowStage === normalizedStage)
  return foundIndex >= 0 ? foundIndex : 0
}

function mapVehicleRecordToVehicle(record: VehicleRecord, jobs: JobRecord[]): Vehicle {
  const checklist = buildProductionChecklist(jobs)
  const purchasePrice = Number(record.purchase_price ?? 0)
  const totalInvestment = purchasePrice
  const completedJobs = checklist.filter((item) => item.status === 'Complete').length
  const totalJobs = checklist.length
  const progress = getChecklistProgress(checklist)
  const remainingEstimatedProfit = jobs
    .filter((job) => String(job.status ?? '').toLowerCase() !== 'completed')
    .reduce((sum, job) => sum + Number(job.estimated_value ?? 0), 0)
  const scrapValue = jobs.reduce((sum, job) => {
    const label = `${job.job_name ?? ''} ${job.job_type ?? ''}`.toLowerCase()
    return sum + (label.includes('scrap') ? Number(job.estimated_value ?? 0) : 0)
  }, 0)
  const catalyticConverterValue = jobs.reduce((sum, job) => {
    const label = `${job.job_name ?? ''} ${job.job_type ?? ''}`.toLowerCase()
    return sum + (label.includes('catalytic') ? Number(job.estimated_value ?? 0) : 0)
  }, 0)

  return {
    id: record.id,
    stockNumber: record.stock_number ?? '',
    vin: record.vin,
    year: record.year,
    make: record.make,
    model: record.model,
    trim: record.trim,
    purchasePrice,
    totalInvestment,
    stage: String(record.workflow_stage ?? record.stage ?? record.status ?? 'Purchased'),
    progress,
    jobsCompleted: completedJobs,
    totalJobs,
    remainingEstimatedProfit,
    scrapValue,
    catalyticConverterValue,
  }
}

function App() {
    const [activeView, setActiveView] = useState<
    'dashboard' | 'vehicles' | 'inventory' | 'ebay' | 'sales'
  >('dashboard')
  const [scannerValue, setScannerValue] = useState('')
const [scannedBin, setScannedBin] = useState<string | null>(null)
  const [showLocationDetails, setShowLocationDetails] = useState(false)
  const [locationAuditActive, setLocationAuditActive] = useState(false)
  const [locationAuditScannedIds, setLocationAuditScannedIds] =
    useState<string[]>([])
  const [locationAuditWrongParts, setLocationAuditWrongParts] =
    useState<Part[]>([])
  const [locationAuditUnknownScans, setLocationAuditUnknownScans] =
    useState<string[]>([])

  const [scannerMode, setScannerMode] = useState<'locate' | 'move'>('locate')
  const [moveDestinationBin, setMoveDestinationBin] = useState<string | null>(null)
  const moveDestinationBinRef = useRef<string | null>(null)
  const moveQueuedPartsRef = useRef<Part[]>([])

  // WAREHOUSE LOCATION LABEL GENERATOR
  const [locationWarehouse, setLocationWarehouse] = useState('01')
  const [locationRow, setLocationRow] = useState('02')
  const [locationBay, setLocationBay] = useState('03')
  const [locationLevel, setLocationLevel] = useState('04')
  const [locationPositionType, setLocationPositionType] =
    useState<'A' | 'S' | 'P'>('A')
  const [locationStart, setLocationStart] = useState('17')
  const [locationEnd, setLocationEnd] = useState('20')

  const warehouseLocationLabels = useMemo(() => {
    const warehouse = String(
      Math.max(1, Number(locationWarehouse) || 1),
    ).padStart(2, '0')

    const row = String(
      Math.max(1, Number(locationRow) || 1),
    ).padStart(2, '0')

    const bay = String(
      Math.max(1, Number(locationBay) || 1),
    ).padStart(2, '0')

    const level = String(
      Math.max(1, Number(locationLevel) || 1),
    ).padStart(2, '0')

    const start = Math.max(1, Number(locationStart) || 1)
    const requestedEnd = Math.max(start, Number(locationEnd) || start)

    // Safety cap: generate no more than 100 at once.
    const end = Math.min(requestedEnd, start + 99)

    return Array.from(
      { length: end - start + 1 },
      (_, index) => {
        const position = String(start + index).padStart(2, '0')

        return `W${warehouse}-R${row}-B${bay}-L${level}-${locationPositionType}${position}`
      },
    )
  }, [
    locationWarehouse,
    locationRow,
    locationBay,
    locationLevel,
    locationPositionType,
    locationStart,
    locationEnd,
  ])

  const handlePrintWarehouseLocations = async () => {
    setErrorMessage(null)
    setSuccessMessage(null)

    if (warehouseLocationLabels.length === 0) {
      setErrorMessage('No warehouse location labels to print.')
      return
    }

    try {
      const browserPrintBase =
        window.location.protocol === 'https:'
          ? 'https://localhost:9101/'
          : 'http://localhost:9100/'

      const getPrinterResponse =
        await fetch(
          `${browserPrintBase}default?type=printer`,
        )

      if (!getPrinterResponse.ok) {
        throw new Error(
          `Browser Print printer lookup failed (${getPrinterResponse.status}).`,
        )
      }

      const printer =
        await getPrinterResponse.json()

      if (!printer?.uid) {
        throw new Error(
          'Zebra Browser Print did not return a default printer.',
        )
      }

      const zpl = warehouseLocationLabels
        .map((location) => {
          const safeLocation =
            sanitizeZplText(location)

          const parts =
            safeLocation.split('-')

          const warehouse = parts[0] || 'W--'
          const row = parts[1] || 'R--'
          const bay = parts[2] || 'B--'
          const level = parts[3] || 'L--'
          const position = parts[4] || '--'

          return `^XA
^CI28
^PW1200
^LL900
^LH0,0
^PR4
^MD10

^FO22,18^GB1156,864,4^FS

^FO60,42^A0N,62,62^FB1080,1,0,C,0^FDTEXAS OEM^FS
^FO60,102^A0N,32,32^FB1080,1,5,C,0^FDP A R T S^FS

^FO42,150^GB1116,3,3^FS

^FO60,175^A0N,25,25^FB1080,1,0,C,0^FDSTORAGE LOCATION^FS

^FO60,225^A0N,58,58^FB1080,1,0,C,0^FD${safeLocation}^FS

^FO42,310^GB1116,3,3^FS

^FO120,345^BY3,2,190
^BCN,190,N,N,N
^FD${safeLocation}^FS

^FO60,555^A0N,28,28^FB1080,1,0,C,0^FD${safeLocation}^FS

^FO42,615^GB1116,3,3^FS

^FO55,650^A0N,19,19^FB210,1,0,C,0^FDWAREHOUSE^FS
^FO275,650^A0N,19,19^FB180,1,0,C,0^FDROW^FS
^FO465,650^A0N,19,19^FB180,1,0,C,0^FDBAY^FS
^FO655,650^A0N,19,19^FB180,1,0,C,0^FDLEVEL^FS
^FO845,650^A0N,19,19^FB290,1,0,C,0^FDPOSITION^FS

^FO55,690^A0N,42,42^FB210,1,0,C,0^FD${warehouse}^FS
^FO275,690^A0N,42,42^FB180,1,0,C,0^FD${row}^FS
^FO465,690^A0N,42,42^FB180,1,0,C,0^FD${bay}^FS
^FO655,690^A0N,42,42^FB180,1,0,C,0^FD${level}^FS
^FO845,690^A0N,42,42^FB290,1,0,C,0^FD${position}^FS

^FO42,765^GB1116,3,3^FS

^FO60,795^A0N,22,22^FB1080,1,0,C,0^FDTEXAS OEM OS  |  INVENTORY LOCATION^FS

^XZ`
        })
        .join('\\n')

      const writeResponse =
        await fetch(
          `${browserPrintBase}write`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              device: printer,
              data: zpl,
            }),
          },
        )

      if (!writeResponse.ok) {
        throw new Error(
          `Browser Print write failed (${writeResponse.status}).`,
        )
      }

      setSuccessMessage(
        `${warehouseLocationLabels.length} warehouse location label${
          warehouseLocationLabels.length === 1 ? '' : 's'
        } sent directly to Zebra.`,
      )
    } catch (error) {
      console.error(
        'Unable to print warehouse locations:',
        error,
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to send warehouse locations to Zebra.',
      )
    }
  }

  const [currentVehicle, setCurrentVehicle] = useState<Vehicle | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])

  const [showVehicleDetails, setShowVehicleDetails] =
    useState(false)

  const [currentVehicleDamageProfile, setCurrentVehicleDamageProfile] =
    useState<DamageProfile | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showRevenueModal, setShowRevenueModal] = useState(false)
  const [revenueSource, setRevenueSource] = useState('Catalytic Converter')
  const [revenueAmount, setRevenueAmount] = useState('')
  const [revenueVehicleId, setRevenueVehicleId] = useState('')
  const [revenueNotes, setRevenueNotes] = useState('')
  const [isSavingRevenue, setIsSavingRevenue] = useState(false)
  const [showPartModal, setShowPartModal] = useState(false)
  const [showRapidIntakeModal, setShowRapidIntakeModal] = useState(false)
  const [rapidIntakeMode, setRapidIntakeMode] = useState<'form' | 'success'>('form')
  const [showPartDetailsModal, setShowPartDetailsModal] = useState(false)
  const [formData, setFormData] = useState<VehicleFormState>(initialFormState)
  const [partFormData, setPartFormData] = useState<PartFormState>(initialPartFormState)
  const [parts, setParts] = useState<Part[]>(() => readStoredParts())

  const [ebayListings, setEbayListings] = useState<Array<{
    id: string
    ebay_item_id: string
    sku: string | null
    title: string
    price: number
    quantity_available: number
    ebay_status: string
    last_synced_at: string
    matched_part_id: string | null
  }>>([])

  const [isSyncingEbay, setIsSyncingEbay] = useState(false)
  const [ebaySyncMessage, setEbaySyncMessage] = useState<string | null>(null)
  const [matchingEbayItemId, setMatchingEbayItemId] = useState<string | null>(null)

  const [ebayMarketData, setEbayMarketData] = useState<Record<string, {
    quickSalePrice: number
    medianPrice: number
    soldCount: number
    pricingCompCount: number
    lowPrice: number
    highPrice: number
    confidence: number
    query: string
    soldComps?: Array<{
      title: string
      sold_price: number
      shipping: number
      sold_date: string
      condition: string
      item_web_url?: string
    }>
  }>>({})

  const [checkingEbayMarketId, setCheckingEbayMarketId] =
    useState<string | null>(null)

  const [updatingEbayMarketId, setUpdatingEbayMarketId] =
    useState<string | null>(null)
  const [revenueStreams, setRevenueStreams] = useState<Array<{ id: string; vehicle_id: string | null; source: string; amount: number; notes: string | null; created_at: string }>>([])
  const [selectedPart, setSelectedPart] = useState<Part | null>(null)
  const [editingPartId, setEditingPartId] = useState<string | null>(null)
  const [partModalMode, setPartModalMode] = useState<'add' | 'edit'>('add')
  const [searchTerm, setSearchTerm] = useState('')
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>('all')
  const [inventorySort, setInventorySort] = useState<InventorySort>('newest')
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingPart, setIsSavingPart] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [vinDecodeResult, setVinDecodeResult] = useState<VinDecodeResult | null>(null)
  const [isScanningVin, setIsScanningVin] = useState(false)
  const [vinInputValue, setVinInputValue] = useState('')

  const [vehiclePullList, setVehiclePullList] = useState<PullListItem[]>([])
  const [showPullListModal, setShowPullListModal] = useState(false)
  const [pullListFilter, setPullListFilter] = useState<'All' | string>('All')
  const [pullListVehicle, setPullListVehicle] = useState<Vehicle | null>(null)
  const [vehicleJobs, setVehicleJobs] = useState<JobRecord[]>([])
  const [isAdvancingStage, setIsAdvancingStage] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [partPhotos, setPartPhotos] = useState<PartPhoto[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [enhancePhotos, setEnhancePhotos] = useState(true)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const [previewPhoto, setPreviewPhoto] = useState<PartPhoto | null>(null)
  const [photoDebugMessage, setPhotoDebugMessage] = useState<string>('')
  const [partMasters, setPartMasters] = useState<PartMasterRecord[]>([])
  const [skuPreview, setSkuPreview] = useState<string>('')
  const [repairSkuTarget, setRepairSkuTarget] = useState<Part | null>(null)
  const [repairSkuValue, setRepairSkuValue] = useState('')
  const [repairReason, setRepairReason] = useState('')
  const [printLabelPart, setPrintLabelPart] = useState<Part | null>(null)
  const [tagPreviewMode, setTagPreviewMode] = useState<TagMode>('full')
  const [shouldAutoPrintTag, setShouldAutoPrintTag] = useState(false)
  const [marketComps, setMarketComps] = useState<MarketComp[]>([])
  const [marketRecommendation, setMarketRecommendation] = useState<MarketRecommendation | null>(null)
  const [isRefreshingMarketData, setIsRefreshingMarketData] = useState(false)
  const [pendingListPrice, setPendingListPrice] = useState<string>('')

  const [vehicleRecoveryInputs, setVehicleRecoveryInputs] =
    useState<RecoveryPartInput[]>([])

  const [vehicleRecoveryReport, setVehicleRecoveryReport] =
    useState<RecoveryReport | null>(null)

  const [isBuildingRecoveryReport, setIsBuildingRecoveryReport] =
    useState(false)

  const [recoveryMarketResults, setRecoveryMarketResults] =
    useState<PartFamilyMarketResult[]>([])

  const [interchangeResult, setInterchangeResult] =
    useState<InterchangeIntelligenceResult | null>(null)

  const [isCheckingInterchange, setIsCheckingInterchange] =
    useState(false)

  const [interchangeReviewKey, setInterchangeReviewKey] =
    useState<string | null>(null)
  const [listingDraft, setListingDraft] = useState<ListingDraft | null>(null)
  const [listingDraftHistory, setListingDraftHistory] = useState<ListingDraftHistory[]>([])
  const [listingDraftRecords, setListingDraftRecords] = useState<ListingDraftRecord[]>([])

  const [ebayCategoryAspects, setEbayCategoryAspects] = useState<Array<{
    name: string
    required: boolean
    mode?: string
    dataType?: string
    usage?: string
    values: string[]
  }>>([])

  const [ebayResolvedCategory, setEbayResolvedCategory] = useState<{
    categoryId: string
    categoryName: string
  } | null>(null)

  const [, setIsGeneratingListingDraft] = useState(false)
  const [showListingDraftModal, setShowListingDraftModal] = useState(false)
  const [listingPreviewHtml, setListingPreviewHtml] = useState('')
  const [showListingPreview, setShowListingPreview] = useState(false)
  const [rapidIntakeSavedPart, setRapidIntakeSavedPart] = useState<Part | null>(null)
  const [isStandalonePart, setIsStandalonePart] = useState(false)

  const [rapidIntakeQrDataUri, setRapidIntakeQrDataUri] =
    useState('')

  const [partModalQrDataUri, setPartModalQrDataUri] =
    useState('')
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const vinScanInputRef = useRef<HTMLInputElement | null>(null)

  const totalInvestment = Number(formData.purchasePrice || 0) + Number(formData.auctionFees || 0) + Number(formData.transportCost || 0)
  const productionChecklist = useMemo(() => buildProductionChecklist(vehicleJobs), [vehicleJobs])
  const nextIncompleteChecklistItem = productionChecklist.find((item) => item.status !== 'Complete') ?? null

  const listingDraftByPartId = useMemo(
    () =>
      new Map(
        listingDraftRecords.map((draft) => [
          draft.part_id,
          draft,
        ]),
      ),
    [listingDraftRecords],
  )

  const inventorySearchResults = useMemo(() => {
    const query = normalizeSearchToken(deferredSearchTerm)
    const filteredParts = parts.filter((part) => {
      if (
  scannedBin &&
  normalizeSearchToken(part.bin) !== normalizeSearchToken(scannedBin)
) {
  return false
}
      const shelfLocation = getPartShelfLocation(part)
      const haystack = [
        part.sku,
        part.partName,
        part.partNumber,
        part.vehicleYear,
        part.vehicleMake,
        part.vehicleModel,
        part.vehicleVin,
        part.vehicleStockNumber,
        shelfLocation,
        part.bin,
      ].map((value) => normalizeSearchToken(value)).join(' ')

      if (query && !haystack.includes(query)) {
        return false
      }

      switch (inventoryFilter) {
        case 'not-listed':
          return !part.listed && !part.sold && !listingDraftByPartId.has(part.id)
        case 'drafts':
          return !part.listed && !part.sold && listingDraftByPartId.has(part.id)
        case 'listed':
          return part.listed && !part.sold
        case 'sold':
          return part.sold
        case 'no-shelf':
          return !shelfLocation
        case 'no-photos':
          return !part.primaryPhotoUrl && (part.photoCount || 0) === 0
        default:
          return true
      }
    })

    return [...filteredParts].sort((left, right) => {
      switch (inventorySort) {
        case 'oldest':
          return (Date.parse(left.createdAt ?? '') || 0) - (Date.parse(right.createdAt ?? '') || 0)
        case 'part-name':
          return (left.partName || '').localeCompare(right.partName || '', undefined, { sensitivity: 'base' })
        case 'shelf-location': {
          const leftShelf = getPartShelfLocation(left)
          const rightShelf = getPartShelfLocation(right)
          if (!leftShelf && !rightShelf) return 0
          if (!leftShelf) return 1
          if (!rightShelf) return -1
          return leftShelf.localeCompare(rightShelf, undefined, { sensitivity: 'base' })
        }
        case 'sku':
          return (left.sku || '').localeCompare(right.sku || '', undefined, { sensitivity: 'base' })
        case 'newest':
        default:
          return (Date.parse(right.createdAt ?? '') || 0) - (Date.parse(left.createdAt ?? '') || 0)
      }
    })
  }, [
    deferredSearchTerm,
    inventoryFilter,
    inventorySort,
    parts,
    scannedBin,
    listingDraftByPartId,
  ])

  const ensureProductionJobs = async (vehicleId: string, jobs: JobRecord[]) => {
    if (!supabase) {
      return jobs
    }

    const jobNames = new Set(jobs.map((job) => String(job.job_name ?? '').trim().toLowerCase()))
    const inserts: Array<{ vehicle_id: string; job_name: string; job_type: string; estimated_value: number; status: string }> = []

    productionJobOrder.forEach((step) => {
      const hasAlias = step.aliases.some((alias) => jobNames.has(alias.toLowerCase()))
      if (!hasAlias) {
        inserts.push({
          vehicle_id: vehicleId,
          job_name: step.label,
          job_type: 'Production',
          estimated_value: 0,
          status: 'Pending',
        })
      }
    })

    if (inserts.length === 0) {
      return jobs
    }

    const { error: insertError } = await supabase.from('jobs').insert(inserts)
    if (insertError) {
      setErrorMessage(`Unable to align production jobs: ${insertError.message}`)
      return jobs
    }

    const { data: refreshedJobs, error: refreshError } = await supabase
      .from('jobs')
      .select('id, vehicle_id, job_name, job_type, estimated_value, status, created_at, completed_at')
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: true })

    if (refreshError) {
      setErrorMessage(`Unable to reload jobs after alignment: ${refreshError.message}`)
      return jobs
    }

    return (refreshedJobs ?? []) as JobRecord[]
  }

  const loadVehicleCommandCenter = async () => {
    if (!supabase) {
      setErrorMessage('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      setCurrentVehicle(null)
      setVehicles([])
      setVehicleJobs([])
      return
    }

    const { data: vehicleRows, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id, company_id, stock_number, vin, year, make, model, trim, purchase_price, purchase_date, status, workflow_stage, stage, progress')
      .eq('company_id', COMPANY_ID)
      .order('created_at', { ascending: false })

    if (vehicleError) {
      setErrorMessage(`Unable to load vehicles: ${vehicleError.message}`)
      setCurrentVehicle(null)
      setVehicleJobs([])
      return
    }

    const allVehicleRecords =
      (vehicleRows ?? []) as VehicleRecord[]

    setVehicles(
      allVehicleRecords.map((record) =>
        mapVehicleRecordToVehicle(
          record,
          [],
        ),
      ),
    )

    const vehicleData =
      allVehicleRecords[0] ?? null

    if (!vehicleData) {
      setVehicles([])
      setCurrentVehicle(null)
      setCurrentVehicleDamageProfile(null)
      setVehicleJobs([])
      return
    }

    const { data: damageProfileRow, error: damageProfileLoadError } =
      await supabase
        .from('vehicle_damage_profiles')
        .select('damage_zones, severity, runs_and_drives, drivetrain_tested')
        .eq('vehicle_id', vehicleData.id)
        .maybeSingle()

    if (damageProfileLoadError) {
      setErrorMessage(
        `Unable to load vehicle damage profile: ${damageProfileLoadError.message}`,
      )
    }

    setCurrentVehicleDamageProfile(
      damageProfileRow
        ? {
            zones: Array.isArray(damageProfileRow.damage_zones)
              ? damageProfileRow.damage_zones as DamageZone[]
              : [],
            severity:
              (damageProfileRow.severity as DamageSeverity) || 'unknown',
            runsAndDrives:
              typeof damageProfileRow.runs_and_drives === 'boolean'
                ? damageProfileRow.runs_and_drives
                : undefined,
            drivetrainTested:
              Boolean(damageProfileRow.drivetrain_tested),
          }
        : null,
    )

    const { data: jobData, error: jobsError } = await supabase
      .from('jobs')
      .select('id, vehicle_id, job_name, job_type, estimated_value, status, created_at, completed_at')
      .eq('vehicle_id', vehicleData.id)
      .order('created_at', { ascending: true })

    if (jobsError) {
      setErrorMessage(`Unable to load jobs: ${jobsError.message}`)
      setCurrentVehicle(null)
      setVehicleJobs([])
      return
    }

    const alignedJobs = await ensureProductionJobs(vehicleData.id, (jobData ?? []) as JobRecord[])
    setVehicleJobs(alignedJobs)
    const nextVehicle = mapVehicleRecordToVehicle(vehicleData as VehicleRecord, alignedJobs)
    const autoStage = getChecklistStage(buildProductionChecklist(alignedJobs))

    if (autoStage !== nextVehicle.stage) {
      const autoProgress = getChecklistProgress(buildProductionChecklist(alignedJobs))
      const { error: stageUpdateError } = await supabase
        .from('vehicles')
        .update({ workflow_stage: autoStage, stage: autoStage, progress: autoProgress })
        .eq('id', vehicleData.id)

      if (stageUpdateError) {
        setErrorMessage(`Unable to auto-advance stage: ${stageUpdateError.message}`)
      } else {
        nextVehicle.stage = autoStage
        nextVehicle.progress = autoProgress
      }
    }

    setCurrentVehicle(nextVehicle)
    setErrorMessage(null)
  }

  const loadPartMasters = async () => {
    if (!supabase) {
      return
    }

    const { data, error } = await supabase.from('part_master').select('*').order('part_name', { ascending: true })
    if (!error) {
      setPartMasters((data ?? []) as PartMasterRecord[])
    }
  }

  const loadPartsInventory = async () => {
    if (!supabase) {
      return
    }

    const { data, error } = await supabase
      .from('parts')
        .select(`
          *,
          part_master:part_master_id (
            id,
            part_name,
            part_code,
            category,
            created_at
          ),
          vehicle:vehicle_id (
            id,
            stock_number,
            vin,
            year,
            make,
            model
          ),
          part_photos (
            id,
            public_url,
            is_primary,
            sort_order,
            created_at
          )
        `)
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(`Unable to load parts: ${error.message}`)
      return
    }

    const remoteParts = (data ?? []).map((record) =>
      mapPartRecordToPart(record as Record<string, unknown>),
    )

    // Supabase is the production source of truth for Parts Inventory.
    setParts(remoteParts)
  }

  const loadListingDraftRecords = async () => {
    if (!supabase) {
      return
    }

    const { data, error } = await supabase
      .from('listing_drafts')
      .select(`
        part_id,
        title,
        condition_description,
        description,
        description_html,
        category_suggestion,
        item_specifics,
        compatibility_notes,
        pricing_status,
        draft_status,
        ebay_offer_id,
        ebay_category_id,
        ebay_category_name,
        ebay_draft_created_at,
        updated_at
      `)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Unable to load listing drafts:', error.message)
      return
    }

    setListingDraftRecords(
      (data ?? []) as ListingDraftRecord[],
    )
  }

  const loadEbayListings = async () => {
    if (!supabase) return

    const { data, error } = await supabase
      .from('ebay_listings')
      .select(`
        id,
        ebay_item_id,
        sku,
        title,
        price,
        quantity_available,
        ebay_status,
        last_synced_at,
        matched_part_id
      `)
      .order('title', { ascending: true })

    if (error) {
      console.error('Unable to load eBay listings:', error.message)
      return
    }

    setEbayListings(
      (data ?? []).map((row) => ({
        id: String(row.id),
        ebay_item_id: String(row.ebay_item_id ?? ''),
        sku: row.sku ? String(row.sku) : null,
        title: String(row.title ?? ''),
        price: Number(row.price ?? 0),
        quantity_available: Number(row.quantity_available ?? 0),
        ebay_status: String(row.ebay_status ?? ''),
        last_synced_at: String(row.last_synced_at ?? ''),
        matched_part_id: row.matched_part_id
          ? String(row.matched_part_id)
          : null,
      })),
    )
  }

  const handleSyncEbayListings = async () => {
    if (!supabase || isSyncingEbay) return

    setIsSyncingEbay(true)
    setEbaySyncMessage(null)

    try {
      const { data, error } = await supabase.functions.invoke(
        'ebay-active-listings',
      )

      if (error) {
        throw error
      }

      if (!data?.success) {
        throw new Error(data?.error || 'eBay sync failed')
      }

      await loadEbayListings()

      setEbaySyncMessage(
        `Synced ${data.stored ?? data.unique ?? 0} eBay listings.`,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)

      setEbaySyncMessage(`Sync failed: ${message}`)
    } finally {
      setIsSyncingEbay(false)
    }
  }


  const handleCheckListingMarket = async (
    listing: {
      ebay_item_id: string
      title: string
      price: number
    },
    part: Part | undefined,
  ) => {
    if (!part) {
      setErrorMessage(
        'This eBay listing is not connected to a Parts Inventory record.',
      )
      return
    }

    setCheckingEbayMarketId(listing.ebay_item_id)
    setErrorMessage(null)

    try {
      // -------------------------------------------------------
      // STEP 1: SCRAPE THE COMPLETE EBAY LISTING
      // -------------------------------------------------------

      const resolverUrl =
        `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/ebay-resolve-part-number`

      const resolverResponse = await fetch(resolverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey:
            import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
          Authorization:
            `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''}`,
        },
        body: JSON.stringify({
          ebayItemId: listing.ebay_item_id,
        }),
      })

      const resolverText = await resolverResponse.text()

      let resolverData: Record<string, unknown> = {}

      try {
        resolverData = resolverText
          ? JSON.parse(resolverText) as Record<string, unknown>
          : {}
      } catch {
        resolverData = {}
      }

      const candidates =
        Array.isArray(resolverData.candidates)
          ? resolverData.candidates as Array<Record<string, unknown>>
          : []

      // -------------------------------------------------------
      // STEP 2: BUILD SEARCH ATTEMPTS
      // Item Specifics -> Title OEM -> Description -> broad title
      // -------------------------------------------------------

      const searchAttempts: Array<{
        partNumber: string
        partName: string
        source: string
      }> = []

      const seen = new Set<string>()

      for (const candidate of candidates) {
        const value =
          String(candidate.value ?? '').trim()

        if (!value) continue

        // Reject year fragments and numeric garbage from eBay titles.
        // Example: 08-16 Audi becomes candidates 08 and 16.
        if (/^\d{1,2}$/.test(value)) continue

        // Reject obvious prices / monetary values.
        if (/^\d+\.\d{2}$/.test(value)) continue

        const key = value.toUpperCase()

        if (seen.has(key)) continue
        seen.add(key)

        searchAttempts.push({
          partNumber: value,
          partName: listing.title,
          source: String(candidate.source ?? 'Listing'),
        })
      }

      // Always allow the listing title as fallback,
      // but remove year ranges because they poison sold searches.
      const cleanedTitle = listing.title
        .replace(/\b\d{2}-\d{2}\b/g, '')
        .replace(/\b(19|20)\d{2}\b/g, '')
        .replace(/\s+/g, ' ')
        .trim()

      searchAttempts.push({
        partNumber: '',
        partName: cleanedTitle,
        source: 'Clean listing title fallback',
      })

      // -------------------------------------------------------
      // STEP 3: TEST SEARCHES UNTIL REAL SOLD COMPS ARE FOUND
      // -------------------------------------------------------

      const pricingUrl =
        `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/ebay-market-pricing`

      let marketData: Record<string, unknown> | null = null
      let winningSource = ''

      for (const attempt of searchAttempts.slice(0, 8)) {
        const response = await fetch(pricingUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey:
              import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
            Authorization:
              `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''}`,
          },
          body: JSON.stringify({
            partId: part.id,
            partName: attempt.partName,
            partNumber: attempt.partNumber,
            interchangeNumber: part.interchangeNumber,
            category: part.category,
            make: part.vehicleMake,
            model: part.vehicleModel,
            year: part.vehicleYear,
            engine: part.engine,
            transmission: part.transmission,
            condition: part.condition || 'Used',
          }),
        })

        const responseText = await response.text()

        let data: Record<string, unknown> = {}

        try {
          data = responseText
            ? JSON.parse(responseText) as Record<string, unknown>
            : {}
        } catch {
          data = {}
        }

        if (
          response.ok &&
          data.success === true &&
          Number(data.sold_count ?? 0) > 0
        ) {
          marketData = data
          winningSource = attempt.source
          break
        }
      }

      if (!marketData) {
        throw new Error(
          'No verified comparable sales were found after scanning the complete eBay listing.',
        )
      }

      const quickSalePrice =
        Number(marketData.quick_sale_price ?? 0)

      setEbayMarketData((prev) => ({
        ...prev,
        [listing.ebay_item_id]: {
          quickSalePrice,
          medianPrice:
            Number(marketData?.median_price ?? 0),
          soldCount:
            Number(marketData?.sold_count ?? 0),
          pricingCompCount:
            Number(marketData?.pricing_comp_count ?? 0),
          lowPrice:
            Number(marketData?.low_market_price ?? 0),
          highPrice:
            Number(marketData?.high_market_price ?? 0),
          confidence:
            Number(marketData?.confidence ?? 0),
          query:
            String(marketData?.query_used ?? winningSource),

          soldComps:
            Array.isArray(marketData?.sold_comps)
              ? marketData.sold_comps.map((comp: any) => ({
                  title: String(comp.title ?? ''),
                  sold_price: Number(comp.sold_price ?? 0),
                  shipping: Number(comp.shipping ?? 0),
                  sold_date: String(comp.sold_date ?? ''),
                  condition: String(comp.condition ?? ''),
                  item_web_url: String(comp.item_web_url ?? ''),
                }))
              : [],
        },
      }))

      setSuccessMessage(
        `Market verified using ${winningSource}: ${Number(
          marketData.sold_count ?? 0,
        )} sold comp(s), Quick Sale $${quickSalePrice.toFixed(2)}.`,
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error)

      setErrorMessage(
        `Market check failed: ${message}`,
      )
    } finally {
      setCheckingEbayMarketId(null)
    }
  }

  const handleApplyListingQuickSale = async (
    listing: {
      ebay_item_id: string
      price: number
    },
    part: Part | undefined,
  ) => {
    const market =
      ebayMarketData[listing.ebay_item_id]

    if (!market || market.quickSalePrice <= 0) {
      setErrorMessage(
        'Check Market before applying a Quick Sale price.',
      )
      return
    }

    const nextPrice = market.quickSalePrice

    const confirmed = window.confirm(
      `Change live eBay listing from $${listing.price.toFixed(2)} to $${nextPrice.toFixed(2)}?`,
    )

    if (!confirmed) return

    setUpdatingEbayMarketId(listing.ebay_item_id)
    setErrorMessage(null)

    try {
      const functionUrl =
        `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/ebay-update-price`

      const ebayResponse = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey:
            import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
          Authorization:
            `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''}`,
        },
        body: JSON.stringify({
          ebayItemId: listing.ebay_item_id,
          price: nextPrice,
        }),
      })

      const ebayText = await ebayResponse.text()

      let ebayResult: Record<string, unknown> = {}

      try {
        ebayResult = ebayText
          ? JSON.parse(ebayText) as Record<string, unknown>
          : {}
      } catch {
        ebayResult = {}
      }

      if (
        !ebayResponse.ok ||
        ebayResult.success !== true
      ) {
        throw new Error(
          typeof ebayResult.error === 'string'
            ? ebayResult.error
            : ebayText || 'eBay rejected the price update.',
        )
      }

      if (part && supabase) {
        const { error: partError } = await supabase
          .from('parts')
          .update({
            list_price: nextPrice,
          })
          .eq('id', part.id)

        if (partError) {
          throw partError
        }

        setParts((prev) =>
          prev.map((item) =>
            item.id === part.id
              ? {
                  ...item,
                  listPrice: nextPrice,
                }
              : item
          )
        )
      }

      setEbayListings((prev) =>
        prev.map((item) =>
          item.ebay_item_id === listing.ebay_item_id
            ? {
                ...item,
                price: nextPrice,
              }
            : item
        )
      )

      setSuccessMessage(
        `✓ LIVE EBAY PRICE UPDATED — $${nextPrice.toFixed(2)}`,
      )

      window.alert(
        `✓ LIVE EBAY PRICE UPDATED — $${nextPrice.toFixed(2)}`,
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error)

      setErrorMessage(
        `Price update failed: ${message}`,
      )

      window.alert(
        `PRICE UPDATE FAILED\n\n${message}`,
      )
    } finally {
      setUpdatingEbayMarketId(null)
    }
  }

  const handleMatchEbayListing = async (
    ebayItemId: string,
    partId: string,
  ) => {
    if (!supabase) return

    setMatchingEbayItemId(ebayItemId)

    try {
      const { error } = await supabase
        .from('ebay_listings')
        .update({
          matched_part_id: partId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('ebay_item_id', ebayItemId)

      if (error) {
        throw error
      }

      await loadEbayListings()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error)

      setErrorMessage(`Unable to save eBay match: ${message}`)
    } finally {
      setMatchingEbayItemId(null)
    }
  }

  const loadRevenueStreams = async () => {
    if (!supabase) return

    const { data, error } = await supabase
      .from('revenue_streams')
      .select('id, vehicle_id, source, amount, notes, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Unable to load revenue streams:', error.message)
      return
    }

    setRevenueStreams((data ?? []).map((row) => ({
      id: String(row.id),
      vehicle_id: row.vehicle_id ? String(row.vehicle_id) : null,
      source: String(row.source ?? ''),
      amount: Number(row.amount ?? 0),
      notes: row.notes ? String(row.notes) : null,
      created_at: String(row.created_at ?? ''),
    })))
  }

  useEffect(() => {
    void loadVehicleCommandCenter()
    void loadPartMasters()
    void loadPartsInventory()
    void loadListingDraftRecords()
    void loadEbayListings()
    void loadRevenueStreams()
  }, [])

  useEffect(() => {
    persistPartsToStorage(parts)
  }, [parts])

  useEffect(() => {
    if (!printLabelPart || !shouldAutoPrintTag) {
      return
    }

    const timer = window.setTimeout(() => {
      window.print()
      setShouldAutoPrintTag(false)
    }, 120)

    return () => window.clearTimeout(timer)
  }, [printLabelPart, shouldAutoPrintTag, tagPreviewMode])

  const handleFieldChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }


  const toggleDamageZone = (zone: DamageZone) => {
    setFormData((prev) => ({
      ...prev,
      damageZones: prev.damageZones.includes(zone)
        ? prev.damageZones.filter((item) => item !== zone)
        : [...prev.damageZones, zone],
    }))
  }

  const decodeVin = async (vin: string) => {
    const normalizedVin = normalizeVin(vin)
    if (!isValidVin(normalizedVin)) {
      setErrorMessage('VIN must be exactly 17 characters and use valid characters.')
      setVinDecodeResult(null)
      return null
    }

    setIsScanningVin(true)
    setErrorMessage(null)

    try {
      const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${normalizedVin}?format=json`)
      if (!response.ok) {
        throw new Error(`VIN decode API returned ${response.status}`)
      }

      const payload = await response.json() as { Results?: Array<Record<string, unknown>> }
      const result = payload.Results?.[0]
      if (!result) {
        throw new Error('No VIN decode data returned by the API.')
      }

      const decoded: VinDecodeResult = {
        vin: normalizedVin,
        modelYear: typeof result.ModelYear === 'string' ? result.ModelYear : null,
        make: typeof result.Make === 'string' ? result.Make : null,
        model: typeof result.Model === 'string' ? result.Model : null,
        trim: typeof result.Trim === 'string' ? result.Trim : null,
        bodyClass: typeof result.BodyClass === 'string' ? result.BodyClass : null,
        driveType: typeof result.DriveType === 'string' ? result.DriveType : null,
        engineDisplacement: typeof result.EngineDisplayVolume === 'string' ? result.EngineDisplayVolume : null,
        engineCylinders: typeof result.EngineCylinders === 'string' ? result.EngineCylinders : null,
        fuelType: typeof result.FuelTypePrimary === 'string' ? result.FuelTypePrimary : null,
        transmissionStyle: typeof result.TransmissionStyle === 'string' ? result.TransmissionStyle : null,
        plant: typeof result.PlantCity === 'string' ? result.PlantCity : null,
        gvwr: typeof result.GVWR === 'string' ? result.GVWR : null,
        rawDecode: result,
      }

      const cache = readStoredVinDecodes()
      cache[normalizedVin] = decoded
      persistVinDecodes(cache)
      setVinDecodeResult(decoded)
      setFormData((prev) => ({ ...prev, vin: normalizedVin }))
      return decoded
    } catch (error) {
      const message = error instanceof Error ? error.message : 'VIN decoding failed.'
      setErrorMessage(`VIN decode failed: ${message}`)
      setVinDecodeResult(null)
      return null
    } finally {
      setIsScanningVin(false)
    }
  }

  const handleScanVin = async () => {
    const normalizedVin = normalizeVin(vinInputValue || formData.vin)
    if (!normalizedVin) {
      setErrorMessage('Enter a VIN before scanning.')
      return
    }

    const decoded = await decodeVin(normalizedVin)
    if (decoded) {
      setSuccessMessage('VIN decoded successfully. Review the values below before saving.')
    }
  }

  const handleApplyDecodedVin = () => {
    if (!vinDecodeResult) {
      return
    }

    const summary = buildVehicleDecodeSummary(vinDecodeResult)
    setFormData((prev) => ({
      ...prev,
      vin: summary.vin || prev.vin,
      year: summary.modelYear || prev.year,
      make: summary.make || prev.make,
      model: summary.model || prev.model,
      trim: summary.trim || prev.trim,
      notes: prev.notes ? `${prev.notes}\nDecoded VIN: ${summary.make} ${summary.model} ${summary.trim}`.trim() : `Decoded VIN: ${summary.make} ${summary.model} ${summary.trim}`.trim(),
    }))
    setSuccessMessage('Decoded values applied to the form. You can still edit them before saving.')
  }

  const openPullListModal = (vehicle: Vehicle | null) => {
    const pullItems = buildVehiclePullList(vehicle, vinDecodeResult, partMasters)
    setVehiclePullList(pullItems)
    setPullListVehicle(vehicle)
    setShowPullListModal(true)
  }

  const updatePullListItem = (partId: string, status: PullListItem['status']) => {
    setVehiclePullList((prev) => prev.map((item) => item.id === partId ? { ...item, status } : item))
  }

  const togglePullListSelection = (partId: string) => {
    setVehiclePullList((prev) => prev.map((item) => item.id === partId ? { ...item, selected: !item.selected } : item))
  }

  const selectAllPullListItems = () => {
    const allSelected = vehiclePullList.every((item) => item.selected)
    setVehiclePullList((prev) => prev.map((item) => ({ ...item, selected: !allSelected })))
  }

  const handleCreatePulledPart = async (item: PullListItem) => {
    if (!currentVehicle || !supabase) {
      setErrorMessage('Create the vehicle first so the pulled part can be linked to it.')
      return
    }

    const nextSequence = String((parts.filter((part) => part.vehicleId === currentVehicle.id && part.partName === item.partName).length + 1).toString().padStart(3, '0'))
    const generatedSku = buildSkuPreview(currentVehicle.stockNumber || currentVehicle.vin || 'TX', item.partCode || 'PRT', nextSequence)

    const payload = {
      vehicle_id: currentVehicle.id,
      vin: currentVehicle.vin,
      year: currentVehicle.year,
      make: currentVehicle.make,
      model: currentVehicle.model,
      sku: generatedSku,
      part_name: item.partName,
      part_number: null,
      category: item.category || null,
      location: [item.side, item.position].filter(Boolean).join(' ').trim() || null,
      shelf: 'Pull List',
      quantity: item.quantity || 1,
      cost: 0,
      list_price: 0,
      sold_price: 0,
      weight: 0,
      notes: item.notes || null,
      listed: false,
      sold: false,
      photo_count: 0,
    }

    const { data, error } = await supabase.from('parts').insert(payload).select().single()

    if (error) {
      setErrorMessage(`Unable to create pulled part ${item.partName}: ${error.message}`)
      return
    }

    if (!data) {
      setErrorMessage('Unable to save part: Supabase did not return the saved row.')
      setIsSavingPart(false)
      return
    }

    const mappedPart = {
      ...mapPartRecordToPart(data as Record<string, unknown>),
      vehicleId: currentVehicle.id,
      vehicleYear: currentVehicle.year,
      vehicleMake: currentVehicle.make,
      vehicleModel: currentVehicle.model,
      vehicleVin: currentVehicle.vin,
      sku: generatedSku,
      partName: item.partName,
      partNumber: '',
      interchangeNumber: '',
      brand: '',
      category: item.category,
      condition: 'Needs Cleaning',
      engine: '',
      transmission: '',
      color: '',
      location: [item.side, item.position].filter(Boolean).join(' ').trim(),
      shelf: 'Pull List',
      bin: '',
      quantity: item.quantity || 1,
      cost: 0,
      listPrice: 0,
      soldPrice: 0,
      weight: 0,
      ebayItemId: '',
      ebayStatus: 'Needs Cleaning',
      dateListed: '',
      dateSold: '',
      listed: false,
      sold: false,
      status: 'Needs Cleaning',
      notes: item.notes,
      photoCount: 0,
      side: item.side || null,
      position: item.position || null,
    }

    setParts((prev) => {
      const nextParts = [mappedPart, ...prev.filter((part) => part.id !== mappedPart.id)]
      persistPartsToStorage(nextParts)
      return nextParts
    })
    updatePullListItem(item.id, 'pulled')
    setSuccessMessage(`Created ${generatedSku} for ${item.partName}.`)
  }

  const handleOpenForm = () => {
    setErrorMessage(null)
    setSuccessMessage(null)
    setFormData(initialFormState)
    setShowForm(true)
  }

  const handleOpenRevenueModal = () => {
    setErrorMessage(null)
    setSuccessMessage(null)
    setShowRevenueModal(true)
  }

  const handleCloseRevenueModal = () => {
    setShowRevenueModal(false)
  }


  const handleSaveRevenue = async () => {
    if (!supabase) return

    const amount = Number(revenueAmount)

    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage('Enter a revenue amount greater than zero.')
      return
    }

    setIsSavingRevenue(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    const { error } = await supabase
      .from('revenue_streams')
      .insert({
        vehicle_id: revenueVehicleId || null,
        source: revenueSource,
        amount,
        notes: revenueNotes.trim() || null,
      })

    if (error) {
      setErrorMessage(`Unable to save revenue: ${error.message}`)
      setIsSavingRevenue(false)
      return
    }

    setRevenueSource('Catalytic Converter')
    setRevenueAmount('')
    setRevenueVehicleId('')
    setRevenueNotes('')
    setShowRevenueModal(false)
    setSuccessMessage('Revenue saved successfully.')
    setIsSavingRevenue(false)
    await loadRevenueStreams()
  }

  const handleOpenRapidIntake = () => {
    if (!currentVehicle) {
      setErrorMessage('Add or load a vehicle before adding donor parts.')
      return
    }

    const suggestedShelfLocation =
      parts.length > 0
        ? generateShelfLocation(parts)
        : 'A-01'

    const rapidDefaults: PartFormState = {
      ...initialPartFormState,
      condition: 'Tested Good',
      shelf: suggestedShelfLocation,
      location: suggestedShelfLocation,
      bin: suggestedShelfLocation,
      quantity: '1',
      cost: '0',
      listPrice: '0',
      soldPrice: '0',
      photoCount: '0',
    }

    // ONE PART = ONE SCREEN.
    // Rapid Intake now opens the production workbench directly.
    setPartFormData(rapidDefaults)
    setIsStandalonePart(false)
    setSelectedPart(null)
    setEditingPartId(null)
    setPartModalMode('add')

    setSkuPreview('')
    setPartPhotos([])
    setListingDraft(null)
    setEbayCategoryAspects([])
    setEbayResolvedCategory(null)

    setRapidIntakeSavedPart(null)
    setRapidIntakeMode('form')
    setShowRapidIntakeModal(false)
    setShowListingDraftModal(false)

    setUploadProgress('')
    setPhotoDebugMessage('')
    setErrorMessage(null)
    setSuccessMessage(null)

    setShowPartModal(true)
  }

  useEffect(() => {
    let cancelled = false

    if (!rapidIntakeSavedPart?.id) {
      setRapidIntakeQrDataUri('')
      return
    }

    void QRCode.toDataURL(
      `/parts/${rapidIntakeSavedPart.id}`,
      {
        width: 360,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      },
    )
      .then((uri) => {
        if (!cancelled) {
          setRapidIntakeQrDataUri(uri)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRapidIntakeQrDataUri('')
        }
      })

    return () => {
      cancelled = true
    }
  }, [rapidIntakeSavedPart?.id])

  useEffect(() => {
    let cancelled = false

    if (
      !showPartModal ||
      !editingPartId
    ) {
      setPartModalQrDataUri('')
      return
    }

    void QRCode.toDataURL(
      `/parts/${editingPartId}`,
      {
        width: 360,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      },
    )
      .then((uri) => {
        if (!cancelled) {
          setPartModalQrDataUri(uri)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPartModalQrDataUri('')
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    showPartModal,
    editingPartId,
  ])

  const handleCloseRapidIntake = () => {
    setShowRapidIntakeModal(false)
    setRapidIntakeSavedPart(null)
    setRapidIntakeMode('form')
    setPartPhotos([])
    setEditingPartId(null)
    setPartModalMode('add')
    setUploadProgress('')
    setPhotoDebugMessage('')
  }

  const handleRapidPartFieldChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    const nextFormData = { ...partFormData, [name]: value }

    if (name === 'shelf') {
      nextFormData.location = value
    }

    setPartFormData(nextFormData)
    if (name === 'partName' || name === 'skuCode') {
      void refreshSkuPreview(nextFormData)
    }
  }

  const resetRapidPartFields = () => {
    const nextShelfLocation = partFormData.shelf.trim() || (parts.length > 0 ? generateShelfLocation(parts) : 'A-01')
    const nextFormData: PartFormState = {
      ...partFormData,
      partName: '',
      partNumber: '',
      interchangeNumber: '',
      condition: 'Tested Good',
      shelf: nextShelfLocation,
      location: nextShelfLocation,
      notes: '',
      skuCode: '',
      skuPreview: '',
      photoCount: '0',
      brand: '',
      category: '',
      engine: '',
      transmission: '',
      color: '',
      bin: '',
      ebayItemId: '',
      ebayStatus: 'Not Listed',
      dateListed: '',
      dateSold: '',
      quantity: '1',
      cost: '0',
      listPrice: '0',
      soldPrice: '0',
      weight: '',
    }

    setPartFormData(nextFormData)
    setRapidIntakeSavedPart(null)
    setRapidIntakeMode('form')
    setPartPhotos([])
    setEditingPartId(null)
    setPartModalMode('add')
    setUploadProgress('')
    setPhotoDebugMessage('')
    setSkuPreview('')
  }

  const handleCompleteNextJob = async () => {
    if (!currentVehicle || !supabase) {
      return
    }

    setIsAdvancingStage(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    const nextItem = productionChecklist.find((item) => item.status !== 'Complete')
    if (!nextItem) {
      setIsAdvancingStage(false)
      return
    }

    await updateChecklistItemStatus(nextItem, 'Completed')
    setIsAdvancingStage(false)
  }

  const handleContinueVehicle = () => {
    if (!currentVehicle) {
      return
    }

    setActiveView('vehicles')
    setShowVehicleDetails(true)
  }



  const handleDeleteVehicle = async (
    vehicle: Vehicle,
    event?: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event?.stopPropagation()

    if (!supabase) {
      setErrorMessage('Database connection is unavailable.')
      return
    }

    const linkedParts = parts.filter(
      (part) => part.vehicleId === vehicle.id,
    )

    if (linkedParts.length > 0) {
      setErrorMessage(
        `Cannot delete ${getVehicleTitle(vehicle)} because ${linkedParts.length} part${linkedParts.length === 1 ? '' : 's'} are linked to this donor.`,
      )
      return
    }

    const vehicleName = getVehicleTitle(vehicle)

    const confirmed = window.confirm(
      `DELETE VEHICLE?\n\n${vehicleName}\nVIN: ${vehicle.vin || '—'}\nStock #: ${vehicle.stockNumber || '—'}\n\nThis permanently deletes this donor record and its production jobs.\n\nContinue?`,
    )

    if (!confirmed) {
      return
    }

    setErrorMessage(null)
    setSuccessMessage(`Deleting ${vehicleName}…`)

    // Remove known child records first.
    const cleanupTables = [
      'jobs',
      'vehicle_damage_profiles',
      'vehicle_part_candidates',
    ]

    for (const table of cleanupTables) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('vehicle_id', vehicle.id)

      if (error) {
        console.warn(
          `Unable to clean ${table} for vehicle ${vehicle.id}:`,
          error,
        )
      }
    }

    const { error: vehicleDeleteError } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', vehicle.id)
      .eq('company_id', COMPANY_ID)

    if (vehicleDeleteError) {
      setErrorMessage(
        `Unable to delete ${vehicleName}: ${vehicleDeleteError.message}`,
      )
      return
    }

    const remainingVehicles = vehicles.filter(
      (item) => item.id !== vehicle.id,
    )

    setVehicles(remainingVehicles)

    if (currentVehicle?.id === vehicle.id) {
      setCurrentVehicle(null)
      setVehicleJobs([])
      setCurrentVehicleDamageProfile(null)
      setShowVehicleDetails(false)

      const nextVehicle = remainingVehicles[0]

      if (nextVehicle) {
        await handleSelectVehicle(nextVehicle)
      }
    }

    setSuccessMessage(`${vehicleName} deleted.`)
  }

  const handleSelectVehicle = async (vehicle: Vehicle) => {
    if (!supabase) {
      setErrorMessage('Database connection is unavailable.')
      return
    }

    if (vehicle.id === currentVehicle?.id) {
      setShowVehicleDetails(true)
      return
    }

    setErrorMessage(null)
    setSuccessMessage(`Loading ${getVehicleTitle(vehicle)}…`)
    setVehicleRecoveryReport(null)
    setRecoveryMarketResults([])
    setVehicleRecoveryInputs([])

    const { data: jobData, error: jobsError } = await supabase
      .from('jobs')
      .select(
        'id, vehicle_id, job_name, job_type, estimated_value, status, created_at, completed_at',
      )
      .eq('vehicle_id', vehicle.id)
      .order('created_at', { ascending: true })

    if (jobsError) {
      setErrorMessage(`Unable to load vehicle jobs: ${jobsError.message}`)
      return
    }

    const alignedJobs = await ensureProductionJobs(
      vehicle.id,
      (jobData ?? []) as JobRecord[],
    )

    const { data: damageProfileRow, error: damageProfileError } =
      await supabase
        .from('vehicle_damage_profiles')
        .select(
          'damage_zones, severity, runs_and_drives, drivetrain_tested',
        )
        .eq('vehicle_id', vehicle.id)
        .maybeSingle()

    if (damageProfileError) {
      setErrorMessage(
        `Vehicle loaded, but damage profile could not load: ${damageProfileError.message}`,
      )
    }

    const nextVehicle = {
      ...vehicle,
      stage: getChecklistStage(buildProductionChecklist(alignedJobs)),
      progress: getChecklistProgress(buildProductionChecklist(alignedJobs)),
      jobsCompleted: alignedJobs.filter(
        (job) => job.status === 'Completed',
      ).length,
      totalJobs: alignedJobs.length,
    }

    setVehicleJobs(alignedJobs)
    setCurrentVehicle(nextVehicle)

    setCurrentVehicleDamageProfile(
      damageProfileRow
        ? {
            zones: Array.isArray(damageProfileRow.damage_zones)
              ? (damageProfileRow.damage_zones as DamageZone[])
              : [],
            severity:
              (damageProfileRow.severity as DamageSeverity) || 'unknown',
            runsAndDrives:
              typeof damageProfileRow.runs_and_drives === 'boolean'
                ? damageProfileRow.runs_and_drives
                : undefined,
            drivetrainTested: Boolean(
              damageProfileRow.drivetrain_tested,
            ),
          }
        : null,
    )

    setSuccessMessage(
      `${getVehicleTitle(nextVehicle)} is now the active vehicle.`,
    )

    setShowVehicleDetails(true)
  }


  const handleBuildVehicleRecoveryReport = async () => {
    if (!supabase || !currentVehicle) {
      setErrorMessage('Load an active vehicle before running recovery intelligence.')
      return
    }

    setIsBuildingRecoveryReport(true)
    setErrorMessage(null)
    setSuccessMessage('Analyzing vehicle recovery market…')

    try {
      const { data: candidateRows, error: candidateError } =
        await supabase
          .from('vehicle_part_candidates')
          .select(`
            part_family_code,
            part_name,
            oem_part_number,
            interchange_number,
            confidence,
            status
          `)
          .eq('vehicle_id', currentVehicle.id)

      if (candidateError) {
        throw new Error(
          `Unable to load vehicle part identities: ${candidateError.message}`,
        )
      }

      let resolvedCandidateRows = candidateRows ?? []

      const bootstrapPullList =
        buildVehiclePullList(
          currentVehicle,
          vinDecodeResult,
          partMasters,
        )

      const existingFamilyCodes =
        new Set(
          resolvedCandidateRows
            .map((row) =>
              String(
                row.part_family_code ?? '',
              )
                .trim()
                .toUpperCase(),
            )
            .filter(Boolean),
        )

      const priorityResearchItems =
        rankPullListForRecovery(
          bootstrapPullList,
        )
          .slice(0, 10)
          .filter((item) => {
            const code =
              String(
                item.partCode ||
                item.id ||
                '',
              )
                .trim()
                .toUpperCase()

            return (
              code &&
              !existingFamilyCodes.has(
                code,
              )
            )
          })

      if (priorityResearchItems.length > 0) {

        const batchSize = 5

        for (
          let index = 0;
          index < priorityResearchItems.length;
          index += batchSize
        ) {
          const batch =
            priorityResearchItems.slice(
              index,
              index + batchSize,
            )

          setSuccessMessage(
            `Researching priority parts ${index + 1}-${Math.min(
              index + batch.length,
              priorityResearchItems.length,
            )} of ${priorityResearchItems.length}…`,
          )

          await Promise.allSettled(
            batch.map(async (item) => {
              const resolverPromise =
                supabase.functions.invoke(
                  'vehicle-part-resolver',
                  {
                    body: {
                      vehicleId:
                        currentVehicle.id,

                      vin:
                        currentVehicle.vin,

                      year:
                        Number(
                          currentVehicle.year,
                        ) || null,

                      make:
                        currentVehicle.make,

                      model:
                        currentVehicle.model,

                      trim:
                        currentVehicle.trim,

                      partFamilyCode:
                        item.partCode ||
                        item.id,

                      partName:
                        item.partName,
                    },
                  },
                )

              const timeoutPromise =
                new Promise<{
                  data: null
                  error: Error
                }>((resolve) => {
                  window.setTimeout(() => {
                    resolve({
                      data: null,
                      error: new Error(
                        'Resolver timed out after 20 seconds',
                      ),
                    })
                  }, 20000)
                })

              const {
                error: resolverError,
              } =
                await Promise.race([
                  resolverPromise,
                  timeoutPromise,
                ])

              if (resolverError) {
                console.warn(
                  `Part identity bootstrap skipped for ${item.partName}:`,
                  resolverError.message,
                )
              }
            }),
          )
        }

        const {
          data: refreshedCandidates,
          error: refreshedCandidateError,
        } =
          await supabase
            .from(
              'vehicle_part_candidates',
            )
            .select(`
              part_family_code,
              part_name,
              oem_part_number,
              interchange_number,
              confidence,
              status
            `)
            .eq(
              'vehicle_id',
              currentVehicle.id,
            )

        if (
          refreshedCandidateError
        ) {
          throw new Error(
            `Unable to reload researched part identities: ${refreshedCandidateError.message}`,
          )
        }

        resolvedCandidateRows =
          refreshedCandidates ?? []
      }

      if (
        resolvedCandidateRows.length ===
        0
      ) {
        throw new Error(
          'Automatic part-identity research returned no usable candidates for this vehicle.',
        )
      }

      const families = new Map<
        string,
        {
          partName: string
          oemPartNumbers: Set<string>
          interchangeNumbers: Set<string>
        }
      >()

      for (const row of resolvedCandidateRows) {
        const partName = String(row.part_name ?? '').trim()
        const familyCode = String(row.part_family_code ?? '').trim()
        const key = familyCode || partName

        if (!key || !partName) {
          continue
        }

        const family =
          families.get(key) ?? {
            partName,
            oemPartNumbers: new Set<string>(),
            interchangeNumbers: new Set<string>(),
          }

        const oemNumber =
          String(row.oem_part_number ?? '').trim()

        const interchangeNumber =
          String(row.interchange_number ?? '').trim()

        if (oemNumber) {
          family.oemPartNumbers.add(oemNumber)
        }

        if (interchangeNumber) {
          family.interchangeNumbers.add(interchangeNumber)
        }

        families.set(key, family)
      }

      const marketResults: PartFamilyMarketResult[] = []

      for (const family of families.values()) {
        const oemPartNumbers =
          Array.from(family.oemPartNumbers)

        if (oemPartNumbers.length === 0) {
          continue
        }

        const interchangeNumber =
          Array.from(family.interchangeNumbers)[0] ?? null

        const { data, error } =
          await supabase.functions.invoke(
            'part-family-market',
            {
              body: {
                model: currentVehicle.model,
                partName: family.partName,
                oemPartNumbers,
                interchangeNumber,
              },
            },
          )

        if (error || !data?.success) {
          console.warn(
            `Recovery market research skipped for ${family.partName}:`,
            error?.message ?? data?.error ?? 'Unknown market error',
          )
          continue
        }

        marketResults.push(
          data as PartFamilyMarketResult,
        )
      }

      const recoveryInputs =
        marketResults.map((marketResult) =>
          recoveryInputFromFamilyMarket(
            marketResult,
          ),
        )

      if (recoveryInputs.length === 0) {
        throw new Error(
          'No usable market-backed recovery data was found for this vehicle.',
        )
      }

      const damageProfile: DamageProfile =
        currentVehicleDamageProfile ?? {
          zones: [],
          severity: 'unknown',
        }

      const report =
        buildRecoveryReport(
          currentVehicle.totalInvestment,
          recoveryInputs,
          damageProfile,
        )

      setRecoveryMarketResults(marketResults)
      setVehicleRecoveryInputs(recoveryInputs)
      setVehicleRecoveryReport(report)

      setSuccessMessage(
        `Recovery analysis complete: ${recoveryInputs.length} researched part families.`,
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error)

      setVehicleRecoveryInputs([])
      setRecoveryMarketResults([])
      setVehicleRecoveryReport(null)
      setErrorMessage(
        `Recovery intelligence failed: ${message}`,
      )
    } finally {
      setIsBuildingRecoveryReport(false)
    }
  }

  const updateChecklistItemStatus = async (
    item: ProductionChecklistItem,
    nextStatus: 'Pending' | 'In Progress' | 'Completed',
  ) => {
    if (!supabase || !currentVehicle) {
      return
    }

    const payload =
      nextStatus === 'Completed'
        ? {
            status: 'Completed',
            completed_at: new Date().toISOString(),
          }
        : {
            status: nextStatus,
            completed_at: null,
          }

    const jobsToUpdate = [...item.jobs]

    if (jobsToUpdate.length === 0) {
      const { data: createdJob, error: createError } = await supabase
        .from('jobs')
        .insert({
          vehicle_id: currentVehicle.id,
          job_name: item.label,
          job_type: 'Production',
          estimated_value: 0,
          status: nextStatus,
          completed_at:
            nextStatus === 'Completed'
              ? new Date().toISOString()
              : null,
        })
        .select(
          'id, vehicle_id, job_name, job_type, estimated_value, status, created_at, completed_at',
        )
        .single()

      if (createError || !createdJob) {
        setErrorMessage(
          `Unable to create workflow job: ${createError?.message ?? 'Unknown error'}`,
        )
        return
      }

      jobsToUpdate.push(createdJob as JobRecord)
    }

    setActiveJobId(item.key)
    setErrorMessage(null)
    setSuccessMessage(null)

    const jobIds = jobsToUpdate.map((job) => job.id)

    const { error } = await supabase
      .from('jobs')
      .update(payload)
      .in('id', jobIds)

    if (error) {
      setErrorMessage(`Unable to update job status: ${error.message}`)
      setActiveJobId(null)
      return
    }

    const updatedJobs = vehicleJobs.map((job) =>
      jobIds.includes(job.id)
        ? {
            ...job,
            status: nextStatus,
            completed_at:
              nextStatus === 'Completed'
                ? String(payload.completed_at)
                : null,
          }
        : job,
    )

    const updatedChecklist =
      buildProductionChecklist(updatedJobs)

    const updatedStage =
      getChecklistStage(updatedChecklist)

    const updatedProgress =
      getChecklistProgress(updatedChecklist)

    const completedCount =
      updatedJobs.filter(
        (job) => job.status === 'Completed',
      ).length

    const { error: vehicleUpdateError } = await supabase
      .from('vehicles')
      .update({
        workflow_stage: updatedStage,
        stage: updatedStage,
        progress: updatedProgress,
      })
      .eq('id', currentVehicle.id)

    if (vehicleUpdateError) {
      setErrorMessage(
        `Workflow updated, but vehicle progress could not save: ${vehicleUpdateError.message}`,
      )
    }

    setVehicleJobs(updatedJobs)

    setCurrentVehicle((prev) =>
      prev
        ? {
            ...prev,
            stage: updatedStage,
            progress: updatedProgress,
            jobsCompleted: completedCount,
            totalJobs: updatedJobs.length,
          }
        : prev,
    )

    setVehicles((prev) =>
      prev.map((vehicle) =>
        vehicle.id === currentVehicle.id
          ? {
              ...vehicle,
              stage: updatedStage,
              progress: updatedProgress,
              jobsCompleted: completedCount,
              totalJobs: updatedJobs.length,
            }
          : vehicle,
      ),
    )

    const message =
      nextStatus === 'Completed'
        ? `${item.label} marked complete.`
        : nextStatus === 'In Progress'
          ? `${item.label} started.`
          : `${item.label} reset to pending.`

    setSuccessMessage(message)
    setActiveJobId(null)
  }

  const refreshSkuPreview = async (nextFormData: PartFormState = partFormData) => {
    const partCode =
      (nextFormData.skuCode || '').trim().toUpperCase() ||
      getPartCodeFromPartMaster(
        nextFormData.partName,
        nextFormData.category,
        partMasters,
      ) ||
      getFallbackPartCode(
        nextFormData.partName,
        nextFormData.category,
      )

    const previewSourceVehicle =
      isStandalonePart
        ? null
        : currentVehicle

    const stockNumber =
      previewSourceVehicle?.stockNumber ||
      previewSourceVehicle?.vin ||
      'STANDALONE'

    let nextPreview =
      buildSkuPreview(
        stockNumber,
        partCode,
        '001',
      )

    if (supabase) {
      try {
        nextPreview =
          await getNextRapidIntakeSku(
            stockNumber,
            partCode,
          )
      } catch (error) {
        console.error(
          'Unable to calculate next SKU preview:',
          error,
        )
      }
    }

    setSkuPreview(nextPreview)

    setPartFormData((prevState) => ({
      ...prevState,
      skuCode:
        nextFormData.skuCode ||
        prevState.skuCode,
      skuPreview: nextPreview,
    }))

    return nextPreview
  }

  const handlePartFieldChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    const nextFormData = { ...partFormData, [name]: value }
    setPartFormData(nextFormData)

    if (name === 'partName' || name === 'category' || name === 'skuCode') {
      void refreshSkuPreview(nextFormData)
    }
  }

  const loadPartPhotos = async (partId: string | null) => {
    if (!partId || !supabase) {
      setPartPhotos([])
      return
    }

    const { data, error } = await supabase.from('part_photos').select('*').eq('part_id', partId).order('is_primary', { ascending: false }).order('sort_order', { ascending: true }).order('created_at', { ascending: true })

    if (error) {
      setErrorMessage(`Unable to load photos: ${error.message}`)
      setPhotoDebugMessage(`Load error: ${error.message}`)
      return
    }

    const photos = (data ?? []).map((record) => ({
      id: String(record.id),
      partId: String(record.part_id),
      storagePath: String(record.storage_path),
      publicUrl: typeof record.public_url === 'string' ? record.public_url : null,
      isPrimary: Boolean(record.is_primary),
      sortOrder: Number(record.sort_order ?? 0),
      createdAt: typeof record.created_at === 'string' ? record.created_at : null,
    })) as PartPhoto[]

    setPartPhotos(photos)
    setPhotoDebugMessage(photos.length ? `Loaded ${photos.length} photo${photos.length === 1 ? '' : 's'}.` : 'No photos found for this part.')
  }

  const handleCopySku = async (sku: string) => {
    if (!sku) {
      return
    }

    try {
      await navigator.clipboard.writeText(sku)
      setSuccessMessage('SKU copied to clipboard.')
    } catch {
      setErrorMessage('Unable to copy the SKU automatically.')
    }
  }

  const handleRepairSku = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!repairSkuTarget || !supabase) {
      return
    }

    const nextSku = repairSkuValue.trim().toUpperCase()
    if (!nextSku) {
      setErrorMessage('Enter a replacement SKU.')
      return
    }

    if (!window.confirm(`Replace ${repairSkuTarget.sku} with ${nextSku}?`)) {
      return
    }

    const { data, error } = await supabase.rpc('repair_sku', { p_part_id: repairSkuTarget.id, p_new_sku: nextSku, p_reason: repairReason || 'Manual SKU repair' })

    if (error) {
      setErrorMessage(`Unable to repair SKU: ${error.message}`)
      return
    }

    setRepairSkuTarget(null)
    setRepairSkuValue('')
    setRepairReason('')
    setSuccessMessage(`SKU repaired to ${data}.`)
    await loadPartsInventory()
  }


  const buildWarehouseArrowZpl = (
    direction: 'up' | 'down',
  ) => {
    /*
     * TRUE RASTER ARROW
     *
     * 3x4 adhesive label in landscape:
     * 1200 x 900 dots @ 300 DPI
     *
     * Generate one solid monochrome arrow bitmap
     * instead of stacking ZPL rectangles.
     */

    const graphicWidth = 620
    const graphicHeight = 700
    const bytesPerRow =
      Math.ceil(graphicWidth / 8)

    const centerX =
      Math.floor(graphicWidth / 2)

    const bytes =
      new Uint8Array(
        bytesPerRow *
        graphicHeight,
      )

    const setPixel = (
      x: number,
      y: number,
    ) => {
      if (
        x < 0 ||
        x >= graphicWidth ||
        y < 0 ||
        y >= graphicHeight
      ) {
        return
      }

      const byteIndex =
        y * bytesPerRow +
        Math.floor(x / 8)

      const bit =
        7 - (x % 8)

      bytes[byteIndex] |=
        1 << bit
    }

    const fillSpan = (
      y: number,
      startX: number,
      endX: number,
    ) => {
      const left =
        Math.max(
          0,
          Math.floor(startX),
        )

      const right =
        Math.min(
          graphicWidth - 1,
          Math.ceil(endX),
        )

      for (
        let x = left;
        x <= right;
        x += 1
      ) {
        setPixel(x, y)
      }
    }

    const drawUpArrow = () => {
      /*
       * Large triangular head.
       */
      const headTop = 20
      const headBottom = 330
      const maxHalfWidth = 300

      for (
        let y = headTop;
        y <= headBottom;
        y += 1
      ) {
        const progress =
          (y - headTop) /
          (headBottom - headTop)

        const halfWidth =
          Math.max(
            2,
            progress *
            maxHalfWidth,
          )

        fillSpan(
          y,
          centerX - halfWidth,
          centerX + halfWidth,
        )
      }

      /*
       * Thick solid shaft.
       * Slight overlap into arrowhead
       * guarantees one continuous shape.
       */
      const shaftHalfWidth = 105

      for (
        let y = 285;
        y <= 675;
        y += 1
      ) {
        fillSpan(
          y,
          centerX - shaftHalfWidth,
          centerX + shaftHalfWidth,
        )
      }
    }

    const drawDownArrow = () => {
      /*
       * Thick solid shaft first.
       */
      const shaftHalfWidth = 105

      for (
        let y = 25;
        y <= 415;
        y += 1
      ) {
        fillSpan(
          y,
          centerX - shaftHalfWidth,
          centerX + shaftHalfWidth,
        )
      }

      /*
       * Large downward triangular head.
       */
      const headTop = 370
      const headBottom = 680
      const maxHalfWidth = 300

      for (
        let y = headTop;
        y <= headBottom;
        y += 1
      ) {
        const progress =
          (headBottom - y) /
          (headBottom - headTop)

        const halfWidth =
          Math.max(
            2,
            progress *
            maxHalfWidth,
          )

        fillSpan(
          y,
          centerX - halfWidth,
          centerX + halfWidth,
        )
      }
    }

    if (direction === 'up') {
      drawUpArrow()
    } else {
      drawDownArrow()
    }

    const hex =
      Array.from(bytes)
        .map((value) =>
          value
            .toString(16)
            .padStart(2, '0')
            .toUpperCase(),
        )
        .join('')

    const totalBytes =
      bytes.length

    return `
^XA
^PW1200
^LL900
^LH0,0

^FO290,100
^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hex}^FS

^XZ
`
  }

  const handlePrintWarehouseArrow = async (
    direction: 'up' | 'down',
  ) => {
    setErrorMessage(null)
    setSuccessMessage(null)

    type BrowserPrintDevice = {
      name?: string
      uid?: string
      connection?: string
    }

    const browserPrintBase =
      window.location.protocol === 'https:'
        ? 'https://localhost:9101/'
        : 'http://localhost:9100/'

    const requestBrowserPrint = (
      method: 'GET' | 'POST',
      endpoint: string,
      body?: unknown,
    ) =>
      new Promise<string>((resolve, reject) => {
        const request = new XMLHttpRequest()

        request.open(
          method,
          `${browserPrintBase}${endpoint}`,
          true,
        )

        request.onreadystatechange = () => {
          if (
            request.readyState !==
            XMLHttpRequest.DONE
          ) {
            return
          }

          if (request.status === 200) {
            resolve(request.responseText)
            return
          }

          reject(
            new Error(
              request.responseText ||
                `Browser Print returned HTTP ${request.status}.`,
            ),
          )
        }

        request.onerror = () => {
          reject(
            new Error(
              'Unable to reach Zebra Browser Print.',
            ),
          )
        }

        if (body === undefined) {
          request.send()
        } else {
          request.send(JSON.stringify(body))
        }
      })

    try {
      let printer: BrowserPrintDevice | null =
        null

      const defaultResponse =
        await requestBrowserPrint(
          'GET',
          'default?type=printer',
        )

      if (defaultResponse.trim()) {
        printer =
          JSON.parse(
            defaultResponse,
          ) as BrowserPrintDevice
      }

      if (!printer?.connection) {
        const availableResponse =
          await requestBrowserPrint(
            'GET',
            'available',
          )

        const available =
          JSON.parse(
            availableResponse,
          ) as {
            printer?: BrowserPrintDevice[]
          }

        const printers =
          available.printer ?? []

        printer =
          printers.find((candidate) =>
            [
              candidate.uid,
              candidate.name,
            ]
              .filter(Boolean)
              .some((value) =>
                String(value).includes(
                  '192.168.1.185',
                ),
              ),
          ) ??
          printers.find(
            (candidate) =>
              candidate.connection ===
              'network',
          ) ??
          printers[0] ??
          null
      }

      if (!printer) {
        throw new Error(
          'No Zebra printer found.',
        )
      }

      await requestBrowserPrint(
        'POST',
        'write',
        {
          device: printer,
          data:
            buildWarehouseArrowZpl(
              direction,
            ),
        },
      )

      setSuccessMessage(
        `${direction.toUpperCase()} arrow label printed.`,
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to print arrow label.',
      )
    }
  }

  const handleShareTagToZebra = async (part: Part) => {
    setErrorMessage(null)
    setSuccessMessage(null)

    type BrowserPrintDevice = {
      name?: string
      uid?: string
      connection?: string
      deviceType?: string
      version?: number
      provider?: string
      manufacturer?: string
    }

    const browserPrintBase =
      window.location.protocol === 'https:'
        ? 'https://localhost:9101/'
        : 'http://localhost:9100/'

    const requestBrowserPrint = (
      method: 'GET' | 'POST',
      endpoint: string,
      body?: unknown,
    ) =>
      new Promise<string>((resolve, reject) => {
        const request = new XMLHttpRequest()

        request.open(
          method,
          `${browserPrintBase}${endpoint}`,
          true,
        )

        request.onreadystatechange = () => {
          if (request.readyState !== XMLHttpRequest.DONE) {
            return
          }

          if (request.status === 200) {
            resolve(request.responseText)
            return
          }

          reject(
            new Error(
              request.responseText ||
              `Browser Print returned HTTP ${request.status}.`,
            ),
          )
        }

        request.onerror = () => {
          reject(
            new Error(
              'Unable to reach Zebra Browser Print. Make sure Browser Print is running on this Mac.',
            ),
          )
        }

        if (body === undefined) {
          request.send()
        } else {
          request.send(JSON.stringify(body))
        }
      })

    try {
      const sourceVehicle =
        part.vehicleId === currentVehicle?.id
          ? currentVehicle
          : null

      /*
       * Zebra production tags ALWAYS use Compact 4x3.
       *
       * Do not depend on preview mode.
       * Do not fall back to the full browser-print layout.
       */
      const zpl =
        buildTexasOemCompactTagZpl(
          part,
          sourceVehicle,
        )

      let printer: BrowserPrintDevice | null = null

      const defaultResponse =
        await requestBrowserPrint(
          'GET',
          'default?type=printer',
        )

      if (defaultResponse.trim()) {
        printer =
          JSON.parse(defaultResponse) as BrowserPrintDevice
      }

      if (!printer?.connection) {
        const availableResponse =
          await requestBrowserPrint(
            'GET',
            'available',
          )

        const available =
          JSON.parse(availableResponse) as {
            printer?: BrowserPrintDevice[]
          }

        const printers =
          available.printer ?? []

        printer =
          printers.find((candidate) =>
            [
              candidate.uid,
              candidate.name,
            ]
              .filter(Boolean)
              .some((value) =>
                String(value).includes('192.168.1.185') ||
                String(value).includes('192.168.001.185'),
              ),
          ) ??
          printers.find(
            (candidate) =>
              candidate.connection === 'network',
          ) ??
          printers[0] ??
          null
      }

      if (!printer) {
        throw new Error(
          'Browser Print is running, but no Zebra printer was found. Open Browser Print and add 192.168.1.185 as the network printer.',
        )
      }

      await requestBrowserPrint(
        'POST',
        'write',
        {
          device: printer,
          data: zpl,
        },
      )

      setSuccessMessage(
        `Printed ${part.sku} directly to ${printer.name || printer.uid || 'Zebra ZD421'}.`,
      )
    } catch (error) {
      console.error(
        'Direct Zebra print failed:',
        error,
      )

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to print directly to Zebra.',
      )
    }
  }

  const openTagPreview = (part: Part, mode: TagMode = 'full', autoPrint = false) => {
    setTagPreviewMode(mode)
    setPrintLabelPart(part)
    setShouldAutoPrintTag(autoPrint)
  }

  const handlePrintLabel = (part: Part) => {
    /*
     * Production default is Compact 4x3.
     * Opening the tag must NEVER trigger the Mac print dialog.
     */
    openTagPreview(
      part,
      'compact',
      false,
    )
  }

  const loadExistingSkusForPrefix = async (prefix: string) => {
    const { data, error } = await supabase
      .from('parts')
      .select('sku')
      .like('sku', `${prefix}-%`)

    if (error) {
      throw error
    }

    return (data ?? [])
      .map((record) => (typeof record.sku === 'string' ? record.sku.trim().toUpperCase() : ''))
      .filter(Boolean)
  }

  const getNextRapidIntakeSku = async (stockNumber: string, partCode: string) => {
    const prefix = getSkuPrefix(stockNumber, partCode)
    const existingSkus = await loadExistingSkusForPrefix(prefix)
    const highestSuffix = existingSkus.reduce((max, existingSku) => Math.max(max, getSkuSuffixValue(existingSku, prefix)), 0)
    let nextSku = buildSkuPreview(stockNumber, partCode, highestSuffix + 1)

    const { data: existingExact, error: existingExactError } = await supabase
      .from('parts')
      .select('sku')
      .eq('sku', nextSku)
      .limit(1)

    if (existingExactError) {
      throw existingExactError
    }

    if ((existingExact ?? []).length > 0) {
      nextSku = buildSkuPreview(stockNumber, partCode, highestSuffix + 2)
    }

    return nextSku
  }


  const checkInterchangeIntelligence = async (
    part: Part,
    options?: {
      quiet?: boolean
    },
  ) => {
    const partNumber =
      String(part.partNumber ?? '').trim()

    if (!partNumber) {
      setErrorMessage(
        'A manufacturer/OEM part number is required before checking interchange.',
      )
      return
    }

    setIsCheckingInterchange(true)

    if (!options?.quiet) {
      setErrorMessage(null)
      setSuccessMessage(
        `Checking interchange intelligence for ${partNumber}…`,
      )
    }

    try {
      const functionUrl =
        `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/interchange-intelligence`

      const response = await fetch(
        functionUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
            apikey:
              import.meta.env
                .VITE_SUPABASE_ANON_KEY ?? '',
            Authorization:
              `Bearer ${
                import.meta.env
                  .VITE_SUPABASE_ANON_KEY ?? ''
              }`,
          },
          body: JSON.stringify({
            partNumber,
            ownSellerUsername:
              'texasoemparts',
          }),
        },
      )

      const responseText =
        await response.text()

      let data: Record<
        string,
        unknown
      > = {}

      try {
        data = responseText
          ? JSON.parse(responseText)
          : {}
      } catch {
        data = {}
      }

      if (!response.ok) {
        throw new Error(
          String(
            data.error ??
              `HTTP ${response.status} ${response.statusText}`,
          ),
        )
      }

      const verifiedRaw =
        Array.isArray(
          data.verified_interchanges,
        )
          ? data.verified_interchanges
          : []

      const market =
        data.market &&
        typeof data.market === 'object'
          ? data.market as Record<
              string,
              unknown
            >
          : {}

      const candidatesRaw =
        Array.isArray(
          market.candidates,
        )
          ? market.candidates
          : []

      const verified:
        VerifiedInterchange[] =
        verifiedRaw.map(
          (entry) => {
            const row =
              entry as Record<
                string,
                unknown
              >

            return {
              partNumber:
                String(
                  row.part_number ?? '',
                ),
              approvedAt:
                row.approved_at
                  ? String(
                      row.approved_at,
                    )
                  : null,
              notes:
                row.notes
                  ? String(row.notes)
                  : null,
            }
          },
        )

      const candidates:
        InterchangeCandidate[] =
        candidatesRaw.map(
          (entry) => {
            const row =
              entry as Record<
                string,
                unknown
              >

            return {
              candidatePartNumber:
                String(
                  row.candidate_part_number ??
                    '',
                ),

              confidence:
                Number(
                  row.confidence ?? 0,
                ),

              evidenceCount:
                Number(
                  row.evidence_count ??
                    0,
                ),

              externalSellerCount:
                Number(
                  row.external_seller_count ??
                    0,
                ),

              evidenceSource:
                String(
                  row.evidence_source ??
                    '',
                ),

              sellers:
                Array.isArray(
                  row.sellers,
                )
                  ? row.sellers.map(
                      (seller) =>
                        String(seller),
                    )
                  : [],
            }
          },
        )

      const nextResult:
        InterchangeIntelligenceResult =
        {
          sourcePartNumber:
            String(
              data.source_part_number ??
                partNumber,
            ),

          verified,

          candidates,

          marketSkipped:
            market.skipped === true,

          message:
            String(
              data.message ?? '',
            ),
        }

      setInterchangeResult(
        nextResult,
      )

      if (!options?.quiet) {
        if (verified.length > 0) {
          setSuccessMessage(
            `Verified interchange found: ${verified
              .map(
                (item) =>
                  item.partNumber,
              )
              .join(', ')}`,
          )
        } else if (
          candidates.length > 0
        ) {
          setSuccessMessage(
            `${candidates.length} likely interchange candidate${
              candidates.length === 1
                ? ''
                : 's'
            } found.`,
          )
        } else {
          setSuccessMessage(
            'No reliable interchange number found.',
          )
        }
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to check interchange intelligence.'

      setInterchangeResult(null)

      setErrorMessage(
        `Interchange Intelligence failed: ${message}`,
      )
    } finally {
      setIsCheckingInterchange(
        false,
      )
    }
  }

  const reviewInterchangeCandidate =
    async (
      part: Part,
      candidate:
        InterchangeCandidate,
      action:
        'approve' | 'reject',
    ) => {
      const sourcePartNumber =
        String(
          part.partNumber ?? '',
        ).trim()

      const candidatePartNumber =
        candidate
          .candidatePartNumber
          .trim()

      if (
        !sourcePartNumber ||
        !candidatePartNumber
      ) {
        setErrorMessage(
          'Missing interchange part-number information.',
        )
        return
      }

      const reviewKey =
        `${action}:${candidatePartNumber}`

      setInterchangeReviewKey(
        reviewKey,
      )

      setErrorMessage(null)

      try {
        const functionUrl =
          `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/interchange-review`

        const response =
          await fetch(
            functionUrl,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
                apikey:
                  import.meta.env
                    .VITE_SUPABASE_ANON_KEY ??
                  '',
                Authorization:
                  `Bearer ${
                    import.meta.env
                      .VITE_SUPABASE_ANON_KEY ??
                    ''
                  }`,
              },
              body:
                JSON.stringify({
                  action,
                  sourcePartNumber,
                  candidatePartNumber,
                }),
            },
          )

        const responseText =
          await response.text()

        let data: Record<
          string,
          unknown
        > = {}

        try {
          data = responseText
            ? JSON.parse(
                responseText,
              )
            : {}
        } catch {
          data = {}
        }

        if (!response.ok) {
          throw new Error(
            String(
              data.error ??
                `HTTP ${response.status}`,
            ),
          )
        }

        if (
          action === 'approve'
        ) {
          if (!supabase) {
            throw new Error(
              'Supabase is not configured for part-profile updates.',
            )
          }

          /*
           * Approval has already written the
           * relationship into the verified
           * interchange library.
           *
           * Now persist that approved value
           * directly onto this inventory part.
           */
          const {
            error: partInterchangeError,
          } =
            await supabase
              .from('parts')
              .update({
                interchange:
                  candidatePartNumber,
              })
              .eq(
                'id',
                part.id,
              )

          if (partInterchangeError) {
            throw new Error(
              `Interchange approved, but part profile save failed: ${partInterchangeError.message}`,
            )
          }

          const updatedPart: Part = {
            ...part,
            interchangeNumber:
              candidatePartNumber,
          }

          setParts((currentParts) => {
            const nextParts =
              currentParts.map(
                (currentPart) =>
                  currentPart.id ===
                  part.id
                    ? updatedPart
                    : currentPart,
              )

            persistPartsToStorage(
              nextParts,
            )

            return nextParts
          })

          setSelectedPart(
            (currentPart) =>
              currentPart?.id === part.id
                ? updatedPart
                : currentPart,
          )

          if (
            editingPartId === part.id
          ) {
            setPartFormData(
              (currentForm) => ({
                ...currentForm,
                interchangeNumber:
                  candidatePartNumber,
              }),
            )
          }

          setSuccessMessage(
            `${sourcePartNumber} ↔ ${candidatePartNumber} verified and saved to the part profile.`,
          )

          /*
           * Immediately reload so the card
           * switches into VERIFIED mode using
           * the permanent library fast path.
           */
          await checkInterchangeIntelligence(
            updatedPart,
            {
              quiet: true,
            },
          )
        } else {
          setSuccessMessage(
            `${candidatePartNumber} rejected.`,
          )

          setInterchangeResult(
            (current) => {
              if (!current) {
                return current
              }

              return {
                ...current,
                candidates:
                  current.candidates.filter(
                    (item) =>
                      item.candidatePartNumber !==
                      candidatePartNumber,
                  ),
                message:
                  'Interchange candidate rejected.',
              }
            },
          )
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to review interchange candidate.'

        setErrorMessage(
          `Interchange review failed: ${message}`,
        )
      } finally {
        setInterchangeReviewKey(
          null,
        )
      }
    }

  const refreshMarketData = async (part: Part) => {
    if (!supabase) {
      setErrorMessage('Supabase is not configured for market pricing.')
      return
    }

    setIsRefreshingMarketData(true)
    setErrorMessage(null)
    setSuccessMessage('Refreshing market comps…')

    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/ebay-market-pricing`

      const rawPartNumber = String(part.partNumber ?? '').trim()

      const titlePartNumberCandidates = (part.partName ?? '')
        .toUpperCase()
        .match(/\b[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g) ?? []

      const extractedPartNumber = titlePartNumberCandidates
        .filter((value) => {
          if (!/\d/.test(value)) return false
          if (/^EBAY-\d+$/i.test(value)) return false
          if (/^\d{2}-\d{2}$/.test(value)) return false
          if (/^(19|20)\d{2}-(19|20)\d{2}$/.test(value)) return false
          if (/^(19|20)\d{2}$/.test(value)) return false

          const compact = value.replace(/[^A-Z0-9]/g, '')
          return compact.length >= 5 && compact.length <= 15
        })
        .sort((left, right) => {
          const leftCompact = left.replace(/[^A-Z0-9]/g, '')
          const rightCompact = right.replace(/[^A-Z0-9]/g, '')

          const leftScore =
            (/^\d+$/.test(leftCompact) ? 100 : 50) +
            Math.min(leftCompact.length, 12)

          const rightScore =
            (/^\d+$/.test(rightCompact) ? 100 : 50) +
            Math.min(rightCompact.length, 12)

          return rightScore - leftScore
        })[0] ?? ''

      const marketPartNumber =
        /^EBAY-\d+$/i.test(rawPartNumber)
          ? extractedPartNumber
          : rawPartNumber

      const payload = {
        partId: part.id,
        partName: part.partName,
        partNumber: marketPartNumber,
        interchangeNumber: part.interchangeNumber,
        category: part.category,
        make: part.vehicleMake,
        model: part.vehicleModel,
        year: part.vehicleYear,
        engine: part.engine,
        transmission: part.transmission,
        condition: part.condition,
      }

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''}`,
        },
        body: JSON.stringify(payload),
      })

      const responseText = await response.text()
      let responseBody: Record<string, unknown> | null = null
      try {
        responseBody = responseText ? JSON.parse(responseText) as Record<string, unknown> : null
      } catch {
        responseBody = null
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}${responseText ? ` :: ${responseText}` : ''}`)
      }

      const data = responseBody ?? {}
      const nextComps = normalizeSoldComps((data?.sold_comps ?? []) as Array<Record<string, unknown>>)
      const prices = nextComps.map((item) => Number(item.totalPrice ?? item.price ?? 0)).filter((value) => Number.isFinite(value) && value > 0)
      const recommendation = prices.length ? estimateRecommendation(prices) : null
      const fallbackRecommendedPrice = Number((data?.suggested_price as number | string | undefined) ?? recommendation?.balanced ?? part.listPrice ?? 0)
      const fallbackQuickSale = Number((data?.quick_sale_price as number | string | undefined) ?? recommendation?.quickSale ?? 0)
      const fallbackMaxPrice = Number((data?.max_price as number | string | undefined) ?? recommendation?.maximumMargin ?? 0)
      const fallbackMedian = Number((data?.median_price as number | string | undefined) ?? (prices.length ? calculateAdjustedMedian(prices) : 0))

      const nextRecommendation: MarketRecommendation = {
        partId: part.id,
        sampleSize: Number((data?.pricing_comp_count as number | string | undefined) ?? prices.length),
        lowPrice: Number((data?.low_market_price as number | string | undefined) ?? (prices.length ? Math.min(...prices) : 0)),
        medianPrice: fallbackMedian,
        averagePrice: prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : 0,
        highPrice: Number((data?.high_market_price as number | string | undefined) ?? (prices.length ? Math.max(...prices) : 0)),
        recommendedPrice: fallbackRecommendedPrice,
        quickSalePrice: fallbackQuickSale,
        maximumMarginPrice: fallbackMaxPrice,
        confidenceScore: Number((data?.confidence as number | string | undefined) ?? (prices.length ? Math.min(100, Math.max(10, Math.round(prices.length * 12))) : 0)),
        pricingStrategy: 'Quick Sale',
        searchQuery: ((data?.query_used as string | undefined) ?? part.partNumber) || part.partName,
        soldCount: Number((data?.sold_count as number | string | undefined) ?? prices.length),
        pricingCompCount: Number((data?.pricing_comp_count as number | string | undefined) ?? prices.length),
        pricingBasis: (data?.pricing_basis as string | undefined) ?? null,
        shippingMode: (data?.shipping_mode as string | undefined) ?? 'free_shipping',
        source: (data?.source as string | undefined) ?? null,
      }

      setMarketComps(nextComps)
      setMarketRecommendation(nextRecommendation)
      setPendingListPrice(String(nextRecommendation.quickSalePrice ?? nextRecommendation.recommendedPrice ?? part.listPrice ?? 0))
      setSuccessMessage(nextComps.length ? 'Market pricing refreshed.' : 'Sold-data integration unavailable.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to refresh market data.'
      const configSummary = [
        `URL: ${import.meta.env.VITE_SUPABASE_URL ?? '[missing]'}`,
        `Anon key configured: ${Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY)}`,
        `Function name: ebay-market-pricing`,
      ].join(' | ')
      const debugMessage = [message, configSummary].filter(Boolean).join(' | ')
      setErrorMessage(`Market pricing failed: ${debugMessage}`)
      setMarketComps([])
      setMarketRecommendation(null)
    } finally {
      setIsRefreshingMarketData(false)
    }
  }

  const approveAndApplyPricing = async (part: Part) => {
    if (!supabase) {
      setErrorMessage('Supabase is not configured.')
      return
    }

    const nextPrice = Number(pendingListPrice)

    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      setErrorMessage('Enter a valid list price.')
      return
    }

    setErrorMessage(null)
    setSuccessMessage('Updating eBay price…')

    try {
      if (part.ebayItemId) {
        const functionUrl =
          `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/ebay-update-price`

        const ebayResponse = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
            Authorization:
              `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''}`,
          },
          body: JSON.stringify({
            ebayItemId: part.ebayItemId,
            price: nextPrice,
          }),
        })

        const ebayText = await ebayResponse.text()

        let ebayResult: Record<string, unknown> = {}

        try {
          ebayResult = ebayText
            ? JSON.parse(ebayText) as Record<string, unknown>
            : {}
        } catch {
          ebayResult = {}
        }

        if (
          !ebayResponse.ok ||
          ebayResult.success !== true
        ) {
          const ebayError =
            typeof ebayResult.error === 'string'
              ? ebayResult.error
              : ebayText || 'Unknown eBay error'

          throw new Error(
            `eBay price update failed: ${ebayError}`,
          )
        }
      }

      const { error: updateError } = await supabase
        .from('parts')
        .update({
          list_price: nextPrice,
        })
        .eq('id', part.id)

      if (updateError) {
        throw updateError
      }

      setParts((prev) =>
        prev.map((item) =>
          item.id === part.id
            ? { ...item, listPrice: nextPrice }
            : item
        )
      )

      setSelectedPart((prev) =>
        prev && prev.id === part.id
          ? { ...prev, listPrice: nextPrice }
          : prev
      )

      setPendingListPrice(String(nextPrice))

      const message = part.ebayItemId
        ? `✓ EBAY + OS PRICE UPDATED — $${nextPrice.toFixed(2)}`
        : `✓ OS PRICE UPDATED — $${nextPrice.toFixed(2)}`

      setSuccessMessage(message)
      window.alert(message)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to update price.'

      setErrorMessage(message)
      window.alert(`PRICE UPDATE FAILED\n\n${message}`)
    }
  }

  const generateListingDraft = async (
    part: Part,
    photosOverride?: PartPhoto[],
  ): Promise<ListingDraft | null> => {
    if (!supabase) {
      setErrorMessage('Supabase is not configured for listing generation.')
      return null
    }

    setIsGeneratingListingDraft(true)
    setErrorMessage(null)
    setSuccessMessage('Generating listing draft…')

    try {
      const listingPhotos = photosOverride ?? partPhotos

      const primaryPhoto =
        listingPhotos.find((photo) => photo.isPrimary)?.publicUrl ??
        listingPhotos[0]?.publicUrl ??
        null

      const photoUrls =
        listingPhotos
          .map((photo) => photo.publicUrl)
          .filter(Boolean)

      let nextDraft: ListingDraft | null = null
      let listingGeneratorSource:
        'AI' | 'LOCAL FALLBACK' = 'AI'
      let listingGeneratorError = ''

      try {
        const { data, error } = await supabase.functions.invoke('generate-listing-draft', {
          body: {
            part,
            vehicle: {
              year: part.vehicleYear,
              make: part.vehicleMake,
              model: part.vehicleModel,
              trim: '',
              vin: part.vehicleVin,
            },
            primaryPhotoUrl: primaryPhoto,
            photoUrls,
            oemPartNumber: part.partNumber,
            interchangeNumber: part.interchangeNumber,
            condition: part.condition,
            notes: part.notes,
            sku: part.sku,

            /*
             * Give listing intelligence the REAL sold-market
             * wording for this exact inventory part.
             *
             * Only use the current selected part's comps so
             * another part's market results can never leak in.
             */
            soldCompTitles:
              selectedPart?.id === part.id
                ? marketComps
                    .map((comp) =>
                      String(
                        comp.title ?? '',
                      ).trim(),
                    )
                    .filter(Boolean)
                    .slice(0, 15)
                : [],
          },
        })

        if (error) {
          throw new Error(error.message)
        }

        nextDraft = {
          ...normalizeServerListingDraft(data?.draft as Record<string, unknown> | undefined, {
            partId: part.id,
            pricingStatus: 'Pending eBay sold-data access',
            draftStatus: 'Draft',
          }),
          partId: part.id,
          pricingStatus: 'Pending eBay sold-data access',
          draftStatus: 'Draft',
        } as ListingDraft
      } catch (edgeFunctionError) {
        let message =
          edgeFunctionError instanceof Error
            ? edgeFunctionError.message
            : 'Unable to reach the listing draft service.'

        /*
         * Supabase FunctionsHttpError hides the useful
         * Edge Function response body inside context.
         * Pull it out so production failures tell us WHY.
         */
        const functionError =
          edgeFunctionError as {
            context?: Response
          }

        if (functionError?.context) {
          try {
            const responseBody =
              await functionError.context
                .clone()
                .text()

            if (responseBody.trim()) {
              message =
                `${message}\n\nServer response: ${responseBody}`
            }
          } catch {
            // Keep original Supabase error.
          }
        }

        listingGeneratorSource =
          'LOCAL FALLBACK'

        listingGeneratorError =
          message

        nextDraft = {
          ...buildFallbackListingDraft({
            part: {
              partName: part.partName,
              partNumber: part.partNumber,
              interchangeNumber: part.interchangeNumber,
              sku: part.sku,
              condition: part.condition,
              notes: part.notes,
              position: part.position,
              category: part.category,
              engine: part.engine,
              transmission: part.transmission,
            },
            vehicle: {
              year: part.vehicleYear,
              make: part.vehicleMake,
              model: part.vehicleModel,
              trim: '',
              vin: part.vehicleVin,
            },
            primaryPhotoUrl: primaryPhoto,
            photoUrls,
          }),
          partId: part.id,
          pricingStatus: 'Pending eBay sold-data access',
          draftStatus: 'Draft',
        }
        setErrorMessage(`Listing draft service unavailable; using a local draft fallback. ${message}`)
      }

      const nextDraftWithV3 = nextDraft
        ? {
            ...nextDraft,
            descriptionHtml: buildTexasOemEbayDescriptionV3({
              title: nextDraft.title ?? part.partName,
              description: nextDraft.description,
              partName: part.partName,
              partNumber: part.partNumber,
              interchangeNumber: part.interchangeNumber,
              sku: part.sku,
              condition: part.condition,
              notes: part.notes,
              position: part.position,
              category: part.category,
              engine: part.engine,
              transmission: part.transmission,
              year: part.vehicleYear,
              make: part.vehicleMake,
              model: part.vehicleModel,
              trim: '',
              vin: part.vehicleVin,
              primaryPhotoUrl: primaryPhoto,
              photoUrls,
            }),
          }
        : null

      setListingDraft(nextDraftWithV3)
      setShowListingDraftModal(false)

      if (
        listingGeneratorSource ===
        'LOCAL FALLBACK'
      ) {
        const diagnostic =
          `LISTING GENERATOR FAILED — LOCAL FALLBACK USED\n\n` +
          `Reason: ${listingGeneratorError}\n\n` +
          `Fallback title: ${
            nextDraftWithV3?.title ?? 'NONE'
          }`

        console.error(diagnostic)
        setErrorMessage(diagnostic)
        window.alert(diagnostic)
      } else {
        const diagnostic =
          `AI LISTING GENERATOR WORKED\n\n` +
          `Generated title: ${
            nextDraftWithV3?.title ?? 'NONE'
          }`

        console.log(diagnostic)
        setSuccessMessage(
          'AI eBay listing draft generated.',
        )
        window.alert(diagnostic)
      }

      return nextDraftWithV3
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate listing draft.'
      setErrorMessage(`Listing draft failed: ${message}`)
      return null
    } finally {
      setIsGeneratingListingDraft(false)
    }
  }

  const previewListingTemplateV3 = (
    part: Part,
    draft: ListingDraft,
  ) => {
    const html = buildTexasOemEbayDescriptionV3({
      title: draft.title ?? part.partName,
      description: draft.description,
      partName: part.partName,
      partNumber: part.partNumber,
      interchangeNumber: part.interchangeNumber,
      sku: part.sku,
      condition: part.condition,
      notes: part.notes,
      position: part.position,
      category: part.category,
      engine: part.engine,
      transmission: part.transmission,
      year: part.vehicleYear,
      make: part.vehicleMake,
      model: part.vehicleModel,
      trim: '',
      vin: part.vehicleVin,
      primaryPhotoUrl: part.primaryPhotoUrl,
      photoUrls: partPhotos
        .map((photo) => photo.publicUrl)
        .filter((url): url is string => Boolean(url)),
    })

    setListingPreviewHtml(html)
    setShowListingPreview(true)
  }

  const openSavedListingDraft = async (part: Part) => {
    const savedDraft =
      listingDraftByPartId.get(part.id)

    if (!savedDraft) {
      await generateListingDraft(part)
      return
    }

    await loadPartPhotos(part.id)

    const restoredDraft =
      normalizeServerListingDraft({
        title:
          savedDraft.title,
        conditionDescription:
          savedDraft.condition_description,
        description:
          savedDraft.description,
        descriptionHtml:
          savedDraft.description_html,
        categorySuggestion:
          savedDraft.category_suggestion,
        itemSpecifics:
          savedDraft.item_specifics,
        compatibilityNotes:
          savedDraft.compatibility_notes,
        pricingStatus:
          savedDraft.pricing_status,
        draftStatus:
          savedDraft.draft_status,
        updatedAt:
          savedDraft.updated_at,
      }, {
        partId:
          part.id,
        draftStatus:
          savedDraft.draft_status || 'Draft Ready',
      })

    setSelectedPart(part)
    setListingDraft({
      ...restoredDraft,
      partId:
        part.id,
      draftStatus:
        savedDraft.draft_status || 'Draft Ready',
      updatedAt:
        savedDraft.updated_at,
    })

    setShowPartDetailsModal(false)
    setShowListingDraftModal(true)

    setSuccessMessage(
      savedDraft.ebay_offer_id
        ? `Draft Ready • Offer ${savedDraft.ebay_offer_id}`
        : 'Draft Ready',
    )
  }

  const getMissingRequiredEbayAspects = () => {
    if (!listingDraft) return []

    const specifics =
      listingDraft.itemSpecifics &&
      typeof listingDraft.itemSpecifics === 'object'
        ? listingDraft.itemSpecifics
        : {}

    return ebayCategoryAspects
      .filter((aspect) => aspect.required)
      .filter((aspect) => {
        const value = specifics[aspect.name]

        if (Array.isArray(value)) {
          return !value.some(
            (item) =>
              typeof item === 'string' &&
              item.trim().length > 0
          )
        }

        return !(
          typeof value === 'string' &&
          value.trim().length > 0
        )
      })
  }

  const setEbayItemSpecific = (
    name: string,
    value: string,
  ) => {
    setListingDraft((prev) => {
      if (!prev) return prev

      return {
        ...prev,
        itemSpecifics: {
          ...(prev.itemSpecifics ?? {}),
          [name]: value,
        },
      }
    })
  }

  const validateEbayListing = async (part: Part) => {
    if (!supabase || !listingDraft) {
      setErrorMessage('Generate a listing draft before validating for eBay.')
      return
    }

    setErrorMessage(null)
    setSuccessMessage('Validating eBay listing…')

    try {
      const photoUrls = partPhotos
        .map((photo) => photo.publicUrl)
        .filter(Boolean)

      const categoryQuery = part.partName.trim()

      const { data: categoryData, error: categoryError } =
        await supabase.functions.invoke('ebay-category-resolver', {
          body: {
            query: categoryQuery,
          },
        })

      if (categoryError) {
        throw new Error(categoryError.message)
      }

      const bestMatch = categoryData?.bestMatch

      setEbayResolvedCategory(
        bestMatch?.categoryId
          ? {
              categoryId: String(bestMatch.categoryId),
              categoryName: String(bestMatch.categoryName ?? ''),
            }
          : null
      )

      setEbayCategoryAspects(
        Array.isArray(categoryData?.aspects)
          ? categoryData.aspects
          : []
      )

      if (!bestMatch?.categoryId) {
        throw new Error(
          `No verified eBay Motors category found for "${categoryQuery}".`
        )
      }

      const requiredAspects = Array.isArray(categoryData?.aspects)
        ? categoryData.aspects.filter(
            (aspect: { required?: boolean }) =>
              aspect?.required === true
          )
        : []

      const specifics =
        listingDraft.itemSpecifics &&
        typeof listingDraft.itemSpecifics === 'object'
          ? listingDraft.itemSpecifics
          : {}

      // OEM automotive parts should not require the operator
      // to manually choose Brand every time.
      const inferredBrand =
        String(part.brand ?? '').trim() ||
        String(part.vehicleMake ?? '').trim() ||
        'OEM'

      const effectiveSpecifics: Record<string, unknown> = {
        ...specifics,
        Brand:
          typeof specifics['Brand'] === 'string' &&
          specifics['Brand'].trim()
            ? specifics['Brand']
            : inferredBrand,
        'Manufacturer Part Number':
          typeof specifics['Manufacturer Part Number'] === 'string' &&
          specifics['Manufacturer Part Number'].trim()
            ? specifics['Manufacturer Part Number']
            : String(part.partNumber ?? '').trim(),
      }

      const missingRequired = requiredAspects.filter(
        (aspect: { name?: string }) => {
          const name = String(aspect?.name ?? '').trim()
          if (!name) return false

          const value = effectiveSpecifics[name]

          if (Array.isArray(value)) {
            return !value.some(
              (item) =>
                typeof item === 'string' &&
                item.trim().length > 0
            )
          }

          return !(
            typeof value === 'string' &&
            value.trim().length > 0
          )
        }
      )

      if (missingRequired.length > 0) {
        throw new Error(
          `Missing required eBay item specifics:\n• ${missingRequired
            .map((aspect: { name?: string }) =>
              String(aspect.name ?? 'Required field')
            )
            .join('\n• ')}`
        )
      }

      const { data: previewData, error: previewError } =
        await supabase.functions.invoke('ebay-publish-listing', {
          body: {
            part,
            draft: listingDraft,
            category: bestMatch,
            photoUrls,
          },
        })

      if (previewError) {
        throw new Error(previewError.message)
      }

      if (!previewData?.readyForEbay) {
        const errors = Array.isArray(previewData?.validationErrors)
          ? previewData.validationErrors.join('\n• ')
          : 'Unknown validation error'

        throw new Error(`Listing is not ready:\n• ${errors}`)
      }

      setSuccessMessage(
        `eBay validation passed • ${bestMatch.categoryName} (${bestMatch.categoryId})`
      )

      window.alert(
        `EBAY VALIDATION PASSED\n\n` +
        `Category: ${bestMatch.categoryName}\n` +
        `Category ID: ${bestMatch.categoryId}\n` +
        `Price: $${Number(part.listPrice || 0).toFixed(2)}\n` +
        `Photos: ${photoUrls.length}\n\n` +
        `Nothing was published to eBay.`
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to validate eBay listing.'

      setErrorMessage(message)
      window.alert(`EBAY VALIDATION FAILED\n\n${message}`)
    }
  }

  const createEbayDraft = async (
    part: Part,
    draftOverride?: ListingDraft,
  ) => {
    const activeDraft = draftOverride ?? listingDraft

    if (!supabase || !activeDraft) {
      setErrorMessage('Unable to prepare the eBay listing.')
      return
    }

    /*
     * CRITICAL LISTING ISOLATION RULE:
     *
     * A draft generated for one inventory part must NEVER
     * be allowed to publish/create against another part.
     */
    if (
      activeDraft.partId &&
      activeDraft.partId !== part.id
    ) {
      const contaminationError =
        `LISTING SAFETY BLOCK: Draft belongs to ${activeDraft.partId}, ` +
        `but current part is ${part.id}.`

      console.error(contaminationError)
      setErrorMessage(contaminationError)
      window.alert(contaminationError)
      return
    }

    const confirmed = window.confirm(
      'CREATE EBAY DRAFT?\n\n' +
      'This will create an Inventory Item and UNPUBLISHED eBay Offer.\n\n' +
      'It will NOT create a live eBay listing.'
    )

    if (!confirmed) {
      return
    }

    setErrorMessage(null)
    setSuccessMessage('Creating unpublished eBay draft…')

    try {
      /*
       * NEVER use ambient/global photo state for an eBay payload.
       * Load the photos belonging to this exact inventory part.
       */
      const {
        data: exactPhotoRows,
        error: exactPhotoError,
      } = await supabase
        .from('part_photos')
        .select(
          'public_url, is_primary, sort_order',
        )
        .eq('part_id', part.id)
        .order('sort_order', {
          ascending: true,
        })

      if (exactPhotoError) {
        throw new Error(
          `Unable to load exact part photos: ${exactPhotoError.message}`,
        )
      }

      const photoUrls = (exactPhotoRows ?? [])
        .map((photo) =>
          String(photo.public_url ?? '').trim(),
        )
        .filter(Boolean)

      if (photoUrls.length === 0) {
        throw new Error(
          `LISTING SAFETY BLOCK: No photos found for ${part.sku}.`,
        )
      }

      const exactPrimaryPhotoUrl =
        String(
          (exactPhotoRows ?? []).find(
            (photo) =>
              photo.is_primary === true,
          )?.public_url ?? '',
        ).trim() ||
        photoUrls[0] ||
        String(part.primaryPhotoUrl ?? '').trim()

      const currentV3Html = buildTexasOemEbayDescriptionV3({
        title: activeDraft.title ?? part.partName,
        description: activeDraft.description,
        partName: part.partName,
        partNumber: part.partNumber,
        interchangeNumber: part.interchangeNumber,
        sku: part.sku,
        condition: part.condition,
        notes: part.notes,
        position: part.position,
        category: part.category,
        engine: part.engine,
        transmission: part.transmission,
        year: part.vehicleYear,
        make: part.vehicleMake,
        model: part.vehicleModel,
        trim: '',
        vin: part.vehicleVin,
        primaryPhotoUrl:
          exactPrimaryPhotoUrl,
        photoUrls,
      })

      const categoryQuery = part.partName.trim()

      const { data: categoryData, error: categoryError } =
        await supabase.functions.invoke('ebay-category-resolver', {
          body: {
            query: categoryQuery,
          },
        })

      if (categoryError) {
        throw new Error(categoryError.message)
      }

      const bestMatch = categoryData?.bestMatch

      setEbayResolvedCategory(
        bestMatch?.categoryId
          ? {
              categoryId: String(bestMatch.categoryId),
              categoryName: String(bestMatch.categoryName ?? ''),
            }
          : null
      )

      setEbayCategoryAspects(
        Array.isArray(categoryData?.aspects)
          ? categoryData.aspects
          : []
      )

      if (!bestMatch?.categoryId) {
        throw new Error(
          `No verified eBay Motors category found for "${categoryQuery}".`
        )
      }

      const requiredAspects = Array.isArray(categoryData?.aspects)
        ? categoryData.aspects.filter(
            (aspect: { required?: boolean }) =>
              aspect?.required === true
          )
        : []

      const specifics =
        activeDraft.itemSpecifics &&
        typeof activeDraft.itemSpecifics === 'object'
          ? activeDraft.itemSpecifics
          : {}

      const inferredBrand =
        String(part.brand ?? '').trim() ||
        String(part.vehicleMake ?? '').trim() ||
        'OEM'

      const effectiveSpecifics: Record<string, unknown> = {
        ...specifics,
        Brand:
          typeof specifics['Brand'] === 'string' &&
          specifics['Brand'].trim()
            ? specifics['Brand']
            : inferredBrand,
        'Manufacturer Part Number':
          typeof specifics['Manufacturer Part Number'] === 'string' &&
          specifics['Manufacturer Part Number'].trim()
            ? specifics['Manufacturer Part Number']
            : String(part.partNumber ?? '').trim(),
      }

      const missingRequired = requiredAspects.filter(
        (aspect: { name?: string }) => {
          const name = String(aspect?.name ?? '').trim()
          if (!name) return false

          const value = effectiveSpecifics[name]

          if (Array.isArray(value)) {
            return !value.some(
              (item) =>
                typeof item === 'string' &&
                item.trim().length > 0
            )
          }

          return !(
            typeof value === 'string' &&
            value.trim().length > 0
          )
        }
      )

      if (missingRequired.length > 0) {
        throw new Error(
          `Missing required eBay item specifics:\n• ${missingRequired
            .map((aspect: { name?: string }) =>
              String(aspect.name ?? 'Required field')
            )
            .join('\n• ')}`
        )
      }

      const { data, error } =
        await supabase.functions.invoke('ebay-publish-listing', {
          body: {
            mode: 'CREATE_DRAFT',
            part,
            draft: {
              ...activeDraft,
              itemSpecifics: effectiveSpecifics,
              descriptionHtml: currentV3Html,
            },
            category: bestMatch,
            photoUrls,
          },
        })

      if (error) {
        throw new Error(error.message)
      }
        if (
          !data?.success ||
          (!data?.offerCreated && !data?.offerUpdated)
        ) {
          const validationDetail =
            Array.isArray(data?.validationErrors) &&
            data.validationErrors.length > 0
              ? data.validationErrors.join('\n• ')
              : ''

          const detail =
            validationDetail
              ? `Missing listing information:\n• ${validationDetail}`
              : data?.ebayResponse ||
                data?.error ||
                data?.message ||
                'eBay did not create or update the offer.'

          const stage = data?.stage ? `Stage: ${data.stage}` : ''
          const http = data?.ebayHttp ? `eBay HTTP: ${data.ebayHttp}` : ''

          throw new Error(
            [stage, http, String(detail)].filter(Boolean).join('\n')
          )
        }
      const offerId = String(data.offerId || '')

      const draftCreatedAt = new Date().toISOString()

      const { error: draftTrackingError } = await supabase
        .from('listing_drafts')
        .upsert({
          part_id: part.id,
          title: activeDraft.title ?? '',
          condition_description: activeDraft.conditionDescription ?? '',
          description: activeDraft.description ?? '',
          description_html: currentV3Html,
          category_suggestion: activeDraft.categorySuggestion ?? '',
          item_specifics: activeDraft.itemSpecifics ?? {},
          compatibility_notes: activeDraft.compatibilityNotes ?? '',
          pricing_status: activeDraft.pricingStatus ?? 'Pending',
          draft_status: 'Draft Ready',
          ebay_offer_id: offerId || null,
          ebay_category_id: String(bestMatch.categoryId || ''),
          ebay_category_name: String(bestMatch.categoryName || ''),
          ebay_draft_created_at: draftCreatedAt,
          updated_at: draftCreatedAt,
        }, {
          onConflict: 'part_id',
        })

      if (draftTrackingError) {
        throw new Error(
          `eBay draft was created, but Texas OEM OS could not save the draft status: ${draftTrackingError.message}`
        )
      }

      await loadListingDraftRecords()

      setSuccessMessage(
        `Draft Ready${offerId ? ` • Offer ${offerId}` : ''}.`
      )

      window.alert(
        `EBAY DRAFT CREATED\n\n` +
        `Category: ${bestMatch.categoryName}\n` +
        `Category ID: ${bestMatch.categoryId}\n` +
        `SKU: ${part.sku}\n` +
        `Price: $${Number(part.listPrice || 0).toFixed(2)}\n` +
        `Photos: ${photoUrls.length}\n` +
        `${offerId ? `Offer ID: ${offerId}\n` : ''}\n` +
        `STATUS: UNPUBLISHED\n\n` +
        `Nothing is live on eBay yet.`
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to create eBay draft.'

      setErrorMessage(message)
      window.alert(`EBAY DRAFT FAILED\n\n${message}`)
    }
  }

    const publishEbayOffer = async (part: Part) => {
      if (!supabase) {
        setErrorMessage('Supabase is not configured.')
        return
      }

      const sku = part.sku?.trim()

      if (!sku) {
        setErrorMessage('This part does not have a valid SKU.')
        return
      }

      const confirmed = window.confirm(
        'PUBLISH TO EBAY?\n\n' +
        'THIS WILL MAKE THE LISTING LIVE.\n\n' +
        `SKU: ${sku}\n` +
        `Price: $${Number(part.listPrice || 0).toFixed(2)}\n\n` +
        'Continue?'
      )

      if (!confirmed) {
        return
      }

      setErrorMessage(null)
      setSuccessMessage('Publishing to eBay…')

      try {
        /*
         * PRODUCTION SAFETY:
         *
         * Publishing must be completely isolated by part.id.
         * Do NOT trust global listingDraft or partPhotos here.
         */

        const {
          data: publishPhotoRows,
          error: publishPhotoError,
        } = await supabase
          .from('part_photos')
          .select(
            'public_url, is_primary, sort_order',
          )
          .eq('part_id', part.id)
          .order('sort_order', {
            ascending: true,
          })

        if (publishPhotoError) {
          throw new Error(
            `Unable to load publish photos: ${publishPhotoError.message}`,
          )
        }

        const publishPhotoUrls =
          (publishPhotoRows ?? [])
            .map((photo) =>
              String(
                photo.public_url ?? '',
              ).trim(),
            )
            .filter(Boolean)

        if (publishPhotoUrls.length === 0) {
          throw new Error(
            `LISTING SAFETY BLOCK: No photos found for ${part.sku}.`,
          )
        }

        const publishPrimaryPhotoUrl =
          String(
            (publishPhotoRows ?? []).find(
              (photo) =>
                photo.is_primary === true,
            )?.public_url ?? '',
          ).trim() ||
          publishPhotoUrls[0] ||
          String(
            part.primaryPhotoUrl ?? '',
          ).trim()

        /*
         * Read the listing draft belonging to THIS part only.
         */
        const {
          data: exactDraftRow,
          error: exactDraftError,
        } = await supabase
          .from('listing_drafts')
          .select(
            'part_id, title, description',
          )
          .eq('part_id', part.id)
          .maybeSingle()

        if (exactDraftError) {
          throw new Error(
            `Unable to load exact listing draft: ${exactDraftError.message}`,
          )
        }

        if (!exactDraftRow) {
          throw new Error(
            `LISTING SAFETY BLOCK: No saved eBay draft exists for ${part.sku}.`,
          )
        }

        if (
          String(
            exactDraftRow.part_id ?? '',
          ) !== part.id
        ) {
          throw new Error(
            `LISTING SAFETY BLOCK: Saved draft does not belong to ${part.sku}.`,
          )
        }

        const exactListingTitle =
          String(
            exactDraftRow.title ?? '',
          ).trim() ||
          part.partName

        const currentV3Html =
          buildTexasOemEbayDescriptionV3({
            title: exactListingTitle,
            description:
              String(
                exactDraftRow.description ?? '',
              ).trim(),
            partName: part.partName,
            partNumber: part.partNumber,
            interchangeNumber:
              part.interchangeNumber,
            sku: part.sku,
            condition: part.condition,
            notes: part.notes,
            position: part.position,
            category: part.category,
            engine: part.engine,
            transmission:
              part.transmission,
            year: part.vehicleYear,
            make: part.vehicleMake,
            model: part.vehicleModel,
            trim: '',
            vin: part.vehicleVin,
            primaryPhotoUrl:
              publishPrimaryPhotoUrl,
            photoUrls:
              publishPhotoUrls,
          })

        const { data, error } =
          await supabase.functions.invoke('ebay-publish-listing', {
            body: {
              mode: 'PUBLISH_OFFER',
              sku,
              draft: {
                title: exactListingTitle,
                descriptionHtml: currentV3Html,
              },
            },
          })

        if (error) {
          throw new Error(error.message)
        }

        if (!data?.success || !data?.listingId) {
          const detail =
            data?.ebayResponse ||
            data?.error ||
            data?.message ||
            'eBay did not publish the offer.'

          const stage = data?.stage ? `Stage: ${data.stage}` : ''
          const http = data?.ebayHttp ? `eBay HTTP: ${data.ebayHttp}` : ''

          throw new Error(
            [stage, http, String(detail)].filter(Boolean).join('\n')
          )
        }

        const listingId = String(data.listingId)

        const { error: updateError } = await supabase
          .from('parts')
          .update({ listed: true })
          .eq('id', part.id)

        if (updateError) {
          throw new Error(
            `Listing is LIVE on eBay, but OS status update failed: ${updateError.message}`
          )
        }

        setSuccessMessage(`LIVE ON EBAY • Item ${listingId}`)

        await loadPartsInventory()
        await loadEbayListings()

        window.alert(
          `LISTING IS LIVE ON EBAY\n\n` +
          `SKU: ${sku}\n` +
          `eBay Item ID: ${listingId}\n` +
          `Price: $${Number(part.listPrice || 0).toFixed(2)}`
        )
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to publish listing to eBay.'

        setErrorMessage(message)
        window.alert(`EBAY PUBLISH FAILED\n\n${message}`)
      }
    }

  const saveListingDraft = async (part: Part) => {
    if (!supabase || !listingDraft) {
      return
    }

    const { error } = await supabase.from('listing_drafts').upsert({
      part_id: part.id,
      title: listingDraft.title ?? '',
      condition_description: listingDraft.conditionDescription ?? '',
      description: listingDraft.description ?? '',
      description_html: listingDraft.descriptionHtml ?? '',
      category_suggestion: listingDraft.categorySuggestion ?? '',
      item_specifics: listingDraft.itemSpecifics ?? {},
      compatibility_notes: listingDraft.compatibilityNotes ?? '',
      pricing_status: listingDraft.pricingStatus ?? 'Pending eBay sold-data access',
      draft_status: listingDraft.draftStatus ?? 'Draft',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'part_id' }).select().single()

    if (error) {
      setErrorMessage(`Unable to save listing draft: ${error.message}`)
      return
    }

    setListingDraftHistory((prev) => [
      {
        id: `${part.id}-${Date.now()}`,
        listingDraftId: part.id,
        title: listingDraft.title ?? '',
        conditionDescription: listingDraft.conditionDescription ?? '',
        description: listingDraft.description ?? '',
        itemSpecifics: listingDraft.itemSpecifics ?? {},
        changedAt: new Date().toISOString(),
        changeReason: 'Saved draft',
      },
      ...prev,
    ])
    setSuccessMessage('Listing draft saved.')
  }

  const handleOpenPartModal = async (part?: Part) => {
    setErrorMessage(null)
    setSuccessMessage(null)

    // CRITICAL: listing state must NEVER carry across inventory items.
    setListingDraft(null)
    setEbayResolvedCategory(null)
    setEbayCategoryAspects([])
    setListingPreviewHtml('')
    setShowListingPreview(false)

    setIsStandalonePart(part ? !part.vehicleId : !currentVehicle)
    if (part) {
      await loadPartPhotos(part.id)
      setPartFormData({
        partName: part.partName,
        partNumber: part.partNumber,
        interchangeNumber: part.interchangeNumber,
        brand:
          part.brand ||
          getOemBrandFromVehicleMake(
            part.vehicleMake,
          ),
        category: part.category,
        condition: part.condition,
        engine: part.engine,
        transmission: part.transmission,
        color: part.color,
        location: part.location,
        shelf: part.shelf,
        bin: part.bin,
        quantity: String(part.quantity || 1),
        cost: String(part.cost || 0),
        listPrice: String(part.listPrice),
        soldPrice: String(part.soldPrice || 0),
        weight: String(part.weight || ''),
        ebayItemId: part.ebayItemId,
        ebayStatus: part.ebayStatus,
        dateListed: part.dateListed,
        dateSold: part.dateSold,
        notes: part.notes,
        photoCount: String(part.photoCount || 0),
        skuCode: part.skuCode || '',
        skuPreview: part.skuPreview || part.sku || '',
      })
      setEditingPartId(part.id)
      setPartModalMode('edit')
      refreshSkuPreview({
        ...partFormData,
        partName: part.partName,
        partNumber: part.partNumber,
        interchangeNumber: part.interchangeNumber,
        brand:
          part.brand ||
          getOemBrandFromVehicleMake(
            part.vehicleMake,
          ),
        category: part.category,
        condition: part.condition,
        engine: part.engine,
        transmission: part.transmission,
        color: part.color,
        location: part.location,
        shelf: part.shelf,
        bin: part.bin,
        quantity: String(part.quantity || 1),
        cost: String(part.cost || 0),
        listPrice: String(part.listPrice),
        soldPrice: String(part.soldPrice || 0),
        weight: String(part.weight || ''),
        ebayItemId: part.ebayItemId,
        ebayStatus: part.ebayStatus,
        dateListed: part.dateListed,
        dateSold: part.dateSold,
        notes: part.notes,
        photoCount: String(part.photoCount || 0),
        skuCode: part.skuCode || '',
        skuPreview: part.skuPreview || part.sku || '',
      })
    } else {
      setPartPhotos([])
      const suggestedPartName = getSuggestedPartName(currentVehicle, currentVehicle?.stage)
      const suggestedShelfLocation = parts.length > 0 ? generateShelfLocation(parts) : 'A-01'
      setPartFormData({
        ...initialPartFormState,
        partName: suggestedPartName,
        brand:
          getOemBrandFromVehicleMake(
            currentVehicle?.make,
          ),
        location: currentVehicle ? `${currentVehicle.make} ${currentVehicle.model}` : '',
        shelf: suggestedShelfLocation,
        quantity: '1',
        cost: '0',
        listPrice: '0',
        soldPrice: '0',
        photoCount: '0',
        skuCode: '',
        skuPreview: '',
      })
      setEditingPartId(null)
      setPartModalMode('add')
    }
    setShowPartModal(true)
  }

  const handleClosePartModal = () => {
    setShowPartModal(false)

    // CRITICAL: destroy draft state when leaving a part.
    setListingDraft(null)
    setEbayResolvedCategory(null)
    setEbayCategoryAspects([])
    setListingPreviewHtml('')
    setShowListingPreview(false)

    setPartFormData(initialPartFormState)
    setEditingPartId(null)
    setPartModalMode('add')
    setPartPhotos([])
    setUploadProgress('')
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const handleOpenPartDetails = async (part: Part) => {
    setSelectedPart(part)
    setRepairSkuTarget(part)
    setRepairSkuValue(part.sku || '')
    setRepairReason('Manual SKU repair')
    setShowPartDetailsModal(true)
    await loadPartPhotos(part.id)
  }

  const handleClosePartDetails = () => {
    setShowPartDetailsModal(false)
    setSelectedPart(null)
    setRepairSkuTarget(null)
    setRepairSkuValue('')
    setRepairReason('')
    setPartPhotos([])
    setPreviewPhoto(null)
  }

const handleStartLocationAudit = () => {
  if (!scannedBin) {
    setErrorMessage('Scan or open a warehouse location first.')
    return
  }

  setLocationAuditScannedIds([])
  setLocationAuditWrongParts([])
  setLocationAuditUnknownScans([])
  setLocationAuditActive(true)
  setErrorMessage(null)
  setSuccessMessage(
    `Audit started for ${scannedBin}. Scan every physical part in this location.`,
  )
}

const handleCancelLocationAudit = () => {
  setLocationAuditActive(false)
  setLocationAuditScannedIds([])
  setLocationAuditWrongParts([])
  setLocationAuditUnknownScans([])
}

const handleFinishLocationAudit = () => {
  if (!scannedBin) {
    return
  }

  const expectedParts = parts.filter(
    (part) =>
      normalizeSearchToken(part.bin) ===
      normalizeSearchToken(scannedBin),
  )

  const missingParts = expectedParts.filter(
    (part) => !locationAuditScannedIds.includes(part.id),
  )

  setLocationAuditActive(false)

  if (
    missingParts.length === 0 &&
    locationAuditWrongParts.length === 0 &&
    locationAuditUnknownScans.length === 0
  ) {
    setSuccessMessage(
      `Audit complete: ${scannedBin} verified with ${expectedParts.length} part${expectedParts.length === 1 ? '' : 's'}.`,
    )
  } else {
    setSuccessMessage(
      `Audit complete: ${missingParts.length} missing, ${locationAuditWrongParts.length} wrong-location, ${locationAuditUnknownScans.length} unknown.`,
    )
  }
}

const handleScannerLookup = async (rawValue?: string) => {
  const scannedValue = (rawValue ?? scannerValue).trim()

  if (!scannedValue) {
    setErrorMessage('Scan a part or warehouse location barcode first.')
    return
  }

  setErrorMessage(null)
  setSuccessMessage(null)

  const normalizedScannedValue = scannedValue.toUpperCase()

  if (locationAuditActive && scannedBin) {
    const normalizedAuditValue = normalizeSearchToken(scannedValue)

    const auditMatches = parts.filter((part) =>
      [
        part.sku,
        part.ebayItemId,
        part.partNumber,
        part.interchangeNumber,
      ].some(
        (value) =>
          value &&
          normalizeSearchToken(value) === normalizedAuditValue,
      ),
    )

    if (auditMatches.length === 0) {
      setLocationAuditUnknownScans((prev) =>
        prev.includes(scannedValue)
          ? prev
          : [...prev, scannedValue],
      )
      setErrorMessage(`UNKNOWN ITEM: ${scannedValue}`)
      setScannerValue('')
      return
    }

    if (auditMatches.length !== 1) {
      setErrorMessage(
        `${auditMatches.length} inventory records match ${scannedValue}. Scan the unique SKU.`,
      )
      setScannerValue('')
      return
    }

    const auditedPart = auditMatches[0]

    const belongsHere =
      normalizeSearchToken(auditedPart.bin) ===
      normalizeSearchToken(scannedBin)

    if (belongsHere) {
      setLocationAuditScannedIds((prev) =>
        prev.includes(auditedPart.id)
          ? prev
          : [...prev, auditedPart.id],
      )

      setSuccessMessage(
        `VERIFIED: ${auditedPart.sku || auditedPart.partName}`,
      )
      setErrorMessage(null)
      setScannerValue('')
      return
    }

    setLocationAuditWrongParts((prev) =>
      prev.some((part) => part.id === auditedPart.id)
        ? prev
        : [...prev, auditedPart],
    )

    setErrorMessage(
      `WRONG LOCATION: ${auditedPart.sku || auditedPart.partName} belongs in ${auditedPart.bin || 'UNASSIGNED'}.`,
    )
    setScannerValue('')
    return
  }

  const warehouseLocationPattern =
    /^W\d{2}-R\d{2}-B\d{2}-L\d{2}-(?:A|S|P)\d{2,3}$/i

  const isWarehouseLocation =
    warehouseLocationPattern.test(normalizedScannedValue)

  // ----------------------------------------------------------
  // LOCATION SCAN
  // ----------------------------------------------------------

  if (isWarehouseLocation) {
    const locationValue = normalizedScannedValue

    if (scannerMode === 'move') {
      const queuedParts = moveQueuedPartsRef.current

      // PART(S) FIRST -> LOCATION
      if (queuedParts.length > 0) {
        if (!supabase) {
          setErrorMessage('Database connection is unavailable.')
          return
        }

        const queuedIds = queuedParts.map((part) => part.id)

        const { data: movedParts, error } = await supabase
          .from('parts')
          .update({
            bin: locationValue,
          })
          .in('id', queuedIds)
          .select('id, sku, bin')

        if (error) {
          setErrorMessage(
            `Unable to assign queued parts to ${locationValue}: ${error.message}`,
          )
          return
        }

        if (!movedParts || movedParts.length !== queuedIds.length) {
          setErrorMessage(
            `Warehouse update was incomplete. Expected ${queuedIds.length} parts but updated ${movedParts?.length ?? 0}.`,
          )
          return
        }

        const queuedIdSet = new Set(queuedIds)

        setParts((prev) =>
          prev.map((part) =>
            queuedIdSet.has(part.id)
              ? { ...part, bin: locationValue }
              : part,
          ),
        )

        const movedCount = queuedParts.length

        moveQueuedPartsRef.current = []
        moveDestinationBinRef.current = null
        setMoveDestinationBin(null)
        setScannedBin(null)
        setSearchTerm('')
        setInventoryFilter('all')
        setScannerValue('')

        setSuccessMessage(
          `${movedCount} part${movedCount === 1 ? '' : 's'} assigned to ${locationValue}.`,
        )
        return
      }

      // LOCATION FIRST -> PART(S)
      moveDestinationBinRef.current = locationValue
      setMoveDestinationBin(locationValue)
      setScannedBin(null)
      setSearchTerm('')
      setInventoryFilter('all')
      setScannerValue('')
      setSuccessMessage(
        `Destination ${locationValue} selected. Scan parts to assign them.`,
      )
      return
    }

    // LOCATE MODE -> show inventory in this location
    setScannedBin(locationValue)
    setMoveDestinationBin(null)
    moveDestinationBinRef.current = null
    moveQueuedPartsRef.current = []
    setSearchTerm('')
    setInventoryFilter('all')
    setActiveView('inventory')
    setScannerValue('')
    return
  }

  // ----------------------------------------------------------
  // PART SCAN
  // ----------------------------------------------------------

  const normalizedValue = normalizeSearchToken(scannedValue)

  const exactMatches = parts.filter((part) =>
    [
      part.sku,
      part.ebayItemId,
      part.partNumber,
      part.interchangeNumber,
    ].some(
      (value) =>
        value &&
        normalizeSearchToken(value) === normalizedValue,
    ),
  )

  if (exactMatches.length === 0) {
    setErrorMessage(`No inventory match found for ${scannedValue}.`)
    return
  }

  if (scannerMode === 'move') {
    if (exactMatches.length !== 1) {
      setSearchTerm(scannedValue)
      setScannedBin(null)
      setActiveView('inventory')
      setErrorMessage(
        `${exactMatches.length} parts match ${scannedValue}. Scan the unique part SKU instead.`,
      )
      return
    }

    const partToMove = exactMatches[0]

    const destinationLocation =
      moveDestinationBinRef.current || moveDestinationBin

    // --------------------------------------------------------
    // LOCATION FIRST -> immediately assign each scanned part
    // --------------------------------------------------------

    if (destinationLocation) {
      if (!supabase) {
        setErrorMessage('Database connection is unavailable.')
        return
      }

      const { data: movedPart, error } = await supabase
        .from('parts')
        .update({
          bin: destinationLocation,
        })
        .eq('id', partToMove.id)
        .select('id, sku, bin')
        .maybeSingle()

      if (error) {
        setErrorMessage(
          `Unable to move ${partToMove.sku || partToMove.partName}: ${error.message}`,
        )
        return
      }

      if (!movedPart) {
        setErrorMessage(
          `Part matched in the OS, but no database record was updated for ${partToMove.sku || scannedValue}.`,
        )
        return
      }

      setParts((prev) =>
        prev.map((part) =>
          part.id === partToMove.id
            ? { ...part, bin: destinationLocation }
            : part,
        ),
      )

      setScannerValue('')
      setSuccessMessage(
        `${partToMove.sku || partToMove.partName} assigned to ${destinationLocation}.`,
      )
      return
    }

    // --------------------------------------------------------
    // PART FIRST -> queue until a location is scanned
    // --------------------------------------------------------

    const alreadyQueued = moveQueuedPartsRef.current.some(
      (part) => part.id === partToMove.id,
    )

    if (alreadyQueued) {
      setScannerValue('')
      setErrorMessage(
        `${partToMove.sku || partToMove.partName} is already queued.`,
      )
      return
    }

    moveQueuedPartsRef.current = [
      ...moveQueuedPartsRef.current,
      partToMove,
    ]

    const queuedCount = moveQueuedPartsRef.current.length

    setScannerValue('')
    setSuccessMessage(
      `${queuedCount} part${queuedCount === 1 ? '' : 's'} queued. Scan more parts or scan the warehouse location.`,
    )
    return
  }

  // ----------------------------------------------------------
  // NORMAL LOCATE MODE
  // ----------------------------------------------------------

  setScannedBin(null)
  setMoveDestinationBin(null)
  moveDestinationBinRef.current = null
  moveQueuedPartsRef.current = []
  setInventoryFilter('all')
  setActiveView('inventory')
  setScannerValue('')

  if (exactMatches.length === 1) {
    setSearchTerm('')
    await handleOpenPartDetails(exactMatches[0])
    return
  }

  setSearchTerm(scannedValue)
  setSuccessMessage(
    `${exactMatches.length} exact inventory matches found for ${scannedValue}.`,
  )
}


// TEXAS OEM GLOBAL BARCODE SCANNER
useEffect(() => {
  let scanBuffer = ''
  let lastKeyTime = 0

  const resetScannerBuffer = () => {
    scanBuffer = ''
    lastKeyTime = 0
  }

  const handleGlobalScannerKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return
    }

    const target = event.target as HTMLElement | null
    const isEditable =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable

    /*
     * Don't interfere while Ian is manually typing into a form.
     * The inventory search field still works normally when focused.
     */
    if (isEditable) {
      resetScannerBuffer()
      return
    }

    const now = performance.now()

    if (event.key === 'Enter') {
      const completedScan = scanBuffer.trim()
      const elapsedSinceLastKey = now - lastKeyTime

      if (
        completedScan.length >= 6 &&
        elapsedSinceLastKey < 150
      ) {
        event.preventDefault()
        event.stopPropagation()

        resetScannerBuffer()
        void handleScannerLookup(completedScan)
        return
      }

      resetScannerBuffer()
      return
    }

    if (event.key.length !== 1) {
      return
    }

    /*
     * Human typing has relatively large delays between keys.
     * The DS3678 sends the whole barcode extremely quickly.
     */
    if (lastKeyTime && now - lastKeyTime > 100) {
      scanBuffer = ''
    }

    scanBuffer += event.key
    lastKeyTime = now
  }

  window.addEventListener(
    'keydown',
    handleGlobalScannerKeyDown,
    true,
  )

  return () => {
    window.removeEventListener(
      'keydown',
      handleGlobalScannerKeyDown,
      true,
    )
  }
}, [handleScannerLookup])
// END TEXAS OEM GLOBAL BARCODE SCANNER

const handlePhotoSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) {
      return
    }

    let targetPartId = editingPartId ?? selectedPart?.id

    if (!targetPartId) {
      setPhotoDebugMessage('Saving part automatically before photo upload…')

      const savedPart = await savePartRecord()

      if (!savedPart?.id) {
        setErrorMessage('Unable to save the part before uploading photos.')
        setPhotoDebugMessage('Automatic part save failed. Photo upload stopped.')
        event.target.value = ''
        return
      }

      targetPartId = savedPart.id

      setEditingPartId(savedPart.id)
      setSelectedPart(savedPart)
      setPartModalMode('edit')
      setSuccessMessage(`Saved ${savedPart.sku}. Uploading photos…`)
    }

    const pendingPhotos = [] as File[]
    for (const file of files) {
      if (import.meta.env.DEV) {
        console.log('[part-photos] selected', file.name, file.type, file.size)
      }

      const validationError = getPhotoValidationError(file, partPhotos.length, pendingPhotos.length)
      if (validationError) {
        setErrorMessage(validationError)
        setPhotoDebugMessage(validationError)
        return
      }
      pendingPhotos.push(file)
    }

    setUploadingPhotos(true)
    setUploadProgress('Uploading…')
    setPhotoDebugMessage('Starting upload…')
    setErrorMessage(null)

    try {
      const compressedFiles: File[] = []
      for (const file of pendingPhotos) {
        const compressed = await compressImage(
          file,
          1600,
          enhancePhotos,
        )
        compressedFiles.push(compressed)
      }

      const savedPartId = targetPartId
      if (!savedPartId) {
        throw new Error('The part record is still missing an ID.')
      }

      const uploadResults = [] as PartPhoto[]
      for (const [index, file] of compressedFiles.entries()) {
        const photoSourceId = currentVehicle?.id ?? selectedPart?.vehicleId ?? 'standalone'
          const storagePath = buildPartPhotoStoragePath(photoSourceId, savedPartId, file.name)
        if (import.meta.env.DEV) {
          console.log('[part-photos] storage path', storagePath)
        }

        const { error: uploadError } = await supabase.storage
          .from('part-photos')
          .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type || 'image/jpeg',
          })
        if (import.meta.env.DEV) {
          console.log('[part-photos] upload result', storagePath, uploadError)
        }

        if (uploadError) {
          throw new Error(`Storage upload failed for ${file.name}: ${uploadError.message}`)
        }

        const publicUrl = supabase.storage.from('part-photos').getPublicUrl(storagePath).data.publicUrl
        const { data: photoRow, error: rowError } = await supabase.from('part_photos').insert({ part_id: savedPartId, storage_path: storagePath, public_url: publicUrl, is_primary: partPhotos.length + uploadResults.length === 0, sort_order: partPhotos.length + index }).select().single()
        if (import.meta.env.DEV) {
          console.log('[part-photos] insert result', photoRow, rowError)
        }

        if (rowError) {
          const partialMessage = `Storage upload succeeded for ${file.name}, but part_photos insert failed: ${rowError.message}`
          setPhotoDebugMessage(partialMessage)
          setUploadProgress(partialMessage)
          setSuccessMessage('Partial success: the photo was stored but the record could not be saved.')
          continue
        }

        const nextPhoto = {
          id: String(photoRow.id),
          partId: String(photoRow.part_id),
          storagePath: String(photoRow.storage_path),
          publicUrl: typeof photoRow.public_url === 'string' ? photoRow.public_url : null,
          isPrimary: Boolean(photoRow.is_primary),
          sortOrder: Number(photoRow.sort_order ?? 0),
          createdAt: typeof photoRow.created_at === 'string' ? photoRow.created_at : null,
        }

        uploadResults.push(nextPhoto)
        setPartPhotos((prev) => [...prev, nextPhoto])
        setPartFormData((prev) => ({ ...prev, photoCount: String(Math.max(0, Number(prev.photoCount) || 0) + 1) }))
        setParts((prev) => prev.map((part) => part.id === savedPartId ? { ...part, photoCount: (part.photoCount || 0) + 1 } : part))
      }

      setPhotoDebugMessage(uploadResults.length ? `Uploaded ${uploadResults.length} photo${uploadResults.length === 1 ? '' : 's'}.` : 'Upload completed with no new thumbnails.')
      setUploadProgress(uploadResults.length ? `${uploadResults.length} photo${uploadResults.length === 1 ? '' : 's'} uploaded.` : 'Upload finished.')

      if (uploadResults.length > 0) {
        const freshPhotos = [...partPhotos, ...uploadResults]

        const listingPart =
          selectedPart?.id === savedPartId
            ? {
                ...selectedPart,
                photoCount: freshPhotos.length,
              }
            : parts.find((part) => part.id === savedPartId)

        if (listingPart) {
          setSuccessMessage('Photos uploaded. Building eBay listing…')
          await generateListingDraft(listingPart, freshPhotos)
        } else {
          setSuccessMessage('Photo upload completed.')
        }
      } else {
        setSuccessMessage('Partial success: image stored but record creation failed.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Photo upload failed.'
      setErrorMessage(message)
      setPhotoDebugMessage(message)
      setUploadProgress(message)
    } finally {
      setUploadingPhotos(false)
      if (event.target) {
        event.target.value = ''
      }
    }
  }

  const handleSetPrimaryPhoto = async (photo: PartPhoto) => {
    if (!selectedPart && !editingPartId) {
      return
    }

    const targetPartId = editingPartId ?? selectedPart?.id
    if (!targetPartId || !supabase) {
      return
    }

    const { error } = await supabase.from('part_photos').update({ is_primary: false }).eq('part_id', targetPartId)
    if (error) {
      setErrorMessage(`Unable to update primary photo: ${error.message}`)
      return
    }

    const { error: primaryError } = await supabase.from('part_photos').update({ is_primary: true }).eq('id', photo.id)
    if (primaryError) {
      setErrorMessage(`Unable to mark photo as primary: ${primaryError.message}`)
      return
    }

    setPartPhotos((prev) => prev.map((item) => ({ ...item, isPrimary: item.id === photo.id })))
    setSuccessMessage('Primary photo updated.')
  }

  const handleDeletePhoto = async (photo: PartPhoto) => {
    if (!supabase) {
      return
    }

    const { error } = await supabase.from('part_photos').delete().eq('id', photo.id)
    if (error) {
      setErrorMessage(`Unable to delete photo: ${error.message}`)
      return
    }

    void supabase.storage.from('part-photos').remove([photo.storagePath])
    setPartPhotos((prev) => prev.filter((item) => item.id !== photo.id))
    setPartFormData((prev) => ({ ...prev, photoCount: String(Math.max(0, Number(prev.photoCount) - 1)) }))
    setParts((prev) => prev.map((part) => part.id === (selectedPart?.id ?? editingPartId ?? part.id) ? { ...part, photoCount: Math.max(0, (part.photoCount || 0) - 1) } : part))
    setSuccessMessage('Photo removed.')
  }

  const handleDeletePart = async () => {
    if (!selectedPart || !supabase) {
      return
    }

    const { error } = await supabase.from('parts').delete().eq('id', selectedPart.id)

    if (error) {
      setErrorMessage(`Unable to delete part: ${error.message}`)
      return
    }

    setParts((prev) => prev.filter((part) => part.id !== selectedPart.id))
    setSuccessMessage(`Deleted ${selectedPart.sku}.`)
    setShowPartDetailsModal(false)
    setSelectedPart(null)
  }

  const savePartRecord = async (): Promise<Part | null> => {
    try {
      if (!supabase) {
        throw new Error('Supabase is not configured.')
      }

      const sourceVehicle = isStandalonePart ? null : currentVehicle

      if (!sourceVehicle && !isStandalonePart) {
        throw new Error('Select a donor vehicle or choose Standalone Part.')
      }

      const partName = partFormData.partName.trim()
      if (!partName) {
        throw new Error('Part Name is required.')
      }

      const partNumber = partFormData.partNumber.trim()
      const category = partFormData.category.trim()
      const condition = partFormData.condition.trim() || 'Untested'
      const binLocation = partFormData.bin.trim()

      // Resolve/create part master using the same proven pattern as Rapid Intake.
      let partMasterId: string | null = null

      /*
       * EDIT MODE:
       * If this part is already linked to a part_master row,
       * update that exact master row when the owner changes
       * the OEM / manufacturer part number.
       */
      if (partModalMode === 'edit' && editingPartId) {
        const { data: currentPartRow, error: currentPartError } =
          await supabase
            .from('parts')
            .select('part_master_id')
            .eq('id', editingPartId)
            .maybeSingle()

        if (currentPartError) {
          throw currentPartError
        }

        const currentMasterId =
          currentPartRow?.part_master_id
            ? String(currentPartRow.part_master_id)
            : ''

        if (currentMasterId) {
          const { data: currentMaster, error: currentMasterError } =
            await supabase
              .from('part_master')
              .select('id, part_name, part_code')
              .eq('id', currentMasterId)
              .maybeSingle()

          if (currentMasterError) {
            throw currentMasterError
          }

          if (currentMaster?.id) {
            const currentMasterId =
              String(currentMaster.id)

            const existingMasterCode =
              String(currentMaster.part_code ?? '').trim()

            if (existingMasterCode === partNumber) {
              partMasterId = currentMasterId
            } else {
              /*
               * SAFETY:
               * Before changing an OEM number, determine whether
               * this master row is shared by other inventory parts.
               *
               * If shared, DO NOT mutate the shared master.
               * Leave partMasterId null so the normal lookup/create
               * logic below can attach this one part to its own
               * correct master record.
               */
              const {
                count: linkedPartCount,
                error: linkedCountError,
              } = await supabase
                .from('parts')
                .select('id', {
                  count: 'exact',
                  head: true,
                })
                .eq(
                  'part_master_id',
                  currentMasterId,
                )

              if (linkedCountError) {
                throw linkedCountError
              }

              if (
                Number(
                  linkedPartCount ?? 0
                ) <= 1
              ) {
                /*
                 * Before changing this master to a new OEM number,
                 * check whether that OEM number already exists.
                 *
                 * Multiple PHYSICAL parts may share one OEM master.
                 */
                if (partNumber) {
                  const {
                    data: targetMaster,
                    error: targetMasterError,
                  } = await supabase
                    .from('part_master')
                    .select('id, part_name, part_code')
                    .eq('part_code', partNumber)
                    .maybeSingle()

                  if (targetMasterError) {
                    throw targetMasterError
                  }

                  if (
                    targetMaster?.id &&
                    String(targetMaster.id) !==
                      currentMasterId
                  ) {
                    /*
                     * OEM already exists.
                     * Reuse it instead of violating the UNIQUE
                     * part_code constraint.
                     */
                    partMasterId =
                      String(targetMaster.id)
                  } else {
                    partMasterId =
                      currentMasterId

                    const {
                      error:
                        updateCurrentMasterError,
                    } = await supabase
                      .from('part_master')
                      .update({
                        part_name: partName,
                        part_code: partNumber,
                      })
                      .eq(
                        'id',
                        partMasterId,
                      )

                    if (
                      updateCurrentMasterError
                    ) {
                      throw updateCurrentMasterError
                    }
                  }
                } else {
                  /*
                   * No known OEM number.
                   * Keep this physical item isolated with a
                   * unique internal placeholder.
                   */
                  partMasterId =
                    currentMasterId

                  const {
                    error:
                      updateCurrentMasterError,
                  } = await supabase
                    .from('part_master')
                    .update({
                      part_name: partName,
                      part_code:
                        `UNIDENTIFIED-${editingPartId}`,
                    })
                    .eq(
                      'id',
                      partMasterId,
                    )

                  if (
                    updateCurrentMasterError
                  ) {
                    throw updateCurrentMasterError
                  }
                }
              } else {
                /*
                 * Shared master:
                 * intentionally leave partMasterId null.
                 *
                 * The exact-OEM lookup / create logic below
                 * will safely give THIS part the correct master
                 * without altering its siblings.
                 */
                partMasterId = null
              }
            }
          }
        }
      }

      if (!partMasterId && partNumber) {
        // part_code is UNIQUE in part_master.
        // Resolve by the unique code itself instead of requiring the name to match.
        const { data: exactMaster, error: exactMasterError } = await supabase
          .from('part_master')
          .select('id, part_name, part_code')
          .eq('part_code', partNumber)
          .maybeSingle()

        if (exactMasterError) throw exactMasterError

        if (exactMaster?.id) {
          partMasterId = String(exactMaster.id)
        }
      }

      if (!partMasterId) {
        const { data: nameMaster, error: nameMasterError } = await supabase
          .from('part_master')
          .select('id, part_name, part_code')
          .eq('part_name', partName)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (nameMasterError) throw nameMasterError

        if (nameMaster?.id) {
          const existingMasterCode =
            String(nameMaster.part_code ?? '').trim()

          const isPlaceholderCode =
            /^EBAY-\d+$/i.test(existingMasterCode) ||
            /^UNIDENTIFIED-/i.test(existingMasterCode)

          /*
           * CRITICAL:
           * Never reuse a same-name part_master row when it
           * already belongs to a DIFFERENT real OEM number.
           *
           * Example:
           *   Body Control Module / 111
           *   Body Control Module / 222
           *   Body Control Module / 333
           *
           * Those MUST be three independent master records.
           */
          if (
            partNumber &&
            existingMasterCode === partNumber
          ) {
            partMasterId =
              String(nameMaster.id)
          } else if (
            partNumber &&
            (
              !existingMasterCode ||
              isPlaceholderCode
            )
          ) {
            partMasterId =
              String(nameMaster.id)

            const { error: updateMasterError } =
              await supabase
                .from('part_master')
                .update({
                  part_name: partName,
                  part_code: partNumber,
                })
                .eq('id', partMasterId)

            if (updateMasterError) {
              throw updateMasterError
            }
          } else if (
            !partNumber &&
            !existingMasterCode
          ) {
            /*
             * Only reuse a same-name master with no OEM
             * number when the new part also has no OEM number.
             */
            partMasterId =
              String(nameMaster.id)
          }

          /*
           * Otherwise leave partMasterId NULL.
           *
           * The create-master block below will create a
           * completely new master record for this OEM number.
           */
        }
      }

      if (!partMasterId) {
        const { data: createdMaster, error: createMasterError } = await supabase
          .from('part_master')
          .insert({
            part_name: partName,
            part_code: partNumber || null,
          })
          .select('id')
          .single()

        if (createMasterError) throw createMasterError
        if (!createdMaster?.id) throw new Error('Part master ID was not returned.')

        partMasterId = String(createdMaster.id)
      }

      const existingSku =
    partModalMode === 'edit' && editingPartId
      ? parts.find((part) => part.id === editingPartId)?.sku ?? ''
      : ''

  const skuPartCode =
    partFormData.skuCode.trim().toUpperCase() ||
    getPartCodeFromPartMaster(partName, category, partMasters) ||
    getFallbackPartCode(partName, category) ||
    'PRT'

  const skuStockNumber =
    sourceVehicle?.stockNumber ||
    sourceVehicle?.vin ||
    'STANDALONE'

  const sku =
    existingSku ||
    await getNextRapidIntakeSku(skuStockNumber, skuPartCode)

  // IMPORTANT:
      // Use only the verified inventory columns here.
      const payload = {
        vehicle_id: sourceVehicle?.id ?? null,
        part_master_id: partMasterId,
        sku,
        sku_code:
          partFormData.skuCode.trim().toUpperCase() || null,
        condition,
        shelf_location: binLocation || null,
        list_price: Number(partFormData.listPrice) || 0,
        notes:
          partFormData.notes.trim() || null,
        cleaned: false,
        photographed: false,
        listed: false,
        sold: false,
      }

      const result =
        partModalMode === 'edit' && editingPartId
          ? await supabase
              .from('parts')
              .update(payload)
              .eq('id', editingPartId)
              .select()
              .single()
          : await supabase
              .from('parts')
              .insert(payload)
              .select()
              .single()

      if (result.error) {
        throw result.error
      }

      if (!result.data?.id) {
        throw new Error('Supabase saved no usable part ID.')
      }

      const savedPartId = String(result.data.id)

      const mappedPart: Part = {
        ...mapPartRecordToPart(result.data as Record<string, unknown>),
        id: savedPartId,
        vehicleId: sourceVehicle?.id ?? null,
        vehicleYear: sourceVehicle?.year ?? '',
        vehicleMake: sourceVehicle?.make ?? '',
        vehicleModel: sourceVehicle?.model ?? '',
        vehicleVin: sourceVehicle?.vin ?? '',
        sku,
        partName,
        partNumber,
        interchangeNumber: partFormData.interchangeNumber.trim(),
        brand:
          partFormData.brand.trim() ||
          getOemBrandFromVehicleMake(
            sourceVehicle?.make,
          ),
        category,
        condition,
        engine: partFormData.engine.trim(),
        transmission: partFormData.transmission.trim(),
        color: partFormData.color.trim(),
        location: binLocation,
        shelf: binLocation,
        bin: binLocation,
        quantity: Number(partFormData.quantity) || 1,
        cost: Number(partFormData.cost) || 0,
        listPrice: Number(partFormData.listPrice) || 0,
        soldPrice: Number(partFormData.soldPrice) || 0,
        weight: Number(partFormData.weight) || 0,
        ebayItemId: partFormData.ebayItemId.trim(),
        ebayStatus: partFormData.ebayStatus.trim() || 'Not Listed',
        dateListed: partFormData.dateListed.trim(),
        dateSold: partFormData.dateSold.trim(),
        listed: false,
        sold: false,
        cleaned: false,
        photographed: false,
        status: 'Not Listed',
        notes: partFormData.notes.trim(),
        photoCount: 0,
        skuCode: partFormData.skuCode.trim().toUpperCase(),
        skuPreview: sku,
      }

      setParts((prev) => {
        const nextParts =
          partModalMode === 'edit' && editingPartId
            ? prev.map((part) => (part.id === editingPartId ? mappedPart : part))
            : [mappedPart, ...prev]

        persistPartsToStorage(nextParts)
        return nextParts
      })

      setEditingPartId(savedPartId)
      setPartModalMode('edit')
      setSelectedPart(mappedPart)
      setSuccessMessage(`Saved ${sku}. Photos can now be added.`)

      await loadPartsInventory()
      await loadPartPhotos(savedPartId)

      return mappedPart
    } catch (error: unknown) {
      console.error('[ADD PART SAVE ERROR]', error)

      const err = error as {
        message?: string
        details?: string
        hint?: string
        code?: string
      }

      const message = [
        err?.message,
        err?.details,
        err?.hint,
        err?.code ? `Code: ${err.code}` : '',
      ]
        .filter(Boolean)
        .join(' | ')

      setErrorMessage(
        `Unable to save part: ${message || String(error)}`
      )

      return null
    }
  }

  const handleSavePart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setIsSavingPart(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await savePartRecord()
    } finally {
      setIsSavingPart(false)
    }
  }

  const ensureCurrentPartSaved = async (): Promise<Part | null> => {
    // Always persist the CURRENT form values.
    // This keeps price, condition, BIN, notes, etc. synchronized
    // before any eBay action.
    return await savePartRecord()
  }

  const handlePrintCurrentPartTag = async () => {
    setIsSavingPart(true)
    setErrorMessage(null)

    try {
      const part = await ensureCurrentPartSaved()

      if (!part?.id) {
        return
      }

      openTagPreview(part, 'compact', false)
    } finally {
      setIsSavingPart(false)
    }
  }

  const handleBuildCurrentListing = async () => {
    setIsSavingPart(true)
    setErrorMessage(null)

    try {
      const part = await ensureCurrentPartSaved()

      if (!part?.id) {
        return
      }

      await generateListingDraft(part)
    } finally {
      setIsSavingPart(false)
    }
  }

  const handlePreviewCurrentListing = async () => {
    setErrorMessage(null)

    const part = await ensureCurrentPartSaved()

    if (!part?.id) {
      return
    }

    let activeDraft =
      listingDraft?.partId === part.id
        ? listingDraft
        : null

    if (!activeDraft) {
      activeDraft = await generateListingDraft(
        part,
        partPhotos,
      )
    }

    if (!activeDraft) {
      setErrorMessage(
        'Unable to generate listing preview.',
      )
      return
    }

    previewListingTemplateV3(
      part,
      activeDraft,
    )
  }

  const handleOpenCurrentPartMarketData = async () => {
    setIsSavingPart(true)
    setErrorMessage(null)

    try {
      /*
       * Save the CURRENT Edit Part values first so market
       * research always uses the latest OEM number / part data.
       */
      const part =
        await ensureCurrentPartSaved()

      if (!part?.id) {
        throw new Error(
          'Unable to save the part before checking market data.',
        )
      }

      /*
       * Leave Edit Part and open this exact inventory item
       * in the existing Part Details / Market Intelligence screen.
       */
      setSelectedPart(part)
      setShowPartModal(false)
      setShowPartDetailsModal(true)

      /*
       * Immediately run the existing sold-market lookup.
       */
      await refreshMarketData(part)
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to open market data.',
      )
    } finally {
      setIsSavingPart(false)
    }
  }

  const handleCreateCurrentEbayDraft = async () => {
    setIsSavingPart(true)
    setErrorMessage(null)

    try {
      const part = await ensureCurrentPartSaved()

      if (!part?.id) {
        throw new Error('Unable to save the part before creating the eBay draft.')
      }

      if (partPhotos.length === 0) {
        setErrorMessage('Add at least one photo before creating the eBay listing.')
        return
      }

      const freshDraft =
        listingDraft?.partId === part.id
          ? listingDraft
          : await generateListingDraft(part, partPhotos)

      if (!freshDraft) {
        setErrorMessage('Unable to generate the eBay listing.')
        return
      }

      await createEbayDraft(part, freshDraft)
    } finally {
      setIsSavingPart(false)
    }
  }

  const handlePublishCurrentEbayListing = async () => {
    setIsSavingPart(true)
    setErrorMessage(null)

    try {
      const part = await ensureCurrentPartSaved()

      if (!part?.id) {
        throw new Error('Unable to save the part before publishing to eBay.')
      }

      if (partPhotos.length === 0) {
        setErrorMessage('Add at least one photo before publishing to eBay.')
        return
      }

      const freshDraft =
        listingDraft?.partId === part.id
          ? listingDraft
          : await generateListingDraft(part, partPhotos)

      if (!freshDraft) {
        setErrorMessage('Unable to generate the eBay listing.')
        return
      }

      // Make sure the Inventory Item + Offer exists first.
      await createEbayDraft(part, freshDraft)

      // Then publish the exact saved offer LIVE on eBay.
      await publishEbayOffer(part)
    } finally {
      setIsSavingPart(false)
    }
  }

  const handleSaveRapidPart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSavingPart(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!supabase) {
      setErrorMessage('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      setIsSavingPart(false)
      return
    }

    if (!currentVehicle) {
      setErrorMessage('Add a vehicle before saving parts inventory.')
      setIsSavingPart(false)
      return
    }

    const partName = partFormData.partName.trim()
    if (!partName) {
      setErrorMessage('Part Name is required.')
      setIsSavingPart(false)
      return
    }

    const binLocation = partFormData.bin.trim()
    const notes = partFormData.notes.trim()
    const condition = partFormData.condition.trim() || 'Untested'
    const partNumber = partFormData.partNumber.trim()
    const interchangeNumber = partFormData.interchangeNumber.trim()
    const skuPartCode = partFormData.skuCode.trim().toUpperCase() || getPartCodeFromPartMaster(partName, '', partMasters) || getFallbackPartCode(partName, '') || 'PRT'
    const stockNumber = currentVehicle.stockNumber || currentVehicle.vin || 'TX'

    // Step 1: resolve/create part_master using only verified columns.
    const partCode = partNumber || null
    let partMasterId: string | null = null

    if (partCode) {
      /*
       * OEM / manufacturer part number is the unique identity
       * of the part master.
       *
       * Multiple physical inventory parts are allowed to share
       * the same OEM number. They get separate parts rows / SKUs
       * but reuse the same part_master record.
       *
       * Do NOT require the temporary Part Name to match.
       */
      const {
        data: existingMasterByCode,
        error: masterLookupError,
      } = await supabase
        .from('part_master')
        .select('id, part_name, part_code')
        .eq('part_code', partCode)
        .maybeSingle()

      if (masterLookupError) {
        setErrorMessage(
          `Unable to save part: ${masterLookupError.message}`,
        )
        setIsSavingPart(false)
        return
      }

      if (existingMasterByCode?.id) {
        partMasterId =
          String(existingMasterByCode.id)
      }
    }

    /*
     * CRITICAL RAPID INTAKE RULE:
     *
     * If an OEM / manufacturer number was entered,
     * NEVER fall back to a same-name master carrying
     * a different OEM number.
     *
     * Example:
     *   TEST MODULE / 111
     *   TEST MODULE / 222
     *   TEST MODULE / 333
     *
     * These must remain independent master records.
     *
     * Name-only reuse is allowed ONLY when the new
     * part has no OEM number, and only with another
     * same-name master that also has no OEM number.
     */
    if (!partMasterId && !partCode) {
      const { data: sameNameMasters, error: masterNameLookupError } = await supabase
        .from('part_master')
        .select('id, part_name, part_code')
        .eq('part_name', partName)
        .order('created_at', { ascending: false })
        .limit(50)

      if (masterNameLookupError) {
        setErrorMessage(`Unable to save part: ${masterNameLookupError.message}`)
        setIsSavingPart(false)
        return
      }

      const blankCodeMaster =
        (sameNameMasters ?? []).find(
          (row) =>
            !String(
              row.part_code ?? ''
            ).trim()
        )

      if (blankCodeMaster?.id) {
        partMasterId =
          String(blankCodeMaster.id)
      }
    }

    if (!partMasterId) {
      const partMasterPayload = {
        part_name: partName,
        part_code: partCode,
      }

      const { data: createdMaster, error: masterCreateError } = await supabase
        .from('part_master')
        .insert(partMasterPayload)
        .select('id, part_name, part_code')
        .single()

      if (masterCreateError || !createdMaster?.id) {
        setErrorMessage(`Unable to save part: ${masterCreateError?.message ?? 'Part master creation failed.'}`)
        setIsSavingPart(false)
        return
      }

      partMasterId = String(createdMaster.id)
    }

    // Step 2: create inventory part using only verified parts columns.
    const insertRapidPart = async () => {
      const sku = await getNextRapidIntakeSku(stockNumber, skuPartCode)
      const payload = {
        vehicle_id: currentVehicle.id,
        part_master_id: partMasterId,
        sku,
        condition: condition || null,
        bin: binLocation || null,
        cleaned: false,
        photographed: false,
        listed: false,
        sold: false,
      }

      const result = await supabase.from('parts').insert(payload).select().single()
      return { sku, ...result }
    }

    let insertResult = await insertRapidPart()

    if (insertResult.error && isDuplicateSkuInsertError(insertResult.error)) {
      insertResult = await insertRapidPart()
    }

    const { data, error, sku } = insertResult

    if (error) {
      setErrorMessage(`Unable to save part: ${error.message}`)
      setIsSavingPart(false)
      return
    }

    const mappedPart = {
      ...mapPartRecordToPart(data as Record<string, unknown>),
      vehicleId: currentVehicle.id,
      vehicleYear: currentVehicle.year,
      vehicleMake: currentVehicle.make,
      vehicleModel: currentVehicle.model,
      vehicleVin: currentVehicle.vin,
      sku,
      partName,
      partNumber,
      interchangeNumber,
      brand:
        getOemBrandFromVehicleMake(
          currentVehicle.make,
        ),
      category: '',
      condition,
      engine: '',
      transmission: '',
      color: '',
      location: binLocation,
      shelf: '',
      bin: binLocation,
      quantity: 1,
      cost: 0,
      listPrice: 0,
      soldPrice: 0,
      weight: 0,
      ebayItemId: '',
      ebayStatus: 'Not Listed',
      dateListed: '',
      dateSold: '',
      listed: false,
      sold: false,
      cleaned: false,
      photographed: false,
      status: 'Not Listed',
      notes,
      photoCount: 0,
      skuCode: '',
      skuPreview: sku,
    }

    const savedPartId = String(mappedPart.id || '').trim()
    if (!savedPartId) {
      setErrorMessage('Unable to continue: saved part ID is missing in Supabase response.')
      setIsSavingPart(false)
      return
    }

    setParts((prev) => {
      const nextParts = [mappedPart, ...prev.filter((part) => part.id !== mappedPart.id)]
      persistPartsToStorage(nextParts)
      return nextParts
    })

    setEditingPartId(savedPartId)
    setPartModalMode('edit')
    setSelectedPart(mappedPart)

    // Rapid Intake is only the intake doorway.
    // Once the inventory record exists, move immediately into
    // the full production workbench for photos, eBay, tag + publish.
    setRapidIntakeSavedPart(null)
    setRapidIntakeMode('form')
    setShowRapidIntakeModal(false)
    setShowPartModal(true)

    setSuccessMessage(`Saved ${sku}. Starting photo session.`)
    setIsSavingPart(false)

    await loadPartPhotos(savedPartId)
    await loadPartsInventory()

    window.setTimeout(() => {
      cameraInputRef.current?.click()
    }, 500)
  }

  const handleCancel = () => {
    setShowForm(false)
    setFormData(initialFormState)
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const handleSaveVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!supabase) {
      setErrorMessage('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      setIsSaving(false)
      return
    }

    const toNumberOrNull = (v: string) => {
      const t = String(v).trim()
      if (t === '') return null
      const n = Number(t)
      return Number.isFinite(n) ? n : null
    }

    const purchase_price = toNumberOrNull(formData.purchasePrice)
    const yearValue = toNumberOrNull(formData.year)

    const insertPayload = {
      company_id: COMPANY_ID,
      stock_number: generateStockNumber(),
      vin: formData.vin.trim(),
      year: yearValue,
      make: formData.make.trim(),
      model: formData.model.trim(),
      trim: formData.trim.trim(),
      purchase_price: purchase_price,
      purchase_date: formData.purchaseDate || null,
      status: 'Purchased',
      workflow_stage: 'Purchased',
      stage: 'Purchased',
      progress: 0,
    }

    const { data, error } = await supabase.from('vehicles').insert(insertPayload).select().single()

    if (error) {
      setErrorMessage(error.message)
      setIsSaving(false)
      return
    }

    if (data?.id) {
      const runsAndDrives =
        formData.runsAndDrives === 'yes'
          ? true
          : formData.runsAndDrives === 'no'
            ? false
            : null

      const { error: damageProfileError } = await supabase
        .from('vehicle_damage_profiles')
        .upsert(
          {
            vehicle_id: data.id,
            damage_zones: formData.damageZones,
            severity: formData.damageSeverity,
            runs_and_drives: runsAndDrives,
            drivetrain_tested: formData.drivetrainTested,
            owner_notes: formData.notes.trim() || null,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'vehicle_id',
          },
        )

      if (damageProfileError) {
        setErrorMessage(
          `Vehicle saved, but damage profile failed: ${damageProfileError.message}`,
        )
      }
    }

    if (data) {
      const inserted = data as VehicleRecord
      const vehicleId = inserted.id

      const jobsToCreate = [
        { vehicle_id: vehicleId, job_name: 'Power Wash', job_type: 'Preparation', estimated_value: 0, status: 'Pending' },
        { vehicle_id: vehicleId, job_name: 'Test Drivetrain / Electrical', job_type: 'Testing', estimated_value: 0, status: 'Pending' },
        { vehicle_id: vehicleId, job_name: 'Pull Interior & Body Parts', job_type: 'Body', estimated_value: 0, status: 'Pending' },
        { vehicle_id: vehicleId, job_name: 'Pull Modules / Electronics', job_type: 'Electronics', estimated_value: 500, status: 'Pending' },
        { vehicle_id: vehicleId, job_name: 'Pull Catalytic Converters', job_type: 'Catalytic', estimated_value: 700, status: 'Pending' },
        { vehicle_id: vehicleId, job_name: 'Pull Engine', job_type: 'Drivetrain', estimated_value: 2500, status: 'Pending' },
        { vehicle_id: vehicleId, job_name: 'Pull Transmission / Drivetrain', job_type: 'Drivetrain', estimated_value: 900, status: 'Pending' },
        { vehicle_id: vehicleId, job_name: 'Pull Suspension / Remaining Valuable Parts', job_type: 'Suspension', estimated_value: 0, status: 'Pending' },
        { vehicle_id: vehicleId, job_name: 'Pull Chassis Harness / Final Scrap Recovery', job_type: 'Copper', estimated_value: 150, status: 'Pending' },
        { vehicle_id: vehicleId, job_name: 'Scrap Shell', job_type: 'Scrap', estimated_value: 250, status: 'Pending' },
        { vehicle_id: vehicleId, job_name: 'Clean Parts', job_type: 'Processing', estimated_value: 0, status: 'Pending' },
        { vehicle_id: vehicleId, job_name: 'Tag / Generate SKUs + Photograph + Shelf Parts', job_type: 'Inventory', estimated_value: 0, status: 'Pending' },
        { vehicle_id: vehicleId, job_name: 'Create eBay Listings', job_type: 'Sales', estimated_value: 0, status: 'Pending' },
      ]

      const { error: jobsError } = await supabase.from('jobs').insert(jobsToCreate).select()

      if (jobsError) {
        setErrorMessage(`Job creation failed: ${jobsError.message}`)
        setIsSaving(false)
        setShowForm(false)
        setFormData(initialFormState)
        await loadVehicleCommandCenter()
        return
      }

      setShowForm(false)
      setFormData(initialFormState)
      setSuccessMessage('Vehicle and 13 jobs created successfully.')
      setIsSaving(false)
      await loadVehicleCommandCenter()
      return
    }

    setShowForm(false)
    setFormData(initialFormState)
    setSuccessMessage('Vehicle saved successfully and synced with Supabase.')
    setIsSaving(false)
  }



  // Workflow helpers are intentionally retained for the dedicated Vehicles module.
  void getStageIndex
  void isAdvancingStage
  void activeJobId
  void nextIncompleteChecklistItem
  void handleCompleteNextJob

  const ninetyDaysAgo =
    new Date(
      Date.now() -
      90 * 24 * 60 * 60 * 1000,
    )

  const soldParts90Days =
    parts.filter((part) => {
      if (
        !part.sold ||
        !part.dateSold
      ) {
        return false
      }

      const soldDate =
        new Date(
          part.dateSold,
        )

      return (
        !Number.isNaN(
          soldDate.getTime(),
        ) &&
        soldDate >=
          ninetyDaysAgo
      )
    })

  const revenueStreams90Days =
    revenueStreams.filter(
      (entry) => {
        if (
          !entry.created_at
        ) {
          return false
        }

        const createdDate =
          new Date(
            entry.created_at,
          )

        return (
          !Number.isNaN(
            createdDate.getTime(),
          ) &&
          createdDate >=
            ninetyDaysAgo
        )
      },
    )

  const ebayRevenue90Days =
    soldParts90Days.reduce(
      (sum, part) =>
        sum +
        Number(
          part.soldPrice || 0,
        ),
      0,
    )

  const localRevenue90Days =
    revenueStreams90Days
      .filter(
        (entry) =>
          entry.source ===
          'Local Sale',
      )
      .reduce(
        (sum, entry) =>
          sum + entry.amount,
        0,
      )

  const scrapRevenue90Days =
    revenueStreams90Days
      .filter(
        (entry) =>
          entry.source ===
          'Scrap Shell',
      )
      .reduce(
        (sum, entry) =>
          sum + entry.amount,
        0,
      )

  const catalyticRevenue90Days =
    revenueStreams90Days
      .filter(
        (entry) =>
          entry.source ===
          'Catalytic Converter',
      )
      .reduce(
        (sum, entry) =>
          sum + entry.amount,
        0,
      )

  const coreRevenue90Days =
    revenueStreams90Days
      .filter(
        (entry) =>
          entry.source ===
          'Core Sale',
      )
      .reduce(
        (sum, entry) =>
          sum + entry.amount,
        0,
      )

  const otherRevenue90Days =
    revenueStreams90Days
      .filter(
        (entry) =>
          entry.source ===
          'Other Revenue',
      )
      .reduce(
        (sum, entry) =>
          sum + entry.amount,
        0,
      )

  const totalRevenue90Days =
    ebayRevenue90Days +
    localRevenue90Days +
    scrapRevenue90Days +
    catalyticRevenue90Days +
    coreRevenue90Days +
    otherRevenue90Days

  const donorRecoveryRows =
    vehicles.map((vehicle) => {
      const donorParts =
        parts.filter(
          (part) =>
            part.vehicleId ===
            vehicle.id,
        )

      const ebayRevenue =
        donorParts
          .filter(
            (part) => part.sold,
          )
          .reduce(
            (sum, part) =>
              sum +
              Number(
                part.soldPrice || 0,
              ),
            0,
          )

      const donorRevenueStreams =
        revenueStreams.filter(
          (entry) =>
            entry.vehicle_id ===
            vehicle.id,
        )

      const revenueForSource =
        (source: string) =>
          donorRevenueStreams
            .filter(
              (entry) =>
                entry.source ===
                source,
            )
            .reduce(
              (sum, entry) =>
                sum + entry.amount,
              0,
            )

      const localRevenue =
        revenueForSource(
          'Local Sale',
        )

      const scrapRevenue =
        revenueForSource(
          'Scrap Shell',
        )

      const catalyticRevenue =
        revenueForSource(
          'Catalytic Converter',
        )

      const coreRevenue =
        revenueForSource(
          'Core Sale',
        )

      const otherRevenue =
        revenueForSource(
          'Other Revenue',
        )

      const totalRecovered =
        ebayRevenue +
        localRevenue +
        scrapRevenue +
        catalyticRevenue +
        coreRevenue +
        otherRevenue

      const investment =
        Number(
          vehicle.totalInvestment || 0,
        )

      const netRecovery =
        totalRecovered -
        investment

      const recoveryPercent =
        investment > 0
          ? (
              totalRecovered /
              investment
            ) * 100
          : 0

      return {
        vehicle,
        ebayRevenue,
        localRevenue,
        scrapRevenue,
        catalyticRevenue,
        coreRevenue,
        otherRevenue,
        totalRecovered,
        investment,
        netRecovery,
        recoveryPercent,
      }
    })
    .sort(
      (a, b) =>
        b.totalRecovered -
        a.totalRecovered,
    )

  if (window.location.pathname === '/mobile') {
    return <MobileCaptureMode />
  }

  return (
    <div className="app professionalShell">
      <aside className="yardSidebar">
        <div className="sidebarBrand">
          <div className="sidebarLogo">TX</div>
          <div>
            <strong>Texas OEM OS</strong>
            <span>Yard Command Center</span>
          </div>
        </div>

        <nav className="sidebarNav" aria-label="Texas OEM OS navigation">
          <button
  className={`sidebarNavItem ${activeView === 'dashboard' ? 'active' : ''}`}
  type="button"
  onClick={() => setActiveView('dashboard')}
>
            Dashboard
          </button>
        
         <button
  className={`sidebarNavItem ${activeView === 'vehicles' ? 'active' : ''}`}
  type="button"
  onClick={() => setActiveView('vehicles')}
>
  Vehicles
</button>
       <button
  className={`sidebarNavItem ${activeView === 'inventory' ? 'active' : ''}`}
  type="button"
  onClick={() => setActiveView('inventory')}
>
  Parts Inventory
</button>

<button
  className="sidebarNavItem"
  type="button"
  onClick={() => {
    window.location.href = '/mobile'
  }}
>
  📸 Mobile Photo Session
</button>
        <button
  className={`sidebarNavItem ${activeView === 'ebay' ? 'active' : ''}`}
  type="button"
  onClick={() => setActiveView('ebay')}
>
  eBay Command
</button>
         <button
  className={`sidebarNavItem ${activeView === 'sales' ? 'active' : ''}`}
  type="button"
  onClick={() => setActiveView('sales')}
>
  Sales & Revenue
</button>
        </nav>

        <div className="sidebarFooter">
          <span>SOLO OPERATOR</span>
          <strong>Texas OEM Parts</strong>
        </div>
      </aside>

      <main className="dashboard professionalDashboard">
        <header className="topbar">
          <div>
            <p className="eyebrow">Texas OEM OS • Solo yard command center</p>
            <h1>Texas OEM OS</h1>
            <p className="heroText">A calm, premium workspace for running a one-man automotive salvage business.</p>
          </div>
          <div className="statusPill">Open for pickups</div>
        </header>

        {activeView === 'dashboard' && (
          <>
        <section className="businessSnapshot">
          <div className="dashboardSectionTitle">
            <div>
              <p className="eyebrow">Business overview</p>
              <h2>Dashboard</h2>
            </div>

            <div className="dashboardQuickActions">
              <button className="primaryButton" type="button" onClick={handleOpenForm}>
                + Add Vehicle
              </button>
              <button className="secondaryButton" type="button" onClick={handleOpenRevenueModal}>
                + Add Revenue
              </button>
            </div>
          </div>

          <div className="businessKpiGrid">
            <div className="businessKpiCard">
              <span>Total Revenue</span>
              <strong>{formatCurrency(
                parts.filter((part) => part.sold).reduce((sum, part) => sum + Number(part.soldPrice || 0), 0)
                + revenueStreams.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0)
              )}</strong>
            </div>

            <div className="businessKpiCard">
              <span>Inventory</span>
              <strong>{parts.length}</strong>
              <small>Parts in system</small>
            </div>

            <div className="businessKpiCard">
              <span>Active eBay</span>
              <strong>{ebayListings.length}</strong>
              <small>Live listings</small>
            </div>

            <div className="businessKpiCard">
              <span>Active Vehicle</span>
              <strong>{currentVehicle ? '1' : '0'}</strong>
            </div>
          </div>

          {successMessage ? <div className="statusBanner success">{successMessage}</div> : null}
          {errorMessage ? <div className="statusBanner error">{errorMessage}</div> : null}

          <section className="activeVehicleSnapshot">
            <div className="activeVehicleHeader">
              <div>
                <p className="eyebrow">Active vehicle</p>
                <h3>{getVehicleTitle(currentVehicle)}</h3>
                {currentVehicle ? (
                  <p className="vehicleSubtitle">
                    Stock #{currentVehicle.stockNumber} • {currentVehicle.trim} • VIN {currentVehicle.vin}
                  </p>
                ) : null}
              </div>

              {currentVehicle ? <span className="statusBadge">{currentVehicle.stage}</span> : null}
            </div>

            {currentVehicle ? (
              <>
                <div className="activeVehicleMetrics">
                  <div>
                    <span>Purchase Price</span>
                    <strong>{formatCurrency(currentVehicle.purchasePrice)}</strong>
                  </div>

                  <div>
                    <span>Total Investment</span>
                    <strong>{formatCurrency(currentVehicle.totalInvestment)}</strong>
                  </div>

                  <div>
                    <span>Progress</span>
                    <strong>{currentVehicle.progress}%</strong>
                  </div>

                  <div>
                    <span>Jobs Completed</span>
                    <strong>{currentVehicle.jobsCompleted}/{currentVehicle.totalJobs}</strong>
                  </div>
                </div>

                <div className="activeVehicleActions">
                  <button className="primaryButton" type="button" onClick={handleContinueVehicle}>
                    Open Vehicle
                  </button>

                  <button className="secondaryButton" type="button" onClick={handleOpenRapidIntake}>
                    + Add Part
                  </button>
                </div>
              </>
            ) : (
              <p className="vehicleSubtitle">No active vehicle.</p>
            )}
          </section>
        </section>

          </>
        )}

        {activeView === 'vehicles' && (
          <section className="card modulePage">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Vehicles</p>
                <h2>Vehicle Management</h2>
              </div>
              <button className="primaryButton" type="button" onClick={handleOpenForm}>
                + Add Vehicle
              </button>
            </div>

            {vehicles.length > 0 ? (
              <div className="vehicleGarage">
                <div className="vehicleGarageHeader">
                  <div>
                    <p className="eyebrow">DONOR GARAGE</p>
                    <h3>Saved Vehicles</h3>
                    <p className="vehicleSubtitle">
                      Switch between donors without losing parts, jobs, progress, or revenue history.
                    </p>
                  </div>

                  <span className="taskCount">{vehicles.length}</span>
                </div>

                <div className="vehicleGarageGrid">
                  {vehicles.map((vehicle) => {
                    const isActive = vehicle.id === currentVehicle?.id

                    const vehiclePartCount = parts.filter(
                      (part) => part.vehicleId === vehicle.id,
                    ).length

                    return (
                      <div
                        key={vehicle.id}
                        className={`vehicleGarageCard${isActive ? ' active' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => void handleSelectVehicle(vehicle)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            void handleSelectVehicle(vehicle)
                          }
                        }}
                      >
                        <div className="vehicleGarageCardTop">
                          <div>
                            <span className="vehicleGarageYear">
                              {vehicle.year || '—'}
                            </span>
                            <strong>
                              {vehicle.make} {vehicle.model}
                            </strong>
                          </div>

                          {isActive ? (
                            <span className="vehicleActiveBadge">ACTIVE</span>
                          ) : (
                            <span className="vehicleOpenBadge">OPEN</span>
                          )}
                        </div>

                        <span className="vehicleGarageMeta">
                          {vehicle.trim || 'No trim'} • Stock #{vehicle.stockNumber || '—'}
                        </span>

                        <span className="vehicleGarageVin">
                          VIN {vehicle.vin || '—'}
                        </span>

                        <div className="vehicleGarageStats">
                          <span>
                            <strong>{vehiclePartCount}</strong>
                            PARTS
                          </span>

                          <span>
                            <strong>{formatCurrency(vehicle.totalInvestment)}</strong>
                            INVESTED
                          </span>

                          <span>
                            <strong>{vehicle.progress || 0}%</strong>
                            PROGRESS
                          </span>
                        </div>

                        <div className="vehicleGarageActions">
                          <button
                            className="secondaryButton"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              void handleSelectVehicle(vehicle)
                            }}
                          >
                            Open Vehicle
                          </button>

                          <button
                            className="vehicleDeleteButton"
                            type="button"
                            onClick={(event) =>
                              void handleDeleteVehicle(vehicle, event)
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {currentVehicle ? (
              <div className="activeVehicleSnapshot">
                <div className="activeVehicleHeader">
                  <div>
                    <p className="eyebrow">Active vehicle</p>
                    <h3>{getVehicleTitle(currentVehicle)}</h3>
                    <p className="vehicleSubtitle">
                      Stock #{currentVehicle.stockNumber} • {currentVehicle.trim} • VIN {currentVehicle.vin}
                    </p>
                  </div>
                  <span className="statusBadge">{currentVehicle.stage}</span>
                </div>

                <div className="activeVehicleMetrics">
                  <div>
                    <span>Purchase Price</span>
                    <strong>{formatCurrency(currentVehicle.purchasePrice)}</strong>
                  </div>
                  <div>
                    <span>Total Investment</span>
                    <strong>{formatCurrency(currentVehicle.totalInvestment)}</strong>
                  </div>
                  <div>
                    <span>Progress</span>
                    <strong>{currentVehicle.progress}%</strong>
                  </div>
                  <div>
                    <span>Jobs Completed</span>
                    <strong>{currentVehicle.jobsCompleted}/{currentVehicle.totalJobs}</strong>
                  </div>
                </div>

                <div className="activeVehicleActions">
                  <button className="primaryButton" type="button" onClick={handleContinueVehicle}>
                    Open Vehicle
                  </button>

                  <button
                    className="secondaryButton"
                    type="button"
                    onClick={() => void handleBuildVehicleRecoveryReport()}
                    disabled={isBuildingRecoveryReport}
                  >
                    {isBuildingRecoveryReport
                      ? 'Analyzing Recovery…'
                      : 'Run Recovery Intelligence'}
                  </button>

                  <button className="secondaryButton" type="button" onClick={handleOpenRapidIntake}>
                    + Add Part
                  </button>
                </div>


                {vehicleRecoveryReport ? (
                  <div className="summaryCard" style={{ marginTop: '18px', alignItems: 'flex-start' }}>
                    <div style={{ width: '100%' }}>
                      <p className="eyebrow">Recovery Intelligence</p>
                      <h3>{vehicleRecoveryReport.recommendation.replaceAll('_', ' ')}</h3>

                      <div className="activeVehicleMetrics" style={{ marginTop: '14px' }}>
                        <div>
                          <span>30-Day Expected Recovery</span>
                          <strong>{formatCurrency(vehicleRecoveryReport.projected30DayRecovery)}</strong>
                        </div>

                        <div>
                          <span>Total Potential Recovery</span>
                          <strong>{formatCurrency(vehicleRecoveryReport.projectedTotalRecovery)}</strong>
                        </div>

                        <div>
                          <span>30-Day Investment Recovery</span>
                          <strong>{vehicleRecoveryReport.projected30DayRecoveryPercent}%</strong>
                        </div>

                        <div>
                          <span>Confidence</span>
                          <strong>{vehicleRecoveryReport.confidence}%</strong>
                        </div>
                      </div>

                      <p className="vehicleSubtitle" style={{ marginTop: '12px' }}>
                        {vehicleRecoveryInputs.length} market-backed part families analyzed •
                        {' '}{recoveryMarketResults.length} family-market results •
                        {' '}{vehicleRecoveryReport.priorityPartsCount} pull-first parts •
                        {' '}{vehicleRecoveryReport.excludedDamagePartsCount} excluded by damage
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="vehicleSubtitle">No active vehicle.</p>
            )}
          </section>
        )}

        {activeView === 'inventory' && (
          <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                <button
                  className="primaryButton"
                  type="button"
                  onClick={() => void handleOpenPartModal()}
                >
                  + Add Part
                </button>
              </div>

            <section className="card scannerPanel">
              <div className="sectionHeader">
                <div>
                  <p className="eyebrow">Warehouse Scanner</p>
                  <h2>Scan Mode</h2>
                  <p className="vehicleSubtitle">
                    Scan a part SKU, eBay Item ID, OEM number, interchange number, or BIN barcode.
                  </p>
                </div>
                <span className="statusBadge">READY</span>
              </div>

                <div className="scannerModeSelector">
                  <button
                    className={scannerMode === 'locate' ? 'primaryButton' : 'secondaryButton'}
                    type="button"
                    onClick={() => {
                      setScannerMode('locate')
                      moveDestinationBinRef.current = null
                      moveQueuedPartsRef.current = []
                      setMoveDestinationBin(null)
                      setScannedBin(null)
                      setScannerValue('')
                      setErrorMessage(null)
                      setSuccessMessage(null)
                    }}
                  >
                    LOCATE
                  </button>

                  <button
                    className={scannerMode === 'move' ? 'primaryButton' : 'secondaryButton'}
                    type="button"
                    onClick={() => {
                      setScannerMode('move')
                      moveDestinationBinRef.current = null
                      moveQueuedPartsRef.current = []
                      setMoveDestinationBin(null)
                      setScannedBin(null)
                      setSearchTerm('')
                      setScannerValue('')
                      setErrorMessage(null)
                      setSuccessMessage(null)
                    }}
                  >
                    MOVE
                  </button>
                </div>

                <div className="scannerModeGrid">
                  <div className="scannerReadyPanel">
                    <div className="scannerReadyIcon">▦</div>
                    <div>
                      <strong>
                        {scannerMode === 'move'
                          ? moveDestinationBin
                            ? 'READY FOR PART'
                            : 'SCAN PART OR LOCATION'
                          : 'READY TO SCAN'}
                      </strong>
                      <span>
                        {scannerMode === 'move'
                          ? moveDestinationBin
                            ? `Assigning parts to ${moveDestinationBin}`
                            : 'Scan part(s) first or scan a warehouse location first'
                          : 'Scanner input is ready'}
                      </span>
                    </div>
                  </div>

                  <div className="scannerModeHelp">
                    <strong>{scannerMode === 'move' ? 'MOVE MODE' : 'LOCATE MODE'}</strong>

                    {scannerMode === 'move' ? (
                      <>
                        <span>Part → Location, or Location → Part</span>
                        <span>Multiple parts can be queued before one location scan</span>
                      </>
                    ) : (
                      <>
                        <span>Part barcode → open exact inventory record</span>
                        <span>Warehouse location barcode → show every item stored there</span>
                      </>
                    )}
                  </div>
                </div>

                {scannerMode === 'move' && moveDestinationBin ? (
                  <div className="scannerBinActive">
                    <div>
                      <span>WAREHOUSE DESTINATION</span>
                      <strong>{moveDestinationBin}</strong>
                    </div>
                    <span>Scan parts to assign them to this location</span>

                    <button
                      className="secondaryButton"
                      type="button"
                      onClick={() => {
                        setMoveDestinationBin(null)
                        setScannerValue('')
                      }}
                    >
                      Change Location
                    </button>
                  </div>
                ) : null}

              <div className="scannerControls">
                <input
                  type="text"
                  value={scannerValue}
                  onChange={(event) => setScannerValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      event.stopPropagation()
                      void handleScannerLookup()
                    }
                  }}
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder="Scan part or location, e.g. W01-R02-B03-L04-A17"
                  aria-label="Scanner input"
                />

                <button
                  className="primaryButton"
                  type="button"
                  onClick={() => void handleScannerLookup()}
                >
                  {scannerMode === 'move' ? 'Move Part' : 'Search'}
                </button>

                {successMessage ? (
                  <div className="statusBanner success">
                    ✓ {successMessage}
                  </div>
                ) : null}
              </div>

              {scannedBin ? (
                <div
                  className="scannerBinActive scannerBinClickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowLocationDetails(true)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setShowLocationDetails(true)
                    }
                  }}
                >
                  <div>
                    <span>ACTIVE LOCATION</span>
                    <strong>{scannedBin}</strong>
                  </div>

                  <span>
                    {inventorySearchResults.length} item{inventorySearchResults.length === 1 ? '' : 's'} inside
                  </span>

                  <div className="scannerBinActions">
                    <button
                      className="primaryButton"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setShowLocationDetails(true)
                      }}
                    >
                      View Contents
                    </button>

                    <button
                      className="secondaryButton"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setShowLocationDetails(false)
                        setScannedBin(null)
                        setSearchTerm('')
                      }}
                    >
                      Clear Location
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
        <section className="card warehouseLocationGenerator">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">WAREHOUSE ADDRESSING</p>
              <h2>Location Label Generator</h2>
              <p className="vehicleSubtitle">
                Generate permanent warehouse barcodes using
                Warehouse → Row → Bay → Level → Position.
              </p>
            </div>

            <span className="taskCount">
              {warehouseLocationLabels.length}
            </span>
          </div>

          <div className="warehouseLocationBuilder">
            <label>
              <span>Warehouse</span>
              <div className="warehouseInputPrefix">
                <strong>W</strong>
                <input
                  inputMode="numeric"
                  value={locationWarehouse}
                  onChange={(event) =>
                    setLocationWarehouse(event.target.value.replace(/\D/g, '').slice(0, 2))
                  }
                />
              </div>
            </label>

            <label>
              <span>Row</span>
              <div className="warehouseInputPrefix">
                <strong>R</strong>
                <input
                  inputMode="numeric"
                  value={locationRow}
                  onChange={(event) =>
                    setLocationRow(event.target.value.replace(/\D/g, '').slice(0, 2))
                  }
                />
              </div>
            </label>

            <label>
              <span>Bay</span>
              <div className="warehouseInputPrefix">
                <strong>B</strong>
                <input
                  inputMode="numeric"
                  value={locationBay}
                  onChange={(event) =>
                    setLocationBay(event.target.value.replace(/\D/g, '').slice(0, 2))
                  }
                />
              </div>
            </label>

            <label>
              <span>Level</span>
              <div className="warehouseInputPrefix">
                <strong>L</strong>
                <input
                  inputMode="numeric"
                  value={locationLevel}
                  onChange={(event) =>
                    setLocationLevel(event.target.value.replace(/\D/g, '').slice(0, 2))
                  }
                />
              </div>
            </label>

            <label>
              <span>Position Type</span>
              <select
                value={locationPositionType}
                onChange={(event) =>
                  setLocationPositionType(
                    event.target.value as 'A' | 'S' | 'P',
                  )
                }
              >
                <option value="A">A — Bin</option>
                <option value="S">S — Shelf / Loose</option>
                <option value="P">P — Pallet / Heavy</option>
              </select>
            </label>

            <label>
              <span>Start</span>
              <input
                inputMode="numeric"
                value={locationStart}
                onChange={(event) =>
                  setLocationStart(event.target.value.replace(/\D/g, '').slice(0, 3))
                }
              />
            </label>

            <label>
              <span>End</span>
              <input
                inputMode="numeric"
                value={locationEnd}
                onChange={(event) =>
                  setLocationEnd(event.target.value.replace(/\D/g, '').slice(0, 3))
                }
              />
            </label>
          </div>

          <div className="warehouseLocationExample">
            <span>GENERATING</span>
            <strong>
              {warehouseLocationLabels[0] || '—'}
              {warehouseLocationLabels.length > 1
                ? ` → ${warehouseLocationLabels[warehouseLocationLabels.length - 1]}`
                : ''}
            </strong>
          </div>

          <div className="warehouseLocationActions">
            <button
              className="primaryButton"
              type="button"
              disabled={warehouseLocationLabels.length === 0}
              onClick={handlePrintWarehouseLocations}
            >
              Send {warehouseLocationLabels.length} Location Label
              {warehouseLocationLabels.length === 1 ? '' : 's'} to Zebra
            </button>

            <button
              className="secondaryButton"
              type="button"
              onClick={() =>
                void handlePrintWarehouseArrow('up')
              }
            >
              ↑ Print Up Arrow
            </button>

            <button
              className="secondaryButton"
              type="button"
              onClick={() =>
                void handlePrintWarehouseArrow('down')
              }
            >
              ↓ Print Down Arrow
            </button>
          </div>

          <div className="warehouseLocationPrintArea">
            {warehouseLocationLabels.map((location) => (
              <article
                className="warehouseLocationLabel"
                key={location}
              >
                <div className="warehouseLocationBrand">
                  TEXAS OEM PARTS
                </div>

                <div className="warehouseLocationHeading">
                  STORAGE LOCATION
                </div>

                <strong className="warehouseLocationCode">
                  {location}
                </strong>

                <img
                  className="warehouseLocationBarcode"
                  src={buildCode128SvgDataUri(location)}
                  alt={`Barcode for ${location}`}
                />

                <div className="warehouseLocationBreakdown">
                  <span>
                    WAREHOUSE
                    <strong>
                      {location.split('-')[0]}
                    </strong>
                  </span>

                  <span>
                    ROW
                    <strong>
                      {location.split('-')[1]}
                    </strong>
                  </span>

                  <span>
                    BAY
                    <strong>
                      {location.split('-')[2]}
                    </strong>
                  </span>

                  <span>
                    LEVEL
                    <strong>
                      {location.split('-')[3]}
                    </strong>
                  </span>

                  <span>
                    POSITION
                    <strong>
                      {location.split('-')[4]}
                    </strong>
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="inventory-search" className="card inventorySearchSection">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Inventory Search</p>
              <h2>Find any part in seconds</h2>
              <p className="vehicleSubtitle">Search live inventory by SKU, part, donor vehicle, VIN, stock number, BIN, or OEM number.</p>
            </div>
            <span className="taskCount">{inventorySearchResults.length}</span>
          </div>

          <div className="inventorySearchHero">
            <input
              className="inventorySearchHeroInput"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search SKU, part name, OEM #, donor vehicle, VIN, stock #, or BIN"
            />
          </div>

          <div className="inventorySearchControls">
            <div className="inventoryFilterRow" role="tablist" aria-label="Inventory filters">
              {inventoryFilterOptions.map((option) => (
                <button
                  key={option.value}
                  className={`inventoryFilterChip${inventoryFilter === option.value ? ' active' : ''}`}
                  type="button"
                  onClick={() => setInventoryFilter(option.value)}
                >
                  {option.value === 'drafts'
                    ? `${option.label} (${listingDraftRecords.filter((draft) => {
                        const part = parts.find((item) => item.id === draft.part_id)
                        return part && !part.listed && !part.sold
                      }).length})`
                    : option.label}
                </button>
              ))}
            </div>

            <label className="inventorySortField">
              <span>Sort</span>
              <select value={inventorySort} onChange={(event) => setInventorySort(event.target.value as InventorySort)}>
                {inventorySortOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          {inventorySearchResults.length === 0 ? (
            <div className="inventoryEmptyState">No inventory items matched the current search and filters.</div>
          ) : (
            <div className="inventorySearchGrid">
              {inventorySearchResults.map((part) => {
                const donorVehicle = getPartVehicleTitle(part) || 'Donor unavailable'
                const workflowStatus = getInventoryWorkflowStatus(part)
                const savedDraft = listingDraftByPartId.get(part.id)
                const hasDraft = Boolean(savedDraft)
                const listedLabel =
                  part.listed
                    ? 'Listed'
                    : hasDraft
                      ? 'Draft Ready'
                      : 'Not Listed'
                const priceValue = part.listPrice || part.soldPrice || 0

                return (
                  <article className="inventoryCompactRow" key={part.id}>
                <div className="inventoryCompactPhoto">
                  {part.primaryPhotoUrl ? (
                    <img src={part.primaryPhotoUrl} alt={part.partName || 'Part photo'} />
                  ) : (
                    <div className="inventoryCompactNoPhoto">No Photo</div>
                  )}
                </div>

                <div className="inventoryCompactIdentity">
                  <strong>{part.partName || 'Untitled part'}</strong>
                  <span>{part.sku || 'No SKU assigned'}</span>
                </div>

                <div className="inventoryCompactField">
                  <span>OEM #</span>
                  <strong>{part.partNumber || '—'}</strong>
                </div>

                <div className="inventoryCompactField inventoryCompactDonor">
                  <span>Donor</span>
                  <strong>{donorVehicle}</strong>
                  <small>Stock #{part.vehicleStockNumber || '—'}</small>
                </div>

                <div className="inventoryCompactField">
                  <span>BIN</span>
                  <strong>{part.bin || 'Unassigned'}</strong>
                </div>

                <div className="inventoryCompactField">
                  <span>Price</span>
                  <strong>{formatCurrency(priceValue)}</strong>
                </div>

                <div className="inventoryCompactStatuses">
                  <span className={getPartStatusClass(part)}>{workflowStatus}</span>
                  <span
                    className={
                      hasDraft && !part.listed && !part.sold
                        ? 'inventoryBadge pending'
                        : getListedStatusBadgeClass(part.listed && !part.sold)
                    }
                  >
                    {listedLabel}
                  </span>
                  <span className={getSoldStatusBadgeClass(part.sold)}>{part.sold ? 'Sold' : 'Available'}</span>
                </div>

                <div className="inventoryCompactActions">
                  <button className="primaryButton" type="button" onClick={() => void handleOpenPartDetails(part)}>
                    Open
                  </button>

                  {hasDraft && !part.listed && !part.sold ? (
                    <>
                      <button
                        className="secondaryButton"
                        type="button"
                        onClick={() => void openSavedListingDraft(part)}
                      >
                        View / Edit Draft
                      </button>

                      <button
                        className="primaryButton"
                        type="button"
                        onClick={() => void publishEbayOffer(part)}
                      >
                        Publish to eBay
                      </button>
                    </>
                  ) : (
                    <button
                      className="secondaryButton"
                      type="button"
                      onClick={() => openTagPreview(part, 'compact', false)}
                    >
                      Print Tag
                    </button>
                  )}
                </div>
              </article>
                )
              })}
            </div>
          )}
        </section>

        <section id="parts-inventory" className="card inventorySection">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Parts inventory</p>
              <h2>Inventory ledger</h2>
            </div>
            <div className="inventoryToolbar">
              <p className="inventoryToolbarSummary">Showing {inventorySearchResults.length} part{inventorySearchResults.length === 1 ? '' : 's'} from the live search results.</p>
              <button className="primaryButton inventoryAddButton" type="button" onClick={() => handleOpenPartModal()}>
                + Add Part
              </button>
            </div>
          </div>

          <div className="inventoryTableWrapper">
            {parts.length === 0 ? (
              <div className="inventoryEmptyState">No parts have been added yet. Create the first salvage part entry from Supabase.</div>
            ) : (
              <table className="inventoryTable">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Part</th>
                    <th>Vehicle</th>
                    <th>BIN</th>
                    <th>Listed</th>
                    <th>Sold</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {inventorySearchResults.map((part) => (
                      <tr key={part.id} onClick={() => handleOpenPartDetails(part)}>
                        <td>{part.sku}</td>
                        <td>
                          <div className="inventoryPartCell">
                            <strong>{part.partName || 'Untitled part'}</strong>
                            <span>{part.partNumber || 'No part number'}</span>
                          </div>
                        </td>
                        <td>{part.vehicleYear || part.vehicleMake || part.vehicleModel ? getPartVehicleTitle(part) : currentVehicle ? getVehicleTitle(currentVehicle) : '—'}</td>
                        <td>{part.bin || getPartShelfLocation(part) || '—'}</td>
                        <td>
                          <span className={getPartStatusClass(part)}>{getPartStatusLabel(part)}</span>
                        </td>
                        <td>
                          <span className={getPartStatusClass(part)}>{getPartStatusLabel(part)}</span>
                        </td>
                        <td>{formatCurrency(part.listPrice)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        
          </>
        )}

        {activeView === 'ebay' && (
          <>
                    <div
            className="card"
            style={{
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <button
              className="primaryButton"
              type="button"
              onClick={() =>
                document
                  .getElementById('ready-to-list')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              Ready to List
            </button>

            <button
              className="secondaryButton"
              type="button"
              onClick={() =>
                document
                  .getElementById('ebay-listings')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              Active Listings ({ebayListings.length})
            </button>
          </div>

<section id="ready-to-list" className="card inventorySection">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Listing Pipeline</p>
                <h2>Ready to List</h2>
                <p className="vehicleSubtitle">
                  Inventory parts that are not sold and are not currently represented by an active eBay listing.
                </p>
              </div>

              <span className="taskCount">
                {
                  parts.filter((part) => {
                    if (part.sold || part.listed || part.ebayStatus === 'Listed' || part.ebayStatus === 'Sold') {
                      return false
                    }

                    const partSku = part.sku?.trim().toLowerCase() ?? ''

                    const hasEbayListing = ebayListings.some((listing) => {
                      const ebaySku = listing.sku?.trim().toLowerCase() ?? ''

                      return (
                        listing.matched_part_id === part.id ||
                        Boolean(partSku && ebaySku && partSku === ebaySku)
                      )
                    })

                    return !hasEbayListing
                  }).length
                }
              </span>
            </div>

            {(() => {
              const readyToListParts = parts.filter((part) => {
                if (part.sold || part.listed || part.ebayStatus === 'Listed' || part.ebayStatus === 'Sold') {
                  return false
                }

                const partSku = part.sku?.trim().toLowerCase() ?? ''

                const hasEbayListing = ebayListings.some((listing) => {
                  const ebaySku = listing.sku?.trim().toLowerCase() ?? ''

                  return (
                    listing.matched_part_id === part.id ||
                    Boolean(partSku && ebaySku && partSku === ebaySku)
                  )
                })

                return !hasEbayListing
              })

              if (readyToListParts.length === 0) {
                return (
                  <div className="inventoryEmptyState">
                    No inventory parts are waiting to be listed on eBay.
                  </div>
                )
              }

              return (
                <div className="inventoryTableWrapper">
                  <table className="inventoryTable">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Part</th>
                        <th>OEM #</th>
                        <th>BIN</th>
                        <th>Photos</th>
                        <th>Price</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {readyToListParts.map((part) => (
                        <tr key={part.id}>
                          <td>
                            <strong>{part.sku || 'Pending SKU'}</strong>
                          </td>

                          <td>
                            <div className="inventoryPartCell">
                              <strong>{part.partName || 'Untitled part'}</strong>
                              <span>
                                {part.vehicleYear || part.vehicleMake || part.vehicleModel
                                  ? getPartVehicleTitle(part)
                                  : 'Standalone inventory'}
                              </span>
                            </div>
                          </td>

                          <td>{part.partNumber || '—'}</td>

                          <td>
                            {part.bin || getPartShelfLocation(part) || '—'}
                          </td>

                          <td>{part.photoCount || 0}</td>

                          <td>
                            {Number(part.listPrice || 0) > 0
                              ? formatCurrency(part.listPrice)
                              : 'Pricing pending'}
                          </td>

                          <td>
                            <span className="statusBadge">
                              Ready to List
                            </span>
                          </td>

                          <td>
                            <button
                              className="primaryButton"
                              type="button"
                              onClick={() => void handleOpenPartDetails(part)}
                            >
                              Open Part
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </section>

          <section id="ebay-listings" className="card inventorySection">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">eBay integration</p>
                <h2>eBay Listings</h2>
                <p className="vehicleSubtitle">
                  Live Production listings synced from Texas OEM Parts.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button
                  className="primaryButton"
                  type="button"
                  onClick={() => void handleSyncEbayListings()}
                  disabled={isSyncingEbay}
                >
                  {isSyncingEbay ? 'Syncing eBay...' : 'Sync eBay Now'}
                </button>

                <span className="taskCount">{ebayListings.length}</span>
              </div>
            </div>

            {ebaySyncMessage ? (
              <p className="vehicleSubtitle">{ebaySyncMessage}</p>
            ) : null}

            <div className="inventoryToolbar">
              <p className="inventoryToolbarSummary">
                {ebayListings.length} eBay listings •{' '}
                {
                  ebayListings.filter((listing) => {
                    const ebaySku = listing.sku?.trim().toLowerCase()

                    return Boolean(
                      listing.matched_part_id ||
                      (
                        ebaySku &&
                        parts.some(
                          (part) =>
                            part.sku?.trim().toLowerCase() === ebaySku,
                        )
                      )
                    )
                  }).length
                } matched to Parts Inventory
              </p>
            </div>

            <div className="inventoryTableWrapper">
              {ebayListings.length === 0 ? (
                <div className="inventoryEmptyState">
                  No eBay listings have been loaded yet.
                </div>
              ) : (
                <table className="inventoryTable">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>eBay Title</th>
                      <th>Current Price</th>
                      <th>Qty</th>
                      <th>Status</th>
                      <th>Inventory Match</th>
                      <th>90-Day Market</th>
                      <th>Price Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {ebayListings.map((listing) => {
                      const ebaySku =
                        listing.sku?.trim().toLowerCase() ?? ''

                      const matchedPart =
                        parts.find(
                          (part) =>
                            listing.matched_part_id === part.id,
                        ) ??
                        (
                          ebaySku
                            ? parts.find(
                                (part) =>
                                  part.sku?.trim().toLowerCase() === ebaySku,
                              )
                            : undefined
                        )

                      return (
                        <tr key={listing.ebay_item_id}>
                          <td>
                            <strong>{listing.sku || 'No SKU'}</strong>
                          </td>

                          <td>
                            <div className="inventoryPartCell">
                              <strong>{listing.title}</strong>
                              <span>Item {listing.ebay_item_id}</span>
                            </div>
                          </td>

                          <td>{formatCurrency(listing.price)}</td>
                          <td>{listing.quantity_available}</td>

                          <td>
                            <span className="statusBadge">
                              {listing.ebay_status}
                            </span>
                          </td>

                          <td>
                            {matchedPart ? (
                              <div>
                                <span className="statusBadge">
                                  Matched
                                </span>
                                <div style={{ marginTop: '8px' }}>
                                  <strong>{matchedPart.sku}</strong>
                                </div>
                              </div>
                            ) : (
                              <select
                                value=""
                                disabled={
                                  matchingEbayItemId === listing.ebay_item_id
                                }
                                onChange={(event) => {
                                  const partId = event.target.value

                                  if (partId) {
                                    void handleMatchEbayListing(
                                      listing.ebay_item_id,
                                      partId,
                                    )
                                  }
                                }}
                              >
                                <option value="">
                                  {matchingEbayItemId === listing.ebay_item_id
                                    ? 'Saving...'
                                    : 'Match Part...'}
                                </option>

                                {parts.map((part) => (
                                  <option key={part.id} value={part.id}>
                                    {part.sku} — {part.partName || 'Untitled part'}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>

                          <td>
                            {ebayMarketData[listing.ebay_item_id] ? (
                              <div>
                                <strong>
                                  ${ebayMarketData[
                                    listing.ebay_item_id
                                  ].quickSalePrice.toFixed(2)}
                                </strong>

                                <div
                                  className="photoHint"
                                  style={{ marginTop: '4px' }}
                                >
                                  {
                                    ebayMarketData[
                                      listing.ebay_item_id
                                    ].soldCount
                                  } sold / 90d
                                </div>

                                <div className="photoHint">
                                  Median ${ebayMarketData[
                                    listing.ebay_item_id
                                  ].medianPrice.toFixed(2)}
                                </div>

                                <div className="photoHint">
                                  Confidence {ebayMarketData[
                                    listing.ebay_item_id
                                  ].confidence}% 
                                </div>

                                <div className="photoHint">
                                  Query: {ebayMarketData[
                                    listing.ebay_item_id
                                  ].query}
                                </div>
                              </div>
                            ) : (
                              <button
                                className="secondaryButton"
                                type="button"
                                disabled={
                                  checkingEbayMarketId ===
                                  listing.ebay_item_id
                                }
                                onClick={() =>
                                  void handleCheckListingMarket(
                                    listing,
                                    matchedPart,
                                  )
                                }
                              >
                                {checkingEbayMarketId ===
                                listing.ebay_item_id
                                  ? 'Checking...'
                                  : 'Check Market'}
                              </button>
                            )}
                          </td>

                          <td>
                            {(() => {
                              const market =
                                ebayMarketData[
                                  listing.ebay_item_id
                                ]

                              if (!market) {
                                return (
                                  <span className="statusBadge">
                                    Not Checked
                                  </span>
                                )
                              }

                              const quick =
                                market.quickSalePrice

                              const difference =
                                quick > 0
                                  ? (listing.price - quick) /
                                    quick
                                  : 0

                              if (difference > 0.1) {
                                return (
                                  <span className="statusBadge">
                                    PRICE HIGH
                                  </span>
                                )
                              }

                              if (difference < -0.1) {
                                return (
                                  <span className="statusBadge">
                                    PRICE LOW
                                  </span>
                                )
                              }

                              return (
                                <span className="statusBadge statusListed">
                                  MARKET
                                </span>
                              )
                            })()}
                          </td>

                          <td>
                            {ebayMarketData[
                              listing.ebay_item_id
                            ] ? (
                              <button
                                className="primaryButton"
                                type="button"
                                disabled={
                                  updatingEbayMarketId ===
                                  listing.ebay_item_id
                                }
                                onClick={() =>
                                  void handleApplyListingQuickSale(
                                    listing,
                                    matchedPart,
                                  )
                                }
                              >
                                {updatingEbayMarketId ===
                                listing.ebay_item_id
                                  ? 'Updating...'
                                  : 'Apply Quick Sale'}
                              </button>
                            ) : (
                              <span className="photoHint">
                                Check market first
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

<section className="card">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Overview</p>
              <h2>Business pulse</h2>
            </div>
          </div>

          <div className="metricsGrid">
            {metrics.map((metric) => (
              <div className="metricCard" key={metric.label}>
                <p className="metricLabel">{metric.label}</p>
                <h3>{metric.value}</h3>
                <p>{metric.detail}</p>
              </div>
            ))}
          </div>
        </section>

          </>
        )}

        {activeView === 'sales' && (
          <section className="card modulePage">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Sales & Revenue</p>
                <h2>Revenue Center</h2>
              </div>
              <button className="primaryButton" type="button" onClick={handleOpenRevenueModal}>
                + Add Revenue
              </button>
            </div>

            <div className="businessKpiGrid">
              <div className="businessKpiCard">
                <span>Total Revenue</span>
                <strong>{formatCurrency(
                  parts.filter((part) => part.sold).reduce((sum, part) => sum + Number(part.soldPrice || 0), 0)
                  + revenueStreams.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0)
                )}</strong>
              </div>

              <div className="businessKpiCard">
                <span>90-Day Revenue</span>
                <strong>{formatCurrency(totalRevenue90Days)}</strong>
              </div>

              <div className="businessKpiCard">
                <span>Parts Sold</span>
                <strong>{parts.filter((part) => part.sold).length}</strong>
              </div>

              <div className="businessKpiCard">
                <span>eBay</span>
                <strong>{formatCurrency(ebayRevenue90Days)}</strong>
              </div>

              <div className="businessKpiCard">
                <span>Local</span>
                <strong>{formatCurrency(localRevenue90Days)}</strong>
              </div>

              <div className="businessKpiCard">
                <span>Scrap</span>
                <strong>{formatCurrency(scrapRevenue90Days)}</strong>
              </div>

              <div className="businessKpiCard">
                <span>Catalytic</span>
                <strong>{formatCurrency(catalyticRevenue90Days)}</strong>
              </div>

              <div className="businessKpiCard">
                <span>Core</span>
                <strong>{formatCurrency(coreRevenue90Days)}</strong>
              </div>

              <div className="businessKpiCard">
                <span>Other</span>
                <strong>{formatCurrency(otherRevenue90Days)}</strong>
              </div>
            </div>

            <div className="inventoryTableWrap">
              <div className="sectionHeader">
                <div>
                  <p className="eyebrow">Donor Recovery</p>
                  <h3>Revenue by Vehicle</h3>
                </div>
              </div>

              {donorRecoveryRows.length === 0 ? (
                <p className="photoHint">No donor vehicles found.</p>
              ) : (
                <table className="inventoryTable">
                  <thead>
                    <tr>
                      <th>Vehicle</th>
                      <th>Investment</th>
                      <th>eBay</th>
                      <th>Local</th>
                      <th>Scrap</th>
                      <th>Catalytic</th>
                      <th>Core</th>
                      <th>Other</th>
                      <th>Total Recovered</th>
                      <th>Net Recovery</th>
                      <th>Recovery %</th>
                    </tr>
                  </thead>

                  <tbody>
                    {donorRecoveryRows.map((row) => (
                      <tr key={row.vehicle.id}>
                        <td>
                          <strong>
                            {getVehicleTitle(row.vehicle)}
                          </strong>
                          <div className="photoHint">
                            {row.vehicle.stockNumber || row.vehicle.vin || 'No stock #'}
                          </div>
                        </td>

                        <td>{formatCurrency(row.investment)}</td>
                        <td>{formatCurrency(row.ebayRevenue)}</td>
                        <td>{formatCurrency(row.localRevenue)}</td>
                        <td>{formatCurrency(row.scrapRevenue)}</td>
                        <td>{formatCurrency(row.catalyticRevenue)}</td>
                        <td>{formatCurrency(row.coreRevenue)}</td>
                        <td>{formatCurrency(row.otherRevenue)}</td>

                        <td>
                          <strong>{formatCurrency(row.totalRecovered)}</strong>
                        </td>

                        <td>
                          <strong>{formatCurrency(row.netRecovery)}</strong>
                        </td>

                        <td>
                          <strong>
                            {row.recoveryPercent.toFixed(0)}%
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="inventoryTableWrap">
              <div className="sectionHeader">
                <div>
                  <p className="eyebrow">Sold Items</p>
                  <h3>Recent Sales</h3>
                </div>
              </div>

              {parts.filter((part) => part.sold).length === 0 ? (
                <p className="photoHint">No sold items recorded yet.</p>
              ) : (
                <table className="inventoryTable">
                  <thead>
                    <tr>
                      <th>Sold Date</th>
                      <th>Part</th>
                      <th>SKU</th>
                      <th>eBay Item</th>
                      <th>Sale Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...parts]
                      .filter((part) => part.sold)
                      .sort((a, b) => {
                        const aTime = a.dateSold ? new Date(a.dateSold).getTime() : 0
                        const bTime = b.dateSold ? new Date(b.dateSold).getTime() : 0
                        return bTime - aTime
                      })
                      .map((part) => (
                        <tr key={part.id}>
                          <td>
                            {part.dateSold
                              ? new Date(part.dateSold).toLocaleDateString()
                              : '—'}
                          </td>
                          <td>
                            <strong>{part.partName || 'Untitled part'}</strong>
                          </td>
                          <td>{part.sku || '—'}</td>
                          <td>{part.ebayItemId || '—'}</td>
                          <td>
                            <strong>{formatCurrency(part.soldPrice || 0)}</strong>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {false && (
          <>
        <section className="card">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Active queue</p>
              <h2>Vehicles in motion</h2>
            </div>
            <span className="statusBadge">3 live</span>
          </div>

          <div className="queueList">
            {queue.map((vehicle) => (
              <div className="queueItem" key={vehicle.title}>
                <div>
                  <strong>{vehicle.title}</strong>
                  <p>{vehicle.note}</p>
                </div>
                <span className="queueStatus">{vehicle.status}</span>
              </div>
            ))}
          </div>
        </section>
          </>
        )}
      </main>

      {showLocationDetails && scannedBin ? (
        <div
          className="modalBackdrop"
          onClick={() => setShowLocationDetails(false)}
        >
          <div
            className="modalCard locationDetailsModal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modalHeader">
              <div>
                <p className="eyebrow">WAREHOUSE LOCATION</p>
                <h2>{scannedBin}</h2>
                <p className="vehicleSubtitle">
                  {inventorySearchResults.length} part
                  {inventorySearchResults.length === 1 ? '' : 's'} physically assigned to this location
                </p>
              </div>

              <button
                className="secondaryButton"
                type="button"
                onClick={() => setShowLocationDetails(false)}
              >
                Close
              </button>
            </div>

            <div className="locationDetailsSummary">
              <div>
                <span>LOCATION</span>
                <strong>{scannedBin}</strong>
              </div>

              <div>
                <span>EXPECTED INVENTORY</span>
                <strong>{inventorySearchResults.length}</strong>
              </div>

              <div>
                <span>AUDIT STATUS</span>
                <strong>Not Audited</strong>
              </div>
            </div>

            {inventorySearchResults.length === 0 ? (
              <div className="emptyState">
                No inventory is currently assigned to this location.
              </div>
            ) : (
              <div className="locationPartsList">
                {inventorySearchResults.map((part) => (
                  <button
                    className="locationPartRow"
                    type="button"
                    key={part.id}
                    onClick={() => {
                      setShowLocationDetails(false)
                      void handleOpenPartDetails(part)
                    }}
                  >
                    <div className="locationPartIdentity">
                      <strong>{part.partName || 'Untitled part'}</strong>
                      <span>{part.sku || 'No SKU'}</span>
                    </div>

                    <div className="locationPartMeta">
                      <span>
                        OEM
                        <strong>{part.partNumber || '—'}</strong>
                      </span>

                      <span>
                        DONOR
                        <strong>
                          {[part.vehicleYear, part.vehicleMake, part.vehicleModel]
                            .filter(Boolean)
                            .join(' ') || '—'}
                        </strong>
                      </span>

                      <span>
                        STATUS
                        <strong>{getPartStatusLabel(part)}</strong>
                      </span>
                    </div>

                    <span className="locationPartOpen">
                      Open Part →
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="locationAuditPanel">
              <div className="locationAuditHeader">
                <div>
                  <p className="eyebrow">INVENTORY CONTROL</p>
                  <strong>Location Audit</strong>
                  <span>
                    {locationAuditActive
                      ? 'Scan every physical part currently inside this location.'
                      : 'Verify physical inventory against Texas OEM OS.'}
                  </span>
                </div>

                {!locationAuditActive ? (
                  <button
                    className="primaryButton"
                    type="button"
                    onClick={handleStartLocationAudit}
                  >
                    Start Audit
                  </button>
                ) : (
                  <div className="locationAuditActions">
                    <button
                      className="primaryButton"
                      type="button"
                      onClick={handleFinishLocationAudit}
                    >
                      Finish Audit
                    </button>

                    <button
                      className="secondaryButton"
                      type="button"
                      onClick={handleCancelLocationAudit}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {locationAuditActive ? (() => {
                const expectedParts = inventorySearchResults

                const verifiedParts = expectedParts.filter((part) =>
                  locationAuditScannedIds.includes(part.id),
                )

                const missingParts = expectedParts.filter(
                  (part) =>
                    !locationAuditScannedIds.includes(part.id),
                )

                return (
                  <>
                    <div className="locationAuditMetrics">
                      <div>
                        <span>EXPECTED</span>
                        <strong>{expectedParts.length}</strong>
                      </div>

                      <div className="auditVerified">
                        <span>VERIFIED</span>
                        <strong>{verifiedParts.length}</strong>
                      </div>

                      <div className="auditMissing">
                        <span>NOT SCANNED</span>
                        <strong>{missingParts.length}</strong>
                      </div>

                      <div className="auditWrong">
                        <span>WRONG LOCATION</span>
                        <strong>{locationAuditWrongParts.length}</strong>
                      </div>
                    </div>

                    <div className="locationAuditList">
                      {expectedParts.map((part) => {
                        const verified =
                          locationAuditScannedIds.includes(part.id)

                        return (
                          <div
                            key={part.id}
                            className={
                              verified
                                ? 'locationAuditRow verified'
                                : 'locationAuditRow missing'
                            }
                          >
                            <div>
                              <strong>
                                {part.partName || 'Untitled part'}
                              </strong>
                              <span>{part.sku || 'No SKU'}</span>
                            </div>

                            <strong>
                              {verified
                                ? '✓ VERIFIED'
                                : '⚠ ITEM NOT FOUND OR BEEPED'}
                            </strong>
                          </div>
                        )
                      })}

                      {locationAuditWrongParts.map((part) => (
                        <div
                          key={`wrong-${part.id}`}
                          className="locationAuditRow wrong"
                        >
                          <div>
                            <strong>
                              {part.partName || 'Untitled part'}
                            </strong>
                            <span>{part.sku || 'No SKU'}</span>
                          </div>

                          <strong>
                            WRONG LOCATION — {part.bin || 'UNASSIGNED'}
                          </strong>
                        </div>
                      ))}

                      {locationAuditUnknownScans.map((value) => (
                        <div
                          key={`unknown-${value}`}
                          className="locationAuditRow unknown"
                        >
                          <div>
                            <strong>Unknown Barcode</strong>
                            <span>{value}</span>
                          </div>

                          <strong>NOT IN INVENTORY</strong>
                        </div>
                      ))}
                    </div>
                  </>
                )
              })() : null}
            </div>
          </div>
        </div>
      ) : null}

      {showPartDetailsModal && selectedPart && (
        <div className="modalBackdrop" onClick={handleClosePartDetails}>
          <div
            className="modalPanel"
            role="dialog"
            aria-modal="true"
            aria-label="Part details"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modalHeader">
              <div>
                <p className="eyebrow">Part details</p>
                <h2>{selectedPart.partName || 'Untitled part'}</h2>
              </div>
              <button className="iconButton" type="button" onClick={handleClosePartDetails}>
                ×
              </button>
            </div>

            <div className="detailGrid">
              <div className="detailCard">
                <span>SKU</span>
                <strong>{selectedPart.sku}</strong>
              </div>
              <div className="detailCard">
                <span>Status</span>
                <strong>{getPartStatusLabel(selectedPart)}</strong>
              </div>
              <div className="detailCard">
                <span>Part Number</span>
                <strong>{selectedPart.partNumber || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>Interchange</span>
                <strong>{selectedPart.interchangeNumber || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>Vehicle</span>
               <strong>{getPartVehicleTitle(selectedPart) || 'Donor unavailable'}</strong>
              </div>
              <div className="detailCard">
                <span>VIN</span>
                <strong>{selectedPart.vehicleVin || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>Vehicle ID</span>
                <strong>{selectedPart.vehicleId || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>BIN / Storage Location</span>
                <strong>{selectedPart.bin || selectedPart.shelf || selectedPart.location || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>Quantity</span>
                <strong>{selectedPart.quantity || 1}</strong>
              </div>
              <div className="detailCard">
                <span>Cost</span>
                <strong>{formatCurrency(selectedPart.cost)}</strong>
              </div>
              <div className="detailCard">
                <span>Price</span>
                <strong>{formatCurrency(selectedPart.listPrice)}</strong>
              </div>
              <div className="detailCard">
                <span>Sold Price</span>
                <strong>{formatCurrency(selectedPart.soldPrice)}</strong>
              </div>
              <div className="detailCard">
                <span>Weight</span>
                <strong>{selectedPart.weight ? `${selectedPart.weight} lbs` : '—'}</strong>
              </div>
              <div className="detailCard">
                <span>Listed</span>
                <strong>{selectedPart.listed ? 'Yes' : 'No'}</strong>
              </div>
              <div className="detailCard">
                <span>Sold</span>
                <strong>{selectedPart.sold ? 'Yes' : 'No'}</strong>
              </div>
              <div className="detailCard">
                <span>Status</span>
                <strong>{selectedPart.ebayStatus || selectedPart.status || 'Not Listed'}</strong>
              </div>
              <div className="detailCard">
                <span>Category</span>
                <strong>{selectedPart.category || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>Condition</span>
                <strong>{selectedPart.condition || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>Brand</span>
                <strong>{selectedPart.brand || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>Part Number</span>
                <strong>{selectedPart.partNumber || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>Interchange</span>
                <strong>{selectedPart.interchangeNumber || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>Engine</span>
                <strong>{selectedPart.engine || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>Transmission</span>
                <strong>{selectedPart.transmission || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>Color</span>
                <strong>{selectedPart.color || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>eBay Item</span>
                <strong>{selectedPart.ebayItemId || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>Listed On</span>
                <strong>{selectedPart.dateListed || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>Sold On</span>
                <strong>{selectedPart.dateSold || '—'}</strong>
              </div>
              <div className="detailCard">
                <span>Photos</span>
                <strong>{selectedPart.photoCount || 0}</strong>
              </div>
            </div>

            <div className="detailCard" style={{ marginTop: '12px' }}>
              <span>SKU</span>
              <strong>{selectedPart.sku || 'Pending generation'}</strong>
              {selectedPart.sku ? (
                <div className="photoToolbar" style={{ marginTop: '8px' }}>
                  <button className="secondaryButton" type="button" onClick={() => void handleCopySku(selectedPart.sku)}>
                    Copy SKU
                  </button>
                  <button className="secondaryButton" type="button" onClick={() => { setRepairSkuTarget(selectedPart); setRepairSkuValue(selectedPart.sku) }}>
                    Repair SKU
                  </button>
                  <button className="secondaryButton" type="button" onClick={() => handlePrintLabel(selectedPart)}>
                    Print Label
                  </button>
                </div>
              ) : null}
              {selectedPart.sku ? <img src={buildCode128SvgDataUri(selectedPart.sku)} alt="SKU barcode" style={{ width: '100%', maxWidth: '220px', marginTop: '8px' }} /> : null}
              {repairSkuTarget?.id === selectedPart.id ? (
                <form className="vehicleForm" onSubmit={handleRepairSku} style={{ marginTop: '10px' }}>
                  <label className="field">
                    <span>Replacement SKU</span>
                    <input value={repairSkuValue} onChange={(event) => setRepairSkuValue(event.target.value.toUpperCase())} placeholder="TX-ALT-001" />
                  </label>
                  <label className="field">
                    <span>Reason</span>
                    <input value={repairReason} onChange={(event) => setRepairReason(event.target.value)} placeholder="Manual SKU repair" />
                  </label>
                  <div className="modalActions">
                    <button className="secondaryButton" type="button" onClick={() => { setRepairSkuTarget(null); setRepairSkuValue(''); setRepairReason('') }}>
                      Cancel
                    </button>
                    <button className="primaryButton" type="submit">
                      Repair SKU
                    </button>
                  </div>
                </form>
              ) : null}
              {selectedPart.sku && isInvalidSku(selectedPart.sku) ? <p className="photoHint">This SKU appears invalid and should be repaired.</p> : null}
            </div>

            <div
              className="detailCard"
              style={{
                marginTop: '12px',
              }}
            >
              <span>
                Interchange Intelligence
              </span>

              {!selectedPart.partNumber ? (
                <p
                  className="photoHint"
                  style={{
                    marginTop: '8px',
                  }}
                >
                  Add an OEM / manufacturer
                  part number to check for
                  interchange numbers.
                </p>
              ) : null}

              {interchangeResult &&
              interchangeResult.sourcePartNumber ===
                selectedPart.partNumber &&
              interchangeResult.verified.length >
                0 ? (
                <div
                  style={{
                    marginTop: '10px',
                    display: 'grid',
                    gap: '8px',
                  }}
                >
                  {interchangeResult.verified.map(
                    (verified) => (
                      <div
                        key={
                          verified.partNumber
                        }
                        style={{
                          padding: '14px',
                          border:
                            '2px solid currentColor',
                          borderRadius:
                            '12px',
                        }}
                      >
                        <p
                          className="eyebrow"
                          style={{
                            margin: 0,
                          }}
                        >
                          🔒 VERIFIED
                        </p>

                        <strong
                          style={{
                            display:
                              'block',
                            fontSize:
                              '24px',
                            marginTop:
                              '5px',
                          }}
                        >
                          {
                            selectedPart.partNumber
                          }
                          {' ↔ '}
                          {
                            verified.partNumber
                          }
                        </strong>

                        <p
                          className="photoHint"
                          style={{
                            marginTop:
                              '6px',
                          }}
                        >
                          Owner approved ·
                          Texas OEM verified
                          library
                        </p>

                        {verified.approvedAt ? (
                          <p
                            className="photoHint"
                            style={{
                              marginTop:
                                '4px',
                            }}
                          >
                            Approved{' '}
                            {new Date(
                              verified.approvedAt,
                            ).toLocaleDateString()}
                          </p>
                        ) : null}
                      </div>
                    ),
                  )}
                </div>
              ) : null}

              {interchangeResult &&
              interchangeResult.sourcePartNumber ===
                selectedPart.partNumber &&
              interchangeResult.verified.length ===
                0 &&
              interchangeResult.candidates.length >
                0 ? (
                <div
                  style={{
                    marginTop: '10px',
                    display: 'grid',
                    gap: '10px',
                  }}
                >
                  {interchangeResult.candidates.map(
                    (candidate) => {
                      const approveKey =
                        `approve:${candidate.candidatePartNumber}`

                      const rejectKey =
                        `reject:${candidate.candidatePartNumber}`

                      return (
                        <div
                          key={
                            candidate.candidatePartNumber
                          }
                          style={{
                            padding:
                              '14px',
                            border:
                              '1px solid currentColor',
                            borderRadius:
                              '12px',
                          }}
                        >
                          <p
                            className="eyebrow"
                            style={{
                              margin: 0,
                            }}
                          >
                            LIKELY
                            INTERCHANGE
                          </p>

                          <strong
                            style={{
                              display:
                                'block',
                              fontSize:
                                '24px',
                              marginTop:
                                '5px',
                            }}
                          >
                            {
                              candidate.candidatePartNumber
                            }
                          </strong>

                          <div
                            style={{
                              display:
                                'grid',
                              gap: '4px',
                              marginTop:
                                '8px',
                            }}
                          >
                            <p
                              className="photoHint"
                              style={{
                                margin: 0,
                              }}
                            >
                              <strong>
                                Confidence:
                              </strong>{' '}
                              {
                                candidate.confidence
                              }
                              %{' '}
                              {candidate.confidence >=
                              90
                                ? 'HIGH'
                                : candidate.confidence >=
                                    70
                                  ? 'MODERATE'
                                  : 'LOW'}
                            </p>

                            <p
                              className="photoHint"
                              style={{
                                margin: 0,
                              }}
                            >
                              <strong>
                                Independent
                                sellers:
                              </strong>{' '}
                              {
                                candidate.externalSellerCount
                              }
                            </p>

                            <p
                              className="photoHint"
                              style={{
                                margin: 0,
                              }}
                            >
                              <strong>
                                Evidence
                                listings:
                              </strong>{' '}
                              {
                                candidate.evidenceCount
                              }
                            </p>
                          </div>

                          <div
                            className="photoToolbar"
                            style={{
                              marginTop:
                                '12px',
                            }}
                          >
                            <button
                              className="primaryButton"
                              type="button"
                              disabled={
                                interchangeReviewKey !==
                                null
                              }
                              onClick={() =>
                                void reviewInterchangeCandidate(
                                  selectedPart,
                                  candidate,
                                  'approve',
                                )
                              }
                            >
                              {interchangeReviewKey ===
                              approveKey
                                ? 'Approving…'
                                : 'Approve'}
                            </button>

                            <button
                              className="secondaryButton"
                              type="button"
                              disabled={
                                interchangeReviewKey !==
                                null
                              }
                              onClick={() =>
                                void reviewInterchangeCandidate(
                                  selectedPart,
                                  candidate,
                                  'reject',
                                )
                              }
                            >
                              {interchangeReviewKey ===
                              rejectKey
                                ? 'Rejecting…'
                                : 'Reject'}
                            </button>
                          </div>
                        </div>
                      )
                    },
                  )}
                </div>
              ) : null}

              {interchangeResult &&
              interchangeResult.sourcePartNumber ===
                selectedPart.partNumber &&
              interchangeResult.verified.length ===
                0 &&
              interchangeResult.candidates.length ===
                0 &&
              !isCheckingInterchange ? (
                <p
                  className="photoHint"
                  style={{
                    marginTop: '8px',
                  }}
                >
                  No reliable interchange #
                  found.
                </p>
              ) : null}

              <div
                className="photoToolbar"
                style={{
                  marginTop: '12px',
                }}
              >
                <button
                  className="secondaryButton"
                  type="button"
                  disabled={
                    isCheckingInterchange ||
                    !selectedPart.partNumber
                  }
                  onClick={() =>
                    void checkInterchangeIntelligence(
                      selectedPart,
                    )
                  }
                >
                  {isCheckingInterchange
                    ? 'Checking…'
                    : interchangeResult &&
                        interchangeResult.sourcePartNumber ===
                          selectedPart.partNumber
                      ? 'Refresh Interchange'
                      : 'Check Interchange'}
                </button>
              </div>
            </div>

            <div className="detailCard" style={{ marginTop: '12px' }}>
              <span>Market Intelligence</span>

              {marketRecommendation ? (
                <div style={{ marginTop: '10px' }}>
                  <div
                    style={{
                      padding: '14px',
                      borderRadius: '12px',
                      border: '2px solid currentColor',
                      marginBottom: '12px',
                    }}
                  >
                    <p className="eyebrow" style={{ margin: 0 }}>⚡ QUICK SALE</p>
                    <strong style={{ fontSize: '28px', display: 'block', marginTop: '4px' }}>
                      ${Number(marketRecommendation.quickSalePrice ?? 0).toFixed(2)}
                    </strong>
                    <p className="photoHint" style={{ marginTop: '4px' }}>
                      {marketRecommendation.shippingMode === 'free_shipping'
                        ? 'FREE SHIPPING'
                        : 'Freight shipping'}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gap: '8px' }}>
                    <p className="photoHint" style={{ margin: 0 }}>
                      <strong>Balanced:</strong> ${Number(marketRecommendation.medianPrice ?? 0).toFixed(2)}
                    </p>

                    <p className="photoHint" style={{ margin: 0 }}>
                      <strong>Max Margin:</strong> ${Number(marketRecommendation.maximumMarginPrice ?? 0).toFixed(2)}
                    </p>

                    <p className="photoHint" style={{ margin: 0 }}>
                      <strong>90-Day Sold:</strong> {marketRecommendation.soldCount ?? marketComps.length}
                      {' • '}
                      <strong>Clean Comps:</strong> {marketRecommendation.pricingCompCount ?? marketRecommendation.sampleSize ?? 0}
                    </p>

                    <p className="photoHint" style={{ margin: 0 }}>
                      <strong>Market Range:</strong>{' '}
                      ${Number(marketRecommendation.lowPrice ?? 0).toFixed(2)}
                      {' – '}
                      ${Number(marketRecommendation.highPrice ?? 0).toFixed(2)}
                    </p>

                    <p className="photoHint" style={{ margin: 0 }}>
                      <strong>Confidence:</strong>{' '}
                      {marketRecommendation.confidenceScore ?? 0}%{' '}
                      {Number(marketRecommendation.confidenceScore ?? 0) >= 75
                        ? 'HIGH'
                        : Number(marketRecommendation.confidenceScore ?? 0) >= 50
                          ? 'MODERATE'
                          : 'LOW'}
                    </p>

                    <p className="photoHint" style={{ margin: 0 }}>
                      <strong>OEM / Query:</strong> {marketRecommendation.searchQuery || '—'}
                    </p>
                  </div>

                  <div className="photoToolbar" style={{ marginTop: '12px' }}>
                    <button
                      className="secondaryButton"
                      type="button"
                      onClick={() => void refreshMarketData(selectedPart)}
                      disabled={isRefreshingMarketData}
                    >
                      {isRefreshingMarketData ? 'Refreshing…' : 'Refresh Market Data'}
                    </button>
                  </div>

                  {marketComps.length ? (
                    <div style={{ marginTop: '14px' }}>
                      <p className="eyebrow">90-Day Sold Listings</p>

                      {marketComps.map((comp) => (
                        <div
                          key={comp.id ?? comp.itemUrl ?? comp.title}
                          className="detailCard"
                          style={{ padding: '10px', marginTop: '8px' }}
                        >
                          <p style={{ margin: 0, fontWeight: 600 }}>
                            {comp.title || 'Untitled listing'}
                          </p>

                          <p className="photoHint" style={{ marginTop: '4px' }}>
                            Item: ${Number(comp.price ?? 0).toFixed(2)}
                            {' • '}
                            Shipping: ${Number(comp.shipping ?? 0).toFixed(2)}
                            {' • '}
                            Buyer Paid: ${Number(comp.totalPrice ?? 0).toFixed(2)}
                          </p>

                          <p className="photoHint">
                            {comp.soldDate
                              ? `Sold ${new Date(comp.soldDate).toLocaleDateString()}`
                              : 'Sold date unavailable'}
                            {' • '}
                            {comp.condition || 'Condition unknown'}
                          </p>

                          {comp.itemUrl ? (
                            <button
                              type="button"
                              className="secondaryButton"
                              style={{
                                marginTop: '8px',
                                width: 'auto',
                                minHeight: '42px',
                              }}
                              onClick={() => {
                                window.location.href = comp.itemUrl as string
                              }}
                            >
                              View Listing
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div style={{ marginTop: '16px' }}>
                    <label
                      htmlFor="manual-approved-price"
                      style={{
                        display: 'block',
                        fontWeight: 700,
                        marginBottom: '6px',
                      }}
                    >
                      Manual Price
                    </label>

                    <input
                      id="manual-approved-price"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={pendingListPrice}
                      onChange={(event) => setPendingListPrice(event.target.value)}
                      placeholder="Enter price"
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '12px',
                        fontSize: '18px',
                        borderRadius: '8px',
                      }}
                    />

                    <p className="photoHint" style={{ marginTop: '5px' }}>
                      Enter any price you want, or use the Quick Sale recommendation.
                    </p>
                  </div>

                  <div className="modalActions" style={{ marginTop: '8px' }}>
                    <button
                      className="secondaryButton"
                      type="button"
                      onClick={() =>
                        setPendingListPrice(
                          String(marketRecommendation.quickSalePrice ?? selectedPart.listPrice ?? 0)
                        )
                      }
                    >
                      Use Quick Sale
                    </button>

                    <button
                      className="primaryButton"
                      type="button"
                      onClick={() => void approveAndApplyPricing(selectedPart)}
                    >
                      Approve Price Change
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <strong>Sold-data integration ready</strong>
                  <div className="photoToolbar" style={{ marginTop: '8px' }}>
                    <button
                      className="secondaryButton"
                      type="button"
                      onClick={() => void refreshMarketData(selectedPart)}
                      disabled={isRefreshingMarketData}
                    >
                      {isRefreshingMarketData ? 'Refreshing…' : 'Check Market Price'}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="detailCard" style={{ marginTop: '12px' }}>
              <span>Notes</span>
              <strong>{selectedPart.notes || 'No notes provided.'}</strong>
            </div>

            <div className="photoSection" style={{ marginTop: '12px' }}>
              <div className="sectionHeader">
                <div>
                  <p className="eyebrow">Part photos</p>
                  <h3>Capture and review images</h3>
                </div>
              </div>

              <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp" multiple hidden onChange={handlePhotoSelection} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={handlePhotoSelection} />

              <div className="photoToolbar">
                <button className="secondaryButton" type="button" onClick={() => photoInputRef.current?.click()}>
                  Choose Photos
                </button>
                <button className="secondaryButton" type="button" onClick={() => cameraInputRef.current?.click()}>
                  Take Photo
                </button>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enhancePhotos}
                    onChange={(event) =>
                      setEnhancePhotos(event.target.checked)
                    }
                  />
                  Enhance Photos
                </label>
              </div>

              {uploadProgress ? <p className="photoHint">{uploadProgress}</p> : null}
              {photoDebugMessage ? <p className="photoHint">{photoDebugMessage}</p> : null}
              {uploadingPhotos ? <p className="photoHint">Uploading…</p> : null}

              {partPhotos.length > 0 ? (
                <div className="photoGrid">
                  {partPhotos.map((photo) => (
                    <div className="photoTile" key={photo.id}>
                      <img className="photoThumb" src={photo.publicUrl ?? ''} alt="Part photo" />
                      {photo.isPrimary ? <span className="primaryBadge">Primary</span> : null}
                      <div className="photoActions">
                        <button className="iconButton" type="button" onClick={() => setPreviewPhoto(photo)}>
                          ⤢
                        </button>
                        <button className="iconButton" type="button" onClick={() => void handleSetPrimaryPhoto(photo)}>
                          ★
                        </button>
                        <button className="iconButton" type="button" onClick={() => void handleDeletePhoto(photo)}>
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="photoHint">No photos yet. Add a few images after the part is saved.</p>
              )}
            </div>

            <div className="detailActions">
              <button className="secondaryButton" type="button" onClick={() => { handleClosePartDetails(); void handleOpenPartModal(selectedPart) }}>
                Edit Part
              </button>

              {listingDraftByPartId.has(selectedPart.id) &&
              !selectedPart.listed &&
              !selectedPart.sold ? (
                <button
                  className="primaryButton"
                  type="button"
                  onClick={() => void publishEbayOffer(selectedPart)}
                >
                  Publish to eBay
                </button>
              ) : null}
              <button className="primaryButton" type="button" onClick={handleDeletePart}>
                Delete Part
              </button>
            </div>
          </div>
        </div>
      )}

      {showPullListModal && pullListVehicle ? (
        <div className="modalBackdrop" onClick={() => setShowPullListModal(false)}>
          <div className="modalPanel" role="dialog" aria-modal="true" aria-label="Vehicle pull list" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <p className="eyebrow">Vehicle pull list</p>
                <h2>{pullListVehicle.make} {pullListVehicle.model}</h2>
              </div>
              <button className="iconButton" type="button" onClick={() => setShowPullListModal(false)}>
                ×
              </button>
            </div>

            <div className="photoToolbar" style={{ marginBottom: '12px' }}>
              <button className="secondaryButton" type="button" onClick={selectAllPullListItems}>
                Select All
              </button>
              <select value={pullListFilter} onChange={(event) => setPullListFilter(event.target.value)} className="secondaryButton" style={{ appearance: 'auto' }}>
                <option value="All">All Categories</option>
                {Array.from(new Set(vehiclePullList.map((item) => item.category))).map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div className="photoGrid" style={{ gridTemplateColumns: '1fr' }}>
              {vehiclePullList.filter((item) => pullListFilter === 'All' || item.category === pullListFilter).map((item) => (
                <div className="detailCard" key={item.id} style={{ padding: '10px' }}>
                  <div className="photoToolbar" style={{ justifyContent: 'space-between' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input type="checkbox" checked={item.selected} onChange={() => togglePullListSelection(item.id)} />
                      <strong>{item.partName}</strong>
                    </label>
                    <span className="inventoryBadge pending">{item.status}</span>
                  </div>
                  <p className="photoHint">{item.category} • {item.side || '—'} • {item.position || '—'} • Qty {item.quantity}</p>
                  <div className="photoToolbar" style={{ marginTop: '8px' }}>
                    <button className="secondaryButton" type="button" onClick={() => updatePullListItem(item.id, 'planned')}>Planned</button>
                    <button className="secondaryButton" type="button" onClick={() => void handleCreatePulledPart(item)}>Pulled</button>
                    <button className="secondaryButton" type="button" onClick={() => updatePullListItem(item.id, 'skipped')}>Skipped</button>
                    <button className="secondaryButton" type="button" onClick={() => updatePullListItem(item.id, 'damaged')}>Damaged</button>
                    <button className="secondaryButton" type="button" onClick={() => updatePullListItem(item.id, 'not_present')}>Not Present</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showListingPreview ? (
        <div
          className="modalBackdrop"
          style={{ zIndex: 10000 }}
          onClick={() => setShowListingPreview(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="eBay listing preview"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(1400px, 96vw)',
              height: '94vh',
              background: '#ffffff',
              borderRadius: '18px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 80px rgba(0,0,0,.35)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 18px',
                borderBottom: '1px solid #d7dee8',
                background: '#ffffff',
              }}
            >
              <div>
                <p
                  className="eyebrow"
                  style={{ margin: 0 }}
                >
                  EBAY LISTING PREVIEW
                </p>

                <strong>
                  {selectedPart?.partName ||
                    'Texas OEM Parts'}
                </strong>
              </div>

              <button
                className="secondaryButton"
                type="button"
                onClick={() =>
                  setShowListingPreview(false)
                }
              >
                Close Preview
              </button>
            </div>

            <iframe
              title="Texas OEM Parts eBay listing preview"
              srcDoc={listingPreviewHtml}
              style={{
                width: '100%',
                flex: 1,
                border: 0,
                background: '#ffffff',
              }}
            />
          </div>
        </div>
      ) : null}

      {showListingDraftModal && selectedPart && listingDraft ? (
        <div className="modalBackdrop" onClick={() => setShowListingDraftModal(false)}>
          <div className="modalPanel" role="dialog" aria-modal="true" aria-label="Listing draft" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <p className="eyebrow">Listing draft</p>
                <h2>{selectedPart.partName}</h2>
              </div>
              <button className="iconButton" type="button" onClick={() => setShowListingDraftModal(false)}>
                ×
              </button>
            </div>

                  <div className="detailCard" style={{ marginTop: '8px' }}>
              <label className="field">
                <span>Title</span>
                <input value={listingDraft.title ?? ''} onChange={(event) => setListingDraft((prev) => prev ? { ...prev, title: event.target.value } : prev)} maxLength={80} />
              </label>
              <p className="photoHint">{(listingDraft.title ?? '').length}/80</p>
              <label className="field">
                <span>SEO Subtitle</span>
                <input value={listingDraft.seoSubtitle ?? ''} onChange={(event) => setListingDraft((prev) => prev ? { ...prev, seoSubtitle: event.target.value } : prev)} />
              </label>
              <label className="field">
                <span>Condition Description</span>
                <textarea value={listingDraft.conditionDescription ?? ''} onChange={(event) => setListingDraft((prev) => prev ? { ...prev, conditionDescription: event.target.value } : prev)} rows={3} />
              </label>
              <label className="field">
                <span>Description</span>
                <textarea value={listingDraft.description ?? ''} onChange={(event) => setListingDraft((prev) => prev ? { ...prev, description: event.target.value } : prev)} rows={5} />
              </label>
              <label className="field">
                <span>Category Suggestion</span>
                <input value={listingDraft.categorySuggestion ?? ''} onChange={(event) => setListingDraft((prev) => prev ? { ...prev, categorySuggestion: event.target.value } : prev)} />
              </label>
              <label className="field">
                <span>Compatibility Notes</span>
                <textarea value={listingDraft.compatibilityNotes ?? ''} onChange={(event) => setListingDraft((prev) => prev ? { ...prev, compatibilityNotes: event.target.value } : prev)} rows={3} />
              </label>

              {ebayCategoryAspects.length > 0 ? (
                <div className="detailCard" style={{ marginTop: '12px' }}>
                  <div className="sectionHeader">
                    <div>
                      <p className="eyebrow">eBay Item Specifics</p>
                      <h3>
                        {ebayResolvedCategory?.categoryName ||
                          'Resolved eBay Category'}
                      </h3>
                    </div>

                    <span className="taskCount">
                      {getMissingRequiredEbayAspects().length}
                    </span>
                  </div>

                  {getMissingRequiredEbayAspects().length > 0 ? (
                    <div className="statusBanner warning" style={{ marginBottom: '12px' }}>
                      ⚠ {getMissingRequiredEbayAspects().length} required eBay item specific
                      {getMissingRequiredEbayAspects().length === 1 ? '' : 's'} missing
                    </div>
                  ) : (
                    <div className="statusBanner success" style={{ marginBottom: '12px' }}>
                      ✓ All required eBay item specifics are complete
                    </div>
                  )}

                  <div className="formGrid">
                    {ebayCategoryAspects
                      .filter((aspect) => aspect.required)
                      .map((aspect) => {
                        const rawValue =
                          listingDraft.itemSpecifics?.[aspect.name]

                        const value =
                          typeof rawValue === 'string'
                            ? rawValue
                            : Array.isArray(rawValue)
                              ? rawValue.join(', ')
                              : ''

                        return (
                          <label className="field" key={aspect.name}>
                            <span>
                              {aspect.name}
                              {aspect.required ? ' • REQUIRED' : ''}
                            </span>

                            {aspect.mode === 'SELECTION_ONLY' && aspect.values.length > 0 ? (
                              <select
                                value={value}
                                onChange={(event) =>
                                  setEbayItemSpecific(
                                    aspect.name,
                                    event.target.value
                                  )
                                }
                              >
                                <option value="">
                                  Select {aspect.name}
                                </option>

                                {aspect.values.map((option) => (
                                  <option
                                    key={option}
                                    value={option}
                                  >
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                value={
                                  aspect.name === 'Brand' && !value
                                    ? (
                                        String(selectedPart?.brand ?? '').trim() ||
                                        String(selectedPart?.vehicleMake ?? '').trim() ||
                                        'OEM'
                                      )
                                    : aspect.name === 'Manufacturer Part Number' && !value
                                      ? String(selectedPart?.partNumber ?? '').trim()
                                      : value
                                }
                                onChange={(event) =>
                                  setEbayItemSpecific(
                                    aspect.name,
                                    event.target.value
                                  )
                                }
                                placeholder={`Enter ${aspect.name}`}
                              />
                            )}
                          </label>
                        )
                      })}
                  </div>
                </div>
              ) : null}
              <label className="field">
                <span>Keywords</span>
                <input value={Array.isArray(listingDraft.keywords) ? listingDraft.keywords.join(', ') : (listingDraft.keywords ?? '')} onChange={(event) => setListingDraft((prev) => prev ? { ...prev, keywords: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) } : prev)} />
              </label>
              <label className="field">
                <span>Shipping Recommendation</span>
                <input value={listingDraft.shippingRecommendation ?? ''} onChange={(event) => setListingDraft((prev) => prev ? { ...prev, shippingRecommendation: event.target.value } : prev)} />
              </label>
              <label className="field">
                <span>Estimated Weight</span>
                <input value={listingDraft.estimatedWeight ?? ''} onChange={(event) => setListingDraft((prev) => prev ? { ...prev, estimatedWeight: event.target.value } : prev)} />
              </label>
              <label className="field">
                <span>Estimated Dimensions</span>
                <input value={listingDraft.estimatedDimensions ?? ''} onChange={(event) => setListingDraft((prev) => prev ? { ...prev, estimatedDimensions: event.target.value } : prev)} />
              </label>
              <label className="field">
                <span>AI Confidence</span>
                <input value={listingDraft.aiConfidence ?? ''} onChange={(event) => setListingDraft((prev) => prev ? { ...prev, aiConfidence: Number(event.target.value) || 0 } : prev)} />
              </label>
            </div>

            <div className="photoToolbar" style={{ marginTop: '8px' }}>
              <button className="secondaryButton" type="button" onClick={() => void handleBuildCurrentListing()}>Regenerate</button>
              <button className="secondaryButton" type="button" onClick={() => void saveListingDraft(selectedPart)}>Save Draft</button>
              <button
                className="secondaryButton"
                type="button"
                onClick={() =>
                  void handlePreviewCurrentListing()
                }
              >
                Preview V3
              </button>
              <button className="primaryButton" type="button" onClick={() => void validateEbayListing(selectedPart)}>Validate for eBay</button>
              <button className="primaryButton" type="button" onClick={() => void createEbayDraft(selectedPart)}>Create eBay Draft</button>
              <button className="primaryButton" type="button" onClick={() => void publishEbayOffer(selectedPart)}>Publish to eBay</button>
              <button className="secondaryButton" type="button" onClick={() => navigator.clipboard.writeText(listingDraft.title ?? '')}>Copy Title</button>
              <button className="secondaryButton" type="button" onClick={() => navigator.clipboard.writeText(listingDraft.description ?? '')}>Copy Description</button>
            </div>

            <div className="detailCard" style={{ marginTop: '10px' }}>
              <span>OCR Suggestions</span>
              <p className="photoHint">{listingDraft.ocrResults ? listingDraft.ocrResults : 'OCR suggestions will appear once photo analysis is available in the Edge Function response.'}</p>
              {listingDraft.imageAnalysis ? <p className="photoHint" style={{ marginTop: '8px' }}>{listingDraft.imageAnalysis}</p> : null}
              {listingDraft.needsMorePhotos ? <p className="photoHint" style={{ marginTop: '8px' }}>Upload another photo to improve confidence before publishing.</p> : null}
              {listingDraftHistory.length ? (
                <div style={{ marginTop: '8px' }}>
                  <p className="eyebrow">Draft history</p>
                  {listingDraftHistory.map((entry) => (
                    <p key={entry.id ?? entry.changedAt ?? Math.random()} className="photoHint">{entry.changeReason ?? 'Updated'} • {entry.changedAt ? new Date(entry.changedAt).toLocaleString() : '—'}</p>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showVehicleDetails && currentVehicle ? (
        <div className="modalBackdrop">
          <div
            className="modalPanel"
            role="dialog"
            aria-modal="true"
            aria-label="Vehicle details"
          >
            <div className="modalHeader">
              <div>
                <p className="eyebrow">Vehicle Details</p>
                <h2>
                  {currentVehicle.year} {currentVehicle.make} {currentVehicle.model}
                </h2>
              </div>

              <button
                className="iconButton"
                type="button"
                onClick={() => setShowVehicleDetails(false)}
              >
                ×
              </button>
            </div>

            <div className="activeVehicleMetrics">
              <div>
                <span>Stock Number</span>
                <strong>{currentVehicle.stockNumber}</strong>
              </div>

              <div>
                <span>VIN</span>
                <strong>{currentVehicle.vin || '—'}</strong>
              </div>

              <div>
                <span>Total Investment</span>
                <strong>{formatCurrency(currentVehicle.totalInvestment)}</strong>
              </div>

              <div>
                <span>Stage</span>
                <strong>{currentVehicle.stage}</strong>
              </div>
            </div>

            <div className="vehicleWorkflowControl">
              <div className="vehicleWorkflowHeader">
                <div>
                  <p className="eyebrow">PRODUCTION WORKFLOW</p>
                  <h3>Vehicle Tasks</h3>
                  <p className="vehicleSubtitle">
                    Control each production step independently.
                  </p>
                </div>

                <div className="vehicleWorkflowProgress">
                  <strong>{currentVehicle.progress}%</strong>
                  <span>COMPLETE</span>
                </div>
              </div>

              <div className="vehicleWorkflowList">
                {productionChecklist.map((item, index) => {
                  const isComplete =
                    item.status === 'Complete'

                  const isInProgress =
                    item.status === 'In Progress'

                  const isBusy =
                    activeJobId === item.key

                  return (
                    <div
                      className={`vehicleWorkflowRow${
                        isComplete
                          ? ' complete'
                          : isInProgress
                            ? ' inProgress'
                            : ''
                      }`}
                      key={item.key}
                    >
                      <div className="vehicleWorkflowStep">
                        <span className="vehicleWorkflowNumber">
                          {String(index + 1).padStart(2, '0')}
                        </span>

                        <div>
                          <strong>{item.label}</strong>
                          <span>
                            {isComplete
                              ? 'Complete'
                              : isInProgress
                                ? 'In Progress'
                                : 'Pending'}
                          </span>
                        </div>
                      </div>

                      <div className="vehicleWorkflowButtons">
                        <button
                          type="button"
                          className="workflowPendingButton"
                          disabled={
                            isBusy ||
                            (!isComplete && !isInProgress)
                          }
                          onClick={() =>
                            void updateChecklistItemStatus(
                              item,
                              'Pending',
                            )
                          }
                        >
                          Pending
                        </button>

                        <button
                          type="button"
                          className="workflowProgressButton"
                          disabled={
                            isBusy || isInProgress
                          }
                          onClick={() =>
                            void updateChecklistItemStatus(
                              item,
                              'In Progress',
                            )
                          }
                        >
                          In Progress
                        </button>

                        <button
                          type="button"
                          className="workflowCompleteButton"
                          disabled={
                            isBusy || isComplete
                          }
                          onClick={() =>
                            void updateChecklistItemStatus(
                              item,
                              'Completed',
                            )
                          }
                        >
                          Complete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="modalActions">
              <button
                className="secondaryButton"
                type="button"
                onClick={() => setShowVehicleDetails(false)}
              >
                Close
              </button>

              <button
                className="primaryButton"
                type="button"
                onClick={() => {
                  setShowVehicleDetails(false)
                  void handleBuildVehicleRecoveryReport()
                }}
              >
                Run Recovery Intelligence
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPartModal && (
        <div className="modalBackdrop">
          <div className="modalPanel" role="dialog" aria-modal="true" aria-label="Add part form">
            <div className="modalHeader">
              <div>
                <p className="eyebrow">New part</p>
                <h2>{partModalMode === 'edit' ? 'Edit Part' : 'Add Part'}</h2>
              </div>
              <button className="iconButton" type="button" onClick={handleClosePartModal}>
                ×
              </button>
            </div>

            <form className="vehicleForm" onSubmit={handleSavePart} noValidate>
                <div className="detailCard" style={{ marginBottom: '12px' }}>
                  <span>Inventory Source</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={isStandalonePart}
                      onChange={(event) => setIsStandalonePart(event.target.checked)}
                    />
                    Standalone Part — no donor vehicle
                  </label>
                  <p className="photoHint" style={{ marginTop: '8px' }}>
                    Use for loose inventory, new parts, tools, accessories, hitches, or anything not removed from the active donor vehicle.
                  </p>
                </div>

              {!isStandalonePart && currentVehicle ? (
                <div className="detailCard" style={{ marginBottom: '12px' }}>
                  <p className="eyebrow">Donor — Automatic</p>
                  <strong>
                    {currentVehicle.year} {currentVehicle.make} {currentVehicle.model}
                  </strong>
                  <p className="photoHint" style={{ marginTop: '6px' }}>
                    VIN {currentVehicle.vin} • Stock #{currentVehicle.stockNumber}
                  </p>
                </div>
              ) : null}

              <div className="formGrid">
                <label className="field">
                  <span>Part Name</span>
                  <input name="partName" value={partFormData.partName} onChange={handlePartFieldChange} placeholder="Alternator" />
                </label>
                <label className="field">
                  <span>Part Number</span>
                  <input name="partNumber" value={partFormData.partNumber} onChange={handlePartFieldChange} placeholder="A12345" />
                </label>
                <label className="field">
                  <span>Interchange Number</span>
                  <input name="interchangeNumber" value={partFormData.interchangeNumber} onChange={handlePartFieldChange} placeholder="GM 12345" />
                </label>
                <label className="field">
                  <span>Brand</span>
                  <input name="brand" value={partFormData.brand} onChange={handlePartFieldChange} placeholder="ACDelco" />
                </label>
                <label className="field">
                  <span>Category</span>
                  <input name="category" value={partFormData.category} onChange={handlePartFieldChange} placeholder="Engine" />
                </label>
                <label className="field">
                  <span>Condition</span>
                  <select
                    name="condition"
                    value={partFormData.condition}
                    onChange={handlePartFieldChange}
                  >
                    <option value="Tested Good">Tested Good</option>
                    <option value="Untested">Untested</option>
                    <option value="Core">Core</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </label>
                <label className="field">
                  <span>Engine</span>
                  <input name="engine" value={partFormData.engine} onChange={handlePartFieldChange} placeholder="V8 5.3" />
                </label>
                <label className="field">
                  <span>Transmission</span>
                  <input name="transmission" value={partFormData.transmission} onChange={handlePartFieldChange} placeholder="6L80" />
                </label>
                <label className="field">
                  <span>Color</span>
                  <input name="color" value={partFormData.color} onChange={handlePartFieldChange} placeholder="Black" />
                </label>
                <label className="field">
                  <span>BIN / Storage Location</span>
                  <input name="bin" value={partFormData.bin} onChange={handlePartFieldChange} placeholder="A-1" />
                </label>
                <label className="field">
                  <span>Quantity</span>
                  <input name="quantity" type="number" min="1" value={partFormData.quantity} onChange={handlePartFieldChange} placeholder="1" />
                </label>
                <label className="field">
                  <span>List Price</span>
                  <input name="listPrice" type="number" min="0" step="0.01" value={partFormData.listPrice} onChange={handlePartFieldChange} placeholder="250" />
                </label>
                <label className="field">
                  <span>Weight (lbs)</span>
                  <input name="weight" type="number" min="0" value={partFormData.weight} onChange={handlePartFieldChange} placeholder="25" />
                </label>
              </div>

              <div className="detailCard" style={{ gridColumn: '1 / -1' }}>
                <span>SKU Preview</span>
                <strong>{skuPreview || partFormData.skuPreview || 'Pending generation'}</strong>
                <p className="photoHint">Choose the part type. Texas OEM OS assigns the SKU code automatically.</p>
                <label className="field" style={{ marginTop: '8px' }}>
                  <span>Part Type</span>
                  <select
                    name="skuCode"
                    value={partFormData.skuCode}
                    onChange={handlePartFieldChange}
                  >
                    <option value="">Select part type</option>
                    {PART_TYPE_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label} ({option.code})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field fullWidth">
                <span>Quick Notes</span>

                <select
                  value=""
                  onChange={(event) => {
                    const preset =
                      event.target.value

                    if (!preset) {
                      return
                    }

                    setPartFormData((prev) => {
                      const existing =
                        prev.notes.trim()

                      return {
                        ...prev,
                        notes: existing
                          ? `${existing}${
                              /[.!?]$/.test(existing)
                                ? ''
                                : '.'
                            } ${preset}`
                          : preset,
                      }
                    })
                  }}
                >
                  <option value="">
                    Select quick note...
                  </option>

                  <option value="Good condition.">
                    Good condition
                  </option>

                  <option value="Great condition.">
                    Great condition
                  </option>

                  <option value="Has light scratches / scuffs.">
                    Has light scratches / scuffs
                  </option>

                  <option value="Minor cosmetic wear.">
                    Minor cosmetic wear
                  </option>

                  <option value="Broken tab / tabs — see pictures carefully.">
                    Broken tab / tabs — see pictures carefully
                  </option>

                  <option value="Some hazing visible.">
                    Some hazing visible
                  </option>

                  <option value="See photos for condition.">
                    See photos for condition
                  </option>

                  <option value="Tested and working.">
                    Tested and working
                  </option>

                  <option value="Untested.">
                    Untested
                  </option>

                  <option value="Normal wear from use.">
                    Normal wear from use
                  </option>

                  <option value="May require cleaning.">
                    May require cleaning
                  </option>

                  <option value="Small chips / marks present.">
                    Small chips / marks present
                  </option>

                  <option value="Connector / plug intact.">
                    Connector / plug intact
                  </option>

                  <option value="Mounting points intact.">
                    Mounting points intact
                  </option>
                </select>
              </label>

              <label className="field fullWidth">
                <span>Notes</span>

                <textarea
                  name="notes"
                  value={partFormData.notes}
                  onChange={handlePartFieldChange}
                  placeholder="Select quick notes above or type a custom note."
                  rows={4}
                />
              </label>

              <div className="photoSection">
                <div className="sectionHeader">
                  <div>
                    <p className="eyebrow">Part photos</p>
                    <h3>Capture and manage images</h3>
                  </div>
                </div>

                <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp" multiple hidden onChange={handlePhotoSelection} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={handlePhotoSelection} />

                <div className="photoToolbar">
                  <button className="secondaryButton" type="button" onClick={() => photoInputRef.current?.click()}>
                    Choose Photos
                  </button>
                  <button className="secondaryButton" type="button" onClick={() => cameraInputRef.current?.click()}>
                    Take Photo
                  </button>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enhancePhotos}
                      onChange={(event) =>
                        setEnhancePhotos(event.target.checked)
                      }
                    />
                    Enhance Photos
                  </label>
                </div>

                {uploadProgress ? <p className="photoHint">{uploadProgress}</p> : null}
                {photoDebugMessage ? <p className="photoHint">{photoDebugMessage}</p> : null}
                {uploadingPhotos ? <p className="photoHint">Uploading…</p> : null}

                {partPhotos.length > 0 ? (
                  <div className="photoGrid">
                    {partPhotos.map((photo) => (
                      <div className="photoTile" key={photo.id}>
                        <img className="photoThumb" src={photo.publicUrl ?? ''} alt="Part photo" />
                        {photo.isPrimary ? <span className="primaryBadge">Primary</span> : null}
                        <div className="photoActions">
                          <button className="iconButton" type="button" onClick={() => setPreviewPhoto(photo)}>
                            ⤢
                          </button>
                          <button className="iconButton" type="button" onClick={() => void handleSetPrimaryPhoto(photo)}>
                            ★
                          </button>
                          <button className="iconButton" type="button" onClick={() => void handleDeletePhoto(photo)}>
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="photoHint">
                    No photos yet. Take or choose photos now — Texas OEM OS will save the part automatically if needed.
                  </p>
                )}
              </div>

              <div className="detailCard" style={{ marginTop: '14px' }}>
                <div className="sectionHeader">
                  <div>
                    <p className="eyebrow">eBay</p>
                    <h3>eBay Listing</h3>
                  </div>

                  <span className="inventoryBadge pending">
                    {selectedPart?.listed
                      ? 'LIVE'
                      : listingDraft
                        ? 'READY'
                        : 'AUTO GENERATING'}
                  </span>
                </div>

                <p className="photoHint" style={{ marginTop: '8px' }}>
                  Listing information fills automatically as the part is processed.
                  Review anything you want to change, then publish.
                </p>

                <div className="formGrid" style={{ marginTop: '14px' }}>
                  <label className="field fullWidth">
                    <span>eBay Title</span>
                    <input
                      value={listingDraft?.title ?? ''}
                      maxLength={80}
                      placeholder="Enter or edit eBay title"
                      onChange={(event) =>
                        setListingDraft((prev) => ({
                          ...(prev ?? {
                            partId: selectedPart?.id ?? editingPartId ?? null,
                            title: '',
                            description: '',
                            descriptionHtml: '',
                            itemSpecifics: {},
                            shippingRecommendation: 'Free Shipping',
                            draftStatus: 'Draft',
                          }),
                          title: event.target.value,
                        }))
                      }
                    />
                    <small className="photoHint">
                      {(listingDraft?.title ?? '').length}/80
                    </small>
                  </label>

                  <label className="field">
                    <span>List Price</span>
                    <input
                      name="listPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      value={partFormData.listPrice}
                      onChange={handlePartFieldChange}
                      placeholder="0.00"
                    />
                  </label>

                  <label className="field">
                    <span>Shipping</span>
                    <select
                      value={
                        listingDraft?.shippingRecommendation ??
                        'Free Shipping'
                      }
                      disabled={!listingDraft}
                      onChange={(event) =>
                        setListingDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                shippingRecommendation: event.target.value,
                              }
                            : prev
                        )
                      }
                    >
                      <option value="Free Shipping">
                        Free Shipping
                      </option>
                      <option value="Flat Rate Shipping">
                        Flat Rate
                      </option>
                      <option value="Freight Shipping">
                        Freight
                      </option>
                      <option value="Local Pickup">
                        Local Pickup
                      </option>
                    </select>
                  </label>
                </div>

                <div style={{ marginTop: '16px' }}>
                  <div className="sectionHeader">
                    <div>
                      <p className="eyebrow">Item Specifics</p>
                      <h3>
                        {ebayResolvedCategory?.categoryName ??
                          'eBay category resolves automatically'}
                      </h3>
                    </div>

                    {ebayCategoryAspects.length > 0 ? (
                      <span className="taskCount">
                        {getMissingRequiredEbayAspects().length}
                      </span>
                    ) : null}
                  </div>

                  {ebayCategoryAspects.length > 0 ? (
                    <div className="formGrid">
                      {ebayCategoryAspects
                        .filter((aspect) => aspect.required)
                        .map((aspect) => {
                          const rawValue =
                            listingDraft?.itemSpecifics?.[aspect.name]

                          const value =
                            typeof rawValue === 'string'
                              ? rawValue
                              : Array.isArray(rawValue)
                                ? rawValue.join(', ')
                                : ''

                          return (
                            <label
                              className="field"
                              key={aspect.name}
                            >
                              <span>
                                {aspect.name} • REQUIRED
                              </span>

                              {aspect.mode === 'SELECTION_ONLY' &&
                              aspect.values.length > 0 ? (
                                <select
                                  value={value}
                                  onChange={(event) =>
                                    setEbayItemSpecific(
                                      aspect.name,
                                      event.target.value
                                    )
                                  }
                                >
                                  <option value="">
                                    Select {aspect.name}
                                  </option>

                                  {aspect.values.map((option) => (
                                    <option
                                      key={option}
                                      value={option}
                                    >
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  value={
                                    aspect.name === 'Brand' && !value
                                      ? (
                                          String(
                                            selectedPart?.brand ??
                                              partFormData.brand ??
                                              ''
                                          ).trim() ||
                                          String(
                                            selectedPart?.vehicleMake ??
                                              currentVehicle?.make ??
                                              ''
                                          ).trim() ||
                                          'OEM'
                                        )
                                      : aspect.name === 'Manufacturer Part Number' && !value
                                        ? String(
                                            selectedPart?.partNumber ??
                                              partFormData.partNumber ??
                                              ''
                                          ).trim()
                                        : value
                                  }
                                  onChange={(event) =>
                                    setEbayItemSpecific(
                                      aspect.name,
                                      event.target.value
                                    )
                                  }
                                  placeholder={`Enter ${aspect.name}`}
                                />
                              )}
                            </label>
                          )
                        })}
                    </div>
                  ) : (
                    <p
                      className="photoHint"
                      style={{ marginTop: '8px' }}
                    >
                      Required eBay specifics will appear here automatically
                      once the listing category is resolved.
                    </p>
                  )}
                </div>

                <div style={{ marginTop: '16px' }}>
                  <p className="eyebrow">Description</p>
                  <h3>Texas OEM V3</h3>

                  <p className="photoHint" style={{ marginTop: '6px' }}>
                    Texas OEM OS generates this automatically. Edit anything you want before publishing.
                  </p>

                  <label
                    className="field fullWidth"
                    style={{ marginTop: '12px' }}
                  >
                    <span>eBay Description</span>
                    <textarea
                      value={listingDraft?.description ?? ''}
                      disabled={!listingDraft}
                      rows={8}
                      placeholder={
                        listingDraft
                          ? 'Edit the eBay description'
                          : 'Description generates automatically after photos are added'
                      }
                      onChange={(event) =>
                        setListingDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                description: event.target.value,
                              }
                            : prev
                        )
                      }
                    />
                  </label>

                  <button
                    className="secondaryButton"
                    type="button"
                    disabled={isSavingPart}
                    onClick={() =>
                      void handlePreviewCurrentListing()
                    }
                    style={{ marginTop: '10px' }}
                  >
                    Preview Listing
                  </button>
                </div>
              </div>

              {errorMessage ? (
                <div className="statusBanner error" style={{ marginTop: '12px' }}>
                  {errorMessage}
                </div>
              ) : null}

              {partModalQrDataUri && editingPartId ? (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '20px',
                    border: '2px solid #1f4b73',
                    borderRadius: '16px',
                    background: '#ffffff',
                    textAlign: 'center',
                  }}
                >
                  <p className="eyebrow">
                    MOBILE PHOTO SESSION
                  </p>

                  <h3
                    style={{
                      margin:
                        '4px 0 8px',
                    }}
                  >
                    Scan With iPhone
                  </h3>

                  <p
                    className="photoHint"
                    style={{
                      marginBottom:
                        '14px',
                    }}
                  >
                    Scan this QR in Mobile Photo Session to open this exact part and start taking photos.
                  </p>

                  <img
                    src={partModalQrDataUri}
                    alt="Open saved part in Mobile Photo Session"
                    style={{
                      width: '100%',
                      maxWidth: '320px',
                      aspectRatio: '1 / 1',
                      display: 'block',
                      margin: '0 auto',
                      background:
                        '#ffffff',
                    }}
                  />

                  <strong
                    style={{
                      display: 'block',
                      marginTop:
                        '12px',
                      fontSize:
                        '18px',
                    }}
                  >
                    {selectedPart?.sku || ''}
                  </strong>
                </div>
              ) : null}

              {successMessage ? (
                <div className="statusBanner success" style={{ marginTop: '12px' }}>
                  {successMessage}
                </div>
              ) : null}


              <div
                className="modalActions"
                style={{
                  position: 'static',
                  background: '#ffffff',
                  paddingTop: '16px',
                  paddingBottom: '12px',
                  marginTop: '12px',
                  borderTop: '1px solid #e5e7eb',
                }}
              >
                <button
                  className="secondaryButton"
                  type="button"
                  onClick={handleClosePartModal}
                >
                  Close
                </button>

                <button
                  className="secondaryButton"
                  type="button"
                  disabled={isSavingPart}
                  onClick={() => void handlePrintCurrentPartTag()}
                >
                  {isSavingPart ? 'Working…' : 'Print Tag'}
                </button>

                <button
                  className="secondaryButton"
                  type="submit"
                  disabled={isSavingPart}
                >
                  {isSavingPart ? 'Saving…' : 'Save Only'}
                </button>

                <button
                  className="secondaryButton"
                  type="button"
                  disabled={isSavingPart}
                  onClick={() =>
                    void handleOpenCurrentPartMarketData()
                  }
                >
                  {isSavingPart
                    ? 'Working…'
                    : 'Market Data'}
                </button>

                <button
                  className="primaryButton"
                  type="button"
                  disabled={isSavingPart}
                  onClick={() => void handleCreateCurrentEbayDraft()}
                >
                  Create eBay Draft
                </button>

                <button
                  className="primaryButton"
                  type="button"
                  disabled={isSavingPart}
                  onClick={() => void handlePublishCurrentEbayListing()}
                >
                  Publish to eBay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRapidIntakeModal && currentVehicle ? (
        <div className="modalBackdrop">
          <div className="modalPanel rapidIntakePanel" role="dialog" aria-modal="true" aria-label="Rapid part intake">
            <div className="modalHeader">
              <div>
                <p className="eyebrow">Rapid Part Intake</p>
                <h2>Active donor vehicle</h2>
              </div>
              <button className="iconButton" type="button" onClick={handleCloseRapidIntake}>
                ×
              </button>
            </div>

            <div className="rapidVehicleCard">
              <strong>{currentVehicle.year} {currentVehicle.make} {currentVehicle.model}</strong>
              <p>VIN {currentVehicle.vin}</p>
              <p>Stock #{currentVehicle.stockNumber}</p>
            </div>

            {rapidIntakeMode === 'success' && rapidIntakeSavedPart ? (
              <div className="rapidPostSaveState">
                <div className="rapidSuccessCard">
                  <p className="eyebrow">Part Saved</p>
                  <h3>{rapidIntakeSavedPart.partName || 'Part saved'}</h3>
                  <div className="rapidSavedGrid">
                    <div>
                      <span>Generated SKU</span>
                      <strong>{rapidIntakeSavedPart.sku || '—'}</strong>
                    </div>
                    <div>
                      <span>OEM part number</span>
                      <strong>{rapidIntakeSavedPart.partNumber || '—'}</strong>
                    </div>
                    <div>
                      <span>Donor vehicle</span>
                      <strong>{currentVehicle.year} {currentVehicle.make} {currentVehicle.model} • VIN {currentVehicle.vin} • Stock #{currentVehicle.stockNumber}</strong>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: '18px',
                    padding: '20px',
                    borderRadius: '16px',
                    background: '#ffffff',
                    border: '2px solid #1f4b73',
                    textAlign: 'center',
                  }}
                >
                  <p
                    className="eyebrow"
                    style={{ marginBottom: '6px' }}
                  >
                    MOBILE PHOTO SESSION
                  </p>

                  <h3 style={{ margin: '0 0 8px' }}>
                    Scan With Phone
                  </h3>

                  <p
                    className="photoHint"
                    style={{ marginBottom: '14px' }}
                  >
                    Open Mobile Photo Session on your iPhone and scan this QR to start taking photos of this exact part.
                  </p>

                  {rapidIntakeQrDataUri ? (
                    <img
                      src={rapidIntakeQrDataUri}
                      alt={`Open ${rapidIntakeSavedPart.sku || 'part'} in Mobile Photo Session`}
                      style={{
                        width: '100%',
                        maxWidth: '320px',
                        aspectRatio: '1 / 1',
                        display: 'block',
                        margin: '0 auto',
                        background: '#ffffff',
                      }}
                    />
                  ) : (
                    <p className="photoHint">
                      Generating QR…
                    </p>
                  )}

                  <strong
                    style={{
                      display: 'block',
                      marginTop: '12px',
                      fontSize: '18px',
                    }}
                  >
                    {rapidIntakeSavedPart.sku}
                  </strong>
                </div>

                <div className="rapidPostSaveActions">
                  <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp" multiple hidden onChange={handlePhotoSelection} />
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={handlePhotoSelection} />
                  <button
                    className="secondaryButton rapidActionButton"
                    type="button"
                    onClick={() => {
                      setEditingPartId(rapidIntakeSavedPart.id)
                      cameraInputRef.current?.click()
                    }}
                  >
                    Take Photos
                  </button>
                  <button className="secondaryButton rapidActionButton" type="button" onClick={() => openTagPreview(rapidIntakeSavedPart, 'full', false)}>
                    Preview 4x4 Tag
                  </button>
                  <button className="secondaryButton rapidActionButton" type="button" onClick={() => openTagPreview(rapidIntakeSavedPart, 'full', true)}>
                    Print 4x4 Tag
                  </button>
                  <button className="secondaryButton rapidActionButton" type="button" onClick={() => openTagPreview(rapidIntakeSavedPart, 'compact', true)}>
                    Print Shelf Label
                  </button>
                  <button className="primaryButton rapidActionButton" type="button" onClick={resetRapidPartFields}>
                    Save & Add Next Part
                  </button>
                  {uploadProgress ? <p className="photoHint">{uploadProgress}</p> : null}
                  {photoDebugMessage ? <p className="photoHint">{photoDebugMessage}</p> : null}
                </div>
              </div>
            ) : (
              <form className="vehicleForm rapidIntakeForm" onSubmit={handleSaveRapidPart}>
                <label className="field fullWidth">
                  <span>Part Name</span>
                  <input name="partName" value={partFormData.partName} onChange={handleRapidPartFieldChange} placeholder="Alternator" required />
                </label>
                <label className="field fullWidth">
                  <span>OEM / Manufacturer Part Number</span>
                  <input name="partNumber" value={partFormData.partNumber} onChange={handleRapidPartFieldChange} placeholder="A12345" />
                </label>
                <label className="field fullWidth">
                  <span>Interchange Number</span>
                  <input name="interchangeNumber" value={partFormData.interchangeNumber} onChange={handleRapidPartFieldChange} placeholder="GM 12345" />
                </label>
                                <label className="field fullWidth">
                  <span>Part Type</span>
                  <select
                    name="skuCode"
                    value={partFormData.skuCode}
                    onChange={handleRapidPartFieldChange}
                    required
                  >
                    <option value="">Select part type</option>
                    {PART_TYPE_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label} ({option.code})
                      </option>
                    ))}
                  </select>
                </label>

<label className="field fullWidth">
                  <span>Condition</span>
                  <select name="condition" value={partFormData.condition} onChange={handleRapidPartFieldChange}>
                    <option value="Tested Good">Tested Good</option>
                    <option value="Untested">Untested</option>
                    <option value="Core">Core</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </label>
                <label className="field fullWidth">
                  <span>BIN / Storage Location</span>
                  <input name="bin" value={partFormData.bin} onChange={handleRapidPartFieldChange} placeholder="A-1" />
                </label>
                <label className="field fullWidth">
                  <span>Quick Notes</span>
                  <select
                    value=""
                    onChange={(event) => {
                      const preset =
                        event.target.value

                      if (!preset) {
                        return
                      }

                      setPartFormData(
                        (prev) => {
                          const existing =
                            prev.notes.trim()

                          const nextNotes =
                            existing
                              ? `${existing}${
                                  /[.!?]$/.test(
                                    existing,
                                  )
                                    ? ''
                                    : '.'
                                } ${preset}`
                              : preset

                          return {
                            ...prev,
                            notes: nextNotes,
                          }
                        },
                      )
                    }}
                  >
                    <option value="">
                      Select quick note...
                    </option>

                    <option value="Good condition.">
                      Good condition
                    </option>

                    <option value="Great condition.">
                      Great condition
                    </option>

                    <option value="Has light scratches / scuffs.">
                      Has light scratches / scuffs
                    </option>

                    <option value="Minor cosmetic wear.">
                      Minor cosmetic wear
                    </option>

                    <option value="Broken tab / tabs — see pictures carefully.">
                      Broken tab / tabs — see pictures carefully
                    </option>

                    <option value="Some hazing visible.">
                      Some hazing visible
                    </option>

                    <option value="See photos for condition.">
                      See photos for condition
                    </option>

                    <option value="Tested and working.">
                      Tested and working
                    </option>

                    <option value="Untested.">
                      Untested
                    </option>

                    <option value="Normal wear from use.">
                      Normal wear from use
                    </option>

                    <option value="May require cleaning.">
                      May require cleaning
                    </option>

                    <option value="Small chips / marks present.">
                      Small chips / marks present
                    </option>

                    <option value="Connector / plug intact.">
                      Connector / plug intact
                    </option>

                    <option value="Mounting points intact.">
                      Mounting points intact
                    </option>
                  </select>
                </label>

                <label className="field fullWidth">
                  <span>Notes</span>
                  <textarea
                    name="notes"
                    value={partFormData.notes}
                    onChange={
                      handleRapidPartFieldChange
                    }
                    placeholder="Select quick notes above or type a custom note."
                    rows={3}
                  />
                </label>

                <div className="rapidSkuCard">
                  <span>Generated SKU</span>
                  <strong>{skuPreview || 'Save part to generate SKU'}</strong>
                </div>

                <div className="modalActions">
                  <button className="secondaryButton" type="button" onClick={handleCloseRapidIntake}>
                    Close
                  </button>
                  <button className="primaryButton" type="submit" disabled={isSavingPart}>
                    {isSavingPart ? 'Saving…' : 'Save Part'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {previewPhoto ? (
        <div className="modalBackdrop" onClick={() => setPreviewPhoto(null)}>
          <div className="modalPanel previewPanel" role="dialog" aria-modal="true" aria-label="Photo preview" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <p className="eyebrow">Photo preview</p>
                <h2>Inspect image</h2>
              </div>
              <button className="iconButton" type="button" onClick={() => setPreviewPhoto(null)}>
                ×
              </button>
            </div>
            <img className="previewImage" src={previewPhoto.publicUrl ?? ''} alt="Preview" />
          </div>
        </div>
      ) : null}

      {printLabelPart ? (
        <div className="modalBackdrop tagPrintModal" onClick={() => { setPrintLabelPart(null); setShouldAutoPrintTag(false) }}>
          <div className="modalPanel" role="dialog" aria-modal="true" aria-label="Print label preview" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <p className="eyebrow">Tag preview</p>
                <h2>{printLabelPart.sku || 'Print label'}</h2>
              </div>
              <button className="iconButton" type="button" onClick={() => { setPrintLabelPart(null); setShouldAutoPrintTag(false) }}>
                ×
              </button>
            </div>
            <div className={`tagPrintContainer ${tagPreviewMode === 'full' ? 'tagPrintFull' : 'tagPrintCompact'}`}>
              <TagPreview data={buildTagPreviewData(printLabelPart, currentVehicle)} mode={tagPreviewMode} />
            </div>
            <div className="modalActions">
              <button className="secondaryButton" type="button" onClick={() => setTagPreviewMode('compact')}>
                Compact View
              </button>
              <button className="secondaryButton" type="button" onClick={() => setTagPreviewMode('full')}>
                Full View
              </button>
              <button
                className="primaryButton"
                type="button"
                onClick={() =>
                  void handleShareTagToZebra(printLabelPart)
                }
              >
                Send to Zebra
              </button>

              <button
                className="secondaryButton"
                type="button"
                onClick={() => setShouldAutoPrintTag(true)}
              >
                Browser Print
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showRevenueModal && (
        <div className="modalBackdrop">
          <div className="modalCard">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Revenue entry</p>
                <h2>Add Revenue</h2>
              </div>
              <button className="secondaryButton" type="button" onClick={handleCloseRevenueModal}>
                Close
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                void handleSaveRevenue()
              }}
            >
              <div className="formGrid">
                <label className="field">
                  <span>Source</span>
                  <select
                    value={revenueSource}
                    onChange={(event) => setRevenueSource(event.target.value)}
                  >
                    <option value="Catalytic Converter">Catalytic Converter</option>
                    <option value="Scrap Shell">Scrap Shell</option>
                    <option value="Core Sale">Core Sale</option>
                    <option value="Local Sale">Local Sale</option>
                    <option value="Other Revenue">Other Revenue</option>
                  </select>
                </label>

                <label className="field">
                  <span>Amount</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={revenueAmount}
                    onChange={(event) => setRevenueAmount(event.target.value)}
                    placeholder="0.00"
                  />
                </label>

                <label className="field fullWidth">
                  <span>Vehicle</span>
                  <select
                    value={revenueVehicleId}
                    onChange={(event) => setRevenueVehicleId(event.target.value)}
                  >
                    <option value="">No vehicle / general revenue</option>
                    {currentVehicle ? (
                      <option value={currentVehicle.id}>
                        {getVehicleTitle(currentVehicle)}
                      </option>
                    ) : null}
                  </select>
                </label>

                <label className="field fullWidth">
                  <span>Notes</span>
                  <textarea
                    rows={3}
                    value={revenueNotes}
                    onChange={(event) => setRevenueNotes(event.target.value)}
                    placeholder="Buyer, converter number, scrap yard ticket, core details, etc."
                  />
                </label>
              </div>

              <div className="modalActions">
                <button
                  className="secondaryButton"
                  type="button"
                  onClick={handleCloseRevenueModal}
                >
                  Cancel
                </button>
                <button
                  className="primaryButton"
                  type="submit"
                  disabled={isSavingRevenue}
                >
                  {isSavingRevenue ? 'Saving...' : 'Save Revenue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modalBackdrop">
          <div className="modalPanel" role="dialog" aria-modal="true" aria-label="Add vehicle form">
            <div className="modalHeader">
              <div>
                <p className="eyebrow">New intake</p>
                <h2>Add Vehicle</h2>
              </div>
              <button className="iconButton" type="button" onClick={handleCancel}>
                ×
              </button>
            </div>

            <form className="vehicleForm" onSubmit={handleSaveVehicle}>
              <div className="formGrid">
                <label className="field">
                  <span>VIN</span>
                  <input name="vin" value={formData.vin} onChange={handleFieldChange} placeholder="1HGCM82633A004251" />
                </label>
                <label className="field">
                  <span>Scan or decode</span>
                  <div className="photoToolbar" style={{ marginTop: '6px' }}>
                    <button className="secondaryButton" type="button" onClick={() => void handleScanVin()} disabled={isScanningVin}>
                      {isScanningVin ? 'Scanning…' : 'Scan VIN'}
                    </button>
                    <button className="secondaryButton" type="button" onClick={() => { setVinInputValue(formData.vin); vinScanInputRef.current?.focus() }}>
                      Manual Entry
                    </button>
                  </div>
                  <input ref={vinScanInputRef} value={vinInputValue || formData.vin} onChange={(event) => setVinInputValue(event.target.value)} placeholder="Enter VIN manually" style={{ marginTop: '8px' }} />
                </label>
                <label className="field">
                  <span>Year</span>
                  <input name="year" value={formData.year} onChange={handleFieldChange} placeholder="2020" />
                </label>
                <label className="field">
                  <span>Make</span>
                  <input name="make" value={formData.make} onChange={handleFieldChange} placeholder="Chevrolet" />
                </label>
                <label className="field">
                  <span>Model</span>
                  <input name="model" value={formData.model} onChange={handleFieldChange} placeholder="Silverado 1500" />
                </label>
                <label className="field">
                  <span>Trim</span>
                  <input name="trim" value={formData.trim} onChange={handleFieldChange} placeholder="LT" />
                </label>
                <label className="field">
                  <span>Purchase Price</span>
                  <input name="purchasePrice" type="number" min="0" value={formData.purchasePrice} onChange={handleFieldChange} placeholder="2500" />
                </label>
                <label className="field">
                  <span>Auction Fees</span>
                  <input name="auctionFees" type="number" min="0" value={formData.auctionFees} onChange={handleFieldChange} placeholder="300" />
                </label>
                <label className="field">
                  <span>Transport Cost</span>
                  <input name="transportCost" type="number" min="0" value={formData.transportCost} onChange={handleFieldChange} placeholder="175" />
                </label>
                <label className="field">
                  <span>Purchase Date</span>
                  <input name="purchaseDate" type="date" value={formData.purchaseDate} onChange={handleFieldChange} />
                </label>
              </div>

              {vinDecodeResult ? (
                <div className="summaryCard" style={{ gridColumn: '1 / -1' }}>
                  <div>
                    <p className="eyebrow">Decoded VIN confirmation</p>
                    <h3>{vinDecodeResult.make || 'Unknown make'} {vinDecodeResult.model || 'Unknown model'}</h3>
                  </div>
                  <p>{vinDecodeResult.modelYear || 'Year unknown'} • {vinDecodeResult.trim || 'Trim unknown'} • {vinDecodeResult.bodyClass || 'Body unknown'}</p>
                  <div className="photoToolbar" style={{ marginTop: '8px' }}>
                    <button className="secondaryButton" type="button" onClick={handleApplyDecodedVin}>
                      Apply Values
                    </button>
                    <button className="secondaryButton" type="button" onClick={() => setVinDecodeResult(null)}>
                      Clear
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="damageProfileCard">
                <div>
                  <p className="eyebrow">Damage Profile</p>
                  <h3>What areas were hit?</h3>
                </div>

                <div
                  className="photoToolbar"
                  style={{
                    marginTop: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  {[
                    ['front', 'Front'],
                    ['rear', 'Rear'],
                    ['left_front', 'Left Front'],
                    ['left_side', 'Left Side'],
                    ['left_rear', 'Left Rear'],
                    ['right_front', 'Right Front'],
                    ['right_side', 'Right Side'],
                    ['right_rear', 'Right Rear'],
                    ['roof', 'Roof'],
                    ['underbody', 'Underbody'],
                    ['flood', 'Flood'],
                    ['fire', 'Fire'],
                    ['mechanical', 'Mechanical'],
                  ].map(([value, label]) => {
                    const zone = value as DamageZone
                    const active = formData.damageZones.includes(zone)

                    return (
                      <button
                        key={zone}
                        type="button"
                        className={active ? 'primaryButton' : 'secondaryButton'}
                        onClick={() => toggleDamageZone(zone)}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>

                <div
                  className="formGrid"
                  style={{
                    marginTop: '14px',
                  }}
                >
                  <label className="field">
                    <span>Damage Severity</span>
                    <select
                      value={formData.damageSeverity}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          damageSeverity: event.target.value as DamageSeverity,
                        }))
                      }
                    >
                      <option value="unknown">Unknown</option>
                      <option value="light">Light</option>
                      <option value="moderate">Moderate</option>
                      <option value="severe">Severe</option>
                    </select>
                  </label>

                  <label className="field">
                    <span>Runs & Drives?</span>
                    <select
                      value={formData.runsAndDrives}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          runsAndDrives: event.target.value as '' | 'yes' | 'no',
                        }))
                      }
                    >
                      <option value="">Unknown</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>

                  <label className="field">
                    <span>Drivetrain Tested?</span>
                    <input
                      type="checkbox"
                      checked={formData.drivetrainTested}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          drivetrainTested: event.target.checked,
                        }))
                      }
                    />
                  </label>
                </div>

                <p
                  className="photoHint"
                  style={{
                    marginTop: '10px',
                  }}
                >
                  These selections will be used to discount or exclude parts
                  that likely did not survive when calculating vehicle recovery.
                </p>
              </div>

              <label className="field fullWidth">
                <span>Notes</span>
                <textarea name="notes" value={formData.notes} onChange={handleFieldChange} placeholder="Add condition notes, parts of interest, and intake details." rows={4} />
              </label>

              <div className="summaryCard">
                <div>
                  <p className="eyebrow">Live total</p>
                  <h3>{formatCurrency(totalInvestment)}</h3>
                </div>
                <p>Purchase price + auction fees + transport cost</p>
              </div>

              {errorMessage ? <div className="statusBanner error">{errorMessage}</div> : null}

              <div className="modalActions">
                <button className="secondaryButton" type="button" onClick={() => openPullListModal(currentVehicle)}>
                  Preview Pull List
                </button>
                <button className="secondaryButton" type="button" onClick={handleCancel}>
                  Cancel
                </button>
                <button className="primaryButton" type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
export default App

