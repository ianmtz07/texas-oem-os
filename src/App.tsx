import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import './App.css'
import { TagPreview, type TagMode, type TagPreviewData } from './components/TagPreview'
import { supabase } from './lib/supabase'
import { buildPartPhotoStoragePath, compressImage, getPhotoValidationError, type PartPhoto } from './lib/partPhotos'
import { buildCode128SvgDataUri, buildSkuPreview, getFallbackPartCode, getPartCodeFromPartMaster, isInvalidSku, type PartMasterRecord } from './lib/sku'
import { buildVehicleDecodeSummary, isValidVin, normalizeVin, type VinDecodeResult } from './lib/vin'
import { buildVehiclePullList, type PullListItem } from './lib/vehiclePullList'
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

type InventoryFilter = 'all' | 'not-listed' | 'listed' | 'sold' | 'no-shelf' | 'no-photos'

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
    partNumber: readStringValue(partMasterRecord ?? {}, ['part_code']) || readStringValue(record, ['part_number', 'number', 'item_number', 'reference']),
    interchangeNumber: readStringValue(record, ['interchange_number', 'interchange']),
    brand: readStringValue(record, ['brand']),
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
    soldPrice: readNumericValue(record, ['sold_price']),
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
  return {
    id: part.id,
    sku: part.sku,
    partName: part.partName || 'Unnamed Part',
    oemPartNumber: part.partNumber || 'N/A',
    donorYear: part.vehicleYear || vehicle?.year || '',
    donorMake: part.vehicleMake || vehicle?.make || '',
    donorModel: part.vehicleModel || vehicle?.model || '',
    vin: part.vehicleVin || vehicle?.vin || '',
    stockNumber: part.vehicleStockNumber || vehicle?.stockNumber || '',
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
  const [scannerMode, setScannerMode] = useState<'locate' | 'move'>('locate')
  const [moveDestinationBin, setMoveDestinationBin] = useState<string | null>(null)
  const moveDestinationBinRef = useRef<string | null>(null)

  const [currentVehicle, setCurrentVehicle] = useState<Vehicle | null>(null)

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
  const [isGeneratingListingDraft, setIsGeneratingListingDraft] = useState(false)
  const [showListingDraftModal, setShowListingDraftModal] = useState(false)
  const [rapidIntakeSavedPart, setRapidIntakeSavedPart] = useState<Part | null>(null)
  const [isStandalonePart, setIsStandalonePart] = useState(false)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const vinScanInputRef = useRef<HTMLInputElement | null>(null)

  const totalInvestment = Number(formData.purchasePrice || 0) + Number(formData.auctionFees || 0) + Number(formData.transportCost || 0)
  const productionChecklist = useMemo(() => buildProductionChecklist(vehicleJobs), [vehicleJobs])
  const nextIncompleteChecklistItem = productionChecklist.find((item) => item.status !== 'Complete') ?? null
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
          return !part.listed && !part.sold
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
  }, [deferredSearchTerm, inventoryFilter, inventorySort, parts, scannedBin])

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

    const vehicleData = ((vehicleRows ?? []) as VehicleRecord[])[0] ?? null

    if (!vehicleData) {
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
      setErrorMessage('Add or load a vehicle before using Rapid Part Intake.')
      return
    }

    const suggestedShelfLocation = parts.length > 0 ? generateShelfLocation(parts) : 'A-01'
    const rapidDefaults: PartFormState = {
      ...initialPartFormState,
      condition: 'Tested Good',
      shelf: suggestedShelfLocation,
      location: suggestedShelfLocation,
      quantity: '1',
      cost: '0',
      listPrice: '0',
      soldPrice: '0',
      photoCount: '0',
    }

    setPartFormData(rapidDefaults)
    setSkuPreview('')
    setRapidIntakeSavedPart(null)
    setRapidIntakeMode('form')
    setPartPhotos([])
    setEditingPartId(null)
    setPartModalMode('add')
    setUploadProgress('')
    setPhotoDebugMessage('')
    setErrorMessage(null)
    setSuccessMessage(null)
    setShowRapidIntakeModal(true)
  }

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
      refreshSkuPreview(nextFormData)
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
    const nextItem = productionChecklist.find((item) => item.status !== 'Complete')
    if (!nextItem) {
      return
    }

    const row = document.getElementById(`job-check-${nextItem.key}`)
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

      if (!candidateRows?.length) {
        throw new Error(
          'No researched part identities exist for this vehicle yet.',
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

      for (const row of candidateRows) {
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

  const updateChecklistItemStatus = async (item: ProductionChecklistItem, nextStatus: 'In Progress' | 'Completed') => {
    if (!supabase || !currentVehicle) {
      return
    }

    const payload = nextStatus === 'Completed'
      ? { status: 'Completed', completed_at: new Date().toISOString() }
      : { status: 'In Progress', completed_at: null }

    const jobsToUpdate = [...item.jobs]

    if (jobsToUpdate.length === 0) {
      const { data: createdJob, error: createError } = await supabase
        .from('jobs')
        .insert({
          vehicle_id: currentVehicle.id,
          job_name: item.label,
          job_type: 'Production',
          estimated_value: 0,
          status: nextStatus === 'Completed' ? 'Completed' : 'In Progress',
          completed_at: nextStatus === 'Completed' ? new Date().toISOString() : null,
        })
        .select('id, vehicle_id, job_name, job_type, estimated_value, status, created_at, completed_at')
        .single()

      if (createError || !createdJob) {
        setErrorMessage(`Unable to create workflow job: ${createError?.message ?? 'Unknown error'}`)
        return
      }

      jobsToUpdate.push(createdJob as JobRecord)
    }

    setActiveJobId(item.key)
    setErrorMessage(null)
    setSuccessMessage(null)

    const jobIds = jobsToUpdate.map((job) => job.id)
    const { error } = await supabase.from('jobs').update(payload).in('id', jobIds)

    if (error) {
      setErrorMessage(`Unable to update job status: ${error.message}`)
      setActiveJobId(null)
      return
    }

    setSuccessMessage(nextStatus === 'Completed' ? `${item.label} marked complete.` : `${item.label} started.`)
    await loadVehicleCommandCenter()
    setActiveJobId(null)
  }

  const refreshSkuPreview = (nextFormData: PartFormState = partFormData) => {
    const partCode = (nextFormData.skuCode || '').trim().toUpperCase() || getPartCodeFromPartMaster(nextFormData.partName, nextFormData.category, partMasters) || getFallbackPartCode(nextFormData.partName, nextFormData.category)
    const nextPreview = buildSkuPreview(currentVehicle?.stockNumber ?? '', partCode, '001')
    setSkuPreview(nextPreview)
    setPartFormData((prevState) => ({ ...prevState, skuCode: nextFormData.skuCode || prevState.skuCode, skuPreview: nextPreview }))
    return nextPreview
  }

  const handlePartFieldChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    const nextFormData = { ...partFormData, [name]: value }
    setPartFormData(nextFormData)

    if (name === 'partName' || name === 'category' || name === 'skuCode') {
      refreshSkuPreview(nextFormData)
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

  const openTagPreview = (part: Part, mode: TagMode = 'full', autoPrint = false) => {
    setTagPreviewMode(mode)
    setPrintLabelPart(part)
    setShouldAutoPrintTag(autoPrint)
  }

  const handlePrintLabel = (part: Part) => {
    openTagPreview(part, 'full', false)
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
          setSuccessMessage(
            `${sourcePartNumber} ↔ ${candidatePartNumber} added to the verified Texas OEM interchange library.`,
          )

          /*
           * Immediately reload so the card
           * switches into VERIFIED mode using
           * the permanent library fast path.
           */
          await checkInterchangeIntelligence(
            part,
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

  const generateListingDraft = async (part: Part) => {
    if (!supabase) {
      setErrorMessage('Supabase is not configured for listing generation.')
      return
    }

    setIsGeneratingListingDraft(true)
    setErrorMessage(null)
    setSuccessMessage('Generating listing draft…')

    try {
      const primaryPhoto = partPhotos.find((photo) => photo.isPrimary)?.publicUrl ?? partPhotos[0]?.publicUrl ?? null
      const photoUrls = partPhotos.map((photo) => photo.publicUrl).filter(Boolean)

      let nextDraft: ListingDraft | null = null

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
        const message = edgeFunctionError instanceof Error ? edgeFunctionError.message : 'Unable to reach the listing draft service.'
        nextDraft = {
          ...buildFallbackListingDraft({
            part: {
              partName: part.partName,
              partNumber: part.partNumber,
              interchangeNumber: part.interchangeNumber,
              sku: part.sku,
              condition: part.condition,
              notes: part.notes,
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

      setListingDraft(nextDraft)
      setShowListingDraftModal(true)
      setSuccessMessage('Listing draft generated.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate listing draft.'
      setErrorMessage(`Listing draft failed: ${message}`)
    } finally {
      setIsGeneratingListingDraft(false)
    }
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

      if (!bestMatch?.categoryId) {
        throw new Error(
          `No verified eBay Motors category found for "${categoryQuery}".`
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

  const createEbayDraft = async (part: Part) => {
    if (!supabase || !listingDraft) {
      setErrorMessage('Generate a listing draft before creating an eBay draft.')
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

      if (!bestMatch?.categoryId) {
        throw new Error(
          `No verified eBay Motors category found for "${categoryQuery}".`
        )
      }

      const { data, error } =
        await supabase.functions.invoke('ebay-publish-listing', {
          body: {
            mode: 'CREATE_DRAFT',
            part,
            draft: listingDraft,
            category: bestMatch,
            photoUrls,
          },
        })

      if (error) {
        throw new Error(error.message)
      }
        if (!data?.success || !data?.offerCreated) {
          const detail =
            data?.ebayResponse ||
            data?.error ||
            data?.message ||
            'eBay did not create the offer.'

          const stage = data?.stage ? `Stage: ${data.stage}` : ''
          const http = data?.ebayHttp ? `eBay HTTP: ${data.ebayHttp}` : ''

          throw new Error(
            [stage, http, String(detail)].filter(Boolean).join('\n')
          )
        }
      const offerId = String(data.offerId || '')

      setSuccessMessage(
        `Unpublished eBay draft created${offerId ? ` • Offer ${offerId}` : ''}.`
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
        const { data, error } =
          await supabase.functions.invoke('ebay-publish-listing', {
            body: {
              mode: 'PUBLISH_OFFER',
              sku,
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
    setIsStandalonePart(part ? !part.vehicleId : true)
    if (part) {
      await loadPartPhotos(part.id)
      setPartFormData({
        partName: part.partName,
        partNumber: part.partNumber,
        interchangeNumber: part.interchangeNumber,
        brand: part.brand,
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
        brand: part.brand,
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
const handleScannerLookup = async (rawValue?: string) => {
  const scannedValue = (rawValue ?? scannerValue).trim()

  if (!scannedValue) {
    setErrorMessage('Scan a part or BIN barcode first.')
    return
  }

  setErrorMessage(null)
  setSuccessMessage(null)

  if (scannedValue.toUpperCase().startsWith('BIN:')) {
    const binValue = scannedValue.slice(4).trim().toUpperCase()

    if (!binValue) {
      setErrorMessage('The BIN barcode does not contain a valid BIN location.')
      return
    }

    if (scannerMode === 'move') {
      moveDestinationBinRef.current = binValue
      setMoveDestinationBin(binValue)
      setScannedBin(null)
      setSearchTerm('')
      setInventoryFilter('all')
      setScannerValue('')
      setSuccessMessage(`Destination BIN ${binValue} selected. Scan parts to move them.`)
      return
    }

    setScannedBin(binValue)
    setMoveDestinationBin(null)
    setSearchTerm('')
    setInventoryFilter('all')
    setActiveView('inventory')
    setScannerValue('')
    return
  }

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
    const destinationBin = moveDestinationBinRef.current || moveDestinationBin

    if (!destinationBin) {
      setErrorMessage('Scan the destination BIN first, then scan the part.')
      return
    }

    if (exactMatches.length !== 1) {
      setSearchTerm(scannedValue)
      setScannedBin(null)
      setActiveView('inventory')
      setErrorMessage(`${exactMatches.length} parts match ${scannedValue}. Scan the unique part SKU instead.`)
      return
    }

    if (!supabase) {
      setErrorMessage('Database connection is unavailable.')
      return
    }

    const partToMove = exactMatches[0]

    const { data: movedPart, error } = await supabase
      .from('parts')
      .update({
        bin: destinationBin,
      })
      .eq('id', partToMove.id)
      .select('id, sku, bin')
      .maybeSingle()

    if (error) {
      setErrorMessage(`Unable to move ${partToMove.sku || partToMove.partName}: ${error.message}`)
      return
    }

    if (!movedPart) {
      setErrorMessage(`Part matched in the OS, but no database record was updated for ${partToMove.sku || scannedValue}.`)
      return
    }

    setParts((prev) =>
      prev.map((part) =>
        part.id === partToMove.id
          ? { ...part, bin: destinationBin }
          : part,
      ),
    )

    setScannerValue('')
    setSuccessMessage(`${partToMove.sku || partToMove.partName} moved to BIN ${destinationBin}.`)
    return
  }

  setScannedBin(null)
  setMoveDestinationBin(null)
  setInventoryFilter('all')
  setActiveView('inventory')
  setScannerValue('')

  if (exactMatches.length === 1) {
    setSearchTerm('')
    await handleOpenPartDetails(exactMatches[0])
    return
  }

  setSearchTerm(scannedValue)
  setSuccessMessage(`${exactMatches.length} exact inventory matches found for ${scannedValue}.`)
}

const handlePhotoSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) {
      return
    }

    const targetPartId = editingPartId ?? selectedPart?.id
    if (!targetPartId) {
      setErrorMessage('Save the part first, then add photos.')
      setPhotoDebugMessage('Upload blocked because the part has no persisted ID yet.')
      return
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
        const compressed = await compressImage(file)
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
      setSuccessMessage(uploadResults.length ? 'Photo upload completed.' : 'Partial success: image stored but record creation failed.')
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

  const handleSavePart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSavingPart(true)
    setErrorMessage(null)
    setSuccessMessage(null)

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
            partMasterId = String(currentMaster.id)

            const existingMasterCode =
              String(currentMaster.part_code ?? '').trim()

            if (existingMasterCode !== partNumber) {
              const { error: updateCurrentMasterError } =
                await supabase
                  .from('part_master')
                  .update({
                    part_name: partName,
                    part_code: partNumber || null,
                  })
                  .eq('id', partMasterId)

              if (updateCurrentMasterError) {
                throw updateCurrentMasterError
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
          partMasterId = String(nameMaster.id)

          const existingMasterCode =
            String(nameMaster.part_code ?? '').trim()

          /*
           * Imported eBay parts may have a placeholder
           * part_code such as EBAY-188627865484.
           *
           * When the owner enters the real OEM number,
           * update the part master itself so refreshes
           * do not restore the old eBay placeholder.
           */
          if (
            partNumber &&
            existingMasterCode !== partNumber &&
            (
              !existingMasterCode ||
              /^EBAY-\d+$/i.test(existingMasterCode)
            )
          ) {
            const { error: updateMasterError } =
              await supabase
                .from('part_master')
                .update({
                  part_code: partNumber,
                })
                .eq('id', partMasterId)

            if (updateMasterError) {
              throw updateMasterError
            }
          }
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
        condition,
        shelf_location: binLocation || null,
        list_price: Number(partFormData.listPrice) || 0,
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
        brand: partFormData.brand.trim(),
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
      const { data: existingMasterByNameAndCode, error: masterLookupError } = await supabase
        .from('part_master')
        .select('id, part_name, part_code')
        .eq('part_name', partName)
        .eq('part_code', partCode)
        .maybeSingle()

      if (masterLookupError) {
        setErrorMessage(`Unable to save part: ${masterLookupError.message}`)
        setIsSavingPart(false)
        return
      }

      if (existingMasterByNameAndCode?.id) {
        partMasterId = String(existingMasterByNameAndCode.id)
      }
    }

    if (!partMasterId) {
      const { data: existingMasterByName, error: masterNameLookupError } = await supabase
        .from('part_master')
        .select('id, part_name, part_code')
        .eq('part_name', partName)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (masterNameLookupError) {
        setErrorMessage(`Unable to save part: ${masterNameLookupError.message}`)
        setIsSavingPart(false)
        return
      }

      if (existingMasterByName?.id) {
        partMasterId = String(existingMasterByName.id)
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
      brand: '',
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
    setRapidIntakeSavedPart(mappedPart)
    setRapidIntakeMode('success')
    setSuccessMessage(`Saved ${sku} to Supabase.`)
    setIsSavingPart(false)

    await loadPartPhotos(savedPartId)
    await loadPartsInventory()
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
                            : 'SCAN DESTINATION BIN'
                          : 'READY TO SCAN'}
                      </strong>
                      <span>
                        {scannerMode === 'move'
                          ? moveDestinationBin
                            ? `Moving parts to BIN ${moveDestinationBin}`
                            : 'Scan the BIN where the parts are going'
                          : 'Scanner input is ready'}
                      </span>
                    </div>
                  </div>

                  <div className="scannerModeHelp">
                    <strong>{scannerMode === 'move' ? 'MOVE MODE' : 'LOCATE MODE'}</strong>

                    {scannerMode === 'move' ? (
                      <>
                        <span>1. Scan destination BIN</span>
                        <span>2. Scan each part to move it</span>
                      </>
                    ) : (
                      <>
                        <span>Part barcode → open exact inventory record</span>
                        <span>BIN barcode → show every item inside that BIN</span>
                      </>
                    )}
                  </div>
                </div>

                {scannerMode === 'move' && moveDestinationBin ? (
                  <div className="scannerBinActive">
                    <div>
                      <span>MOVE DESTINATION</span>
                      <strong>{moveDestinationBin}</strong>
                    </div>
                    <span>Scan parts to move them into this BIN</span>

                    <button
                      className="secondaryButton"
                      type="button"
                      onClick={() => {
                        setMoveDestinationBin(null)
                        setScannerValue('')
                      }}
                    >
                      Change BIN
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
                  placeholder="Scan SKU, eBay ID, OEM #, interchange #, or BIN:A-18"
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
                <div className="scannerBinActive">
                  <div>
                    <span>ACTIVE BIN</span>
                    <strong>{scannedBin}</strong>
                  </div>
                  <span>
                    {inventorySearchResults.length} item{inventorySearchResults.length === 1 ? '' : 's'} found
                  </span>
                  <button
                    className="secondaryButton"
                    type="button"
                    onClick={() => {
                      setScannedBin(null)
                      setSearchTerm('')
                    }}
                  >
                    Clear BIN
                  </button>
                </div>
              ) : null}
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
                  {option.label}
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
                const listedLabel = part.listed ? 'Listed' : 'Not Listed'
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
                  <span className={getListedStatusBadgeClass(part.listed && !part.sold)}>{listedLabel}</span>
                  <span className={getSoldStatusBadgeClass(part.sold)}>{part.sold ? 'Sold' : 'Available'}</span>
                </div>

                <div className="inventoryCompactActions">
                  <button className="primaryButton" type="button" onClick={() => void handleOpenPartDetails(part)}>
                    Open
                  </button>
                  <button className="secondaryButton" type="button" onClick={() => openTagPreview(part, 'full', true)}>
                    Print Tag
                  </button>
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
                <span>Parts Sold</span>
                <strong>{parts.filter((part) => part.sold).length}</strong>
              </div>
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

      {showPartDetailsModal && selectedPart && (
        <div className="modalBackdrop">
          <div className="modalPanel" role="dialog" aria-modal="true" aria-label="Part details">
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
                            <a
                              href={comp.itemUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#2563eb', textDecoration: 'underline' }}
                            >
                              View listing
                            </a>
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
              <button className="secondaryButton" type="button" onClick={() => void generateListingDraft(selectedPart)} disabled={isGeneratingListingDraft}>
                {isGeneratingListingDraft ? 'Generating…' : 'Build Listing Draft'}
              </button>
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
              <button className="secondaryButton" type="button" onClick={() => void generateListingDraft(selectedPart)}>Regenerate</button>
              <button className="secondaryButton" type="button" onClick={() => void saveListingDraft(selectedPart)}>Save Draft</button>
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
                  <input name="condition" value={partFormData.condition} onChange={handlePartFieldChange} placeholder="Good" />
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
                  <span>Cost</span>
                  <input name="cost" type="number" min="0" step="0.01" value={partFormData.cost} onChange={handlePartFieldChange} placeholder="0" />
                </label>
                <label className="field">
                  <span>List Price</span>
                  <input name="listPrice" type="number" min="0" step="0.01" value={partFormData.listPrice} onChange={handlePartFieldChange} placeholder="250" />
                </label>
                <label className="field">
                  <span>Sold Price</span>
                  <input name="soldPrice" type="number" min="0" step="0.01" value={partFormData.soldPrice} onChange={handlePartFieldChange} placeholder="0" />
                </label>
                <label className="field">
                  <span>Weight (lbs)</span>
                  <input name="weight" type="number" min="0" value={partFormData.weight} onChange={handlePartFieldChange} placeholder="25" />
                </label>
                <label className="field">
                  <span>eBay Item ID</span>
                  <input name="ebayItemId" value={partFormData.ebayItemId} onChange={handlePartFieldChange} placeholder="123456789" />
                </label>
                <label className="field">
                  <span>eBay Status</span>
                  <input name="ebayStatus" value={partFormData.ebayStatus} onChange={handlePartFieldChange} placeholder="Not Listed" />
                </label>
                <label className="field">
                  <span>Date Listed</span>
                  <input name="dateListed" value={partFormData.dateListed} onChange={handlePartFieldChange} placeholder="2026-08-06" />
                </label>
                <label className="field">
                  <span>Date Sold</span>
                  <input name="dateSold" value={partFormData.dateSold} onChange={handlePartFieldChange} placeholder="2026-08-07" />
                </label>
                <label className="field">
                  <span>Photo Count</span>
                  <input name="photoCount" type="number" min="0" value={partFormData.photoCount} onChange={handlePartFieldChange} placeholder="0" />
                </label>
              </div>

              <div className="detailCard" style={{ gridColumn: '1 / -1' }}>
                <span>SKU Preview</span>
                <strong>{skuPreview || partFormData.skuPreview || 'Pending generation'}</strong>
                <p className="photoHint">Use the short code below to shape the generated part tag. Leave it blank to use the automatic part-code match.</p>
                <label className="field" style={{ marginTop: '8px' }}>
                  <span>SKU Code</span>
                  <input name="skuCode" value={partFormData.skuCode} onChange={handlePartFieldChange} placeholder="ALT" />
                </label>
              </div>

              <label className="field fullWidth">
                <span>Notes</span>
                <textarea name="notes" value={partFormData.notes} onChange={handlePartFieldChange} placeholder="Add notes for the part, fitment, and condition." rows={4} />
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
                  <p className="photoHint">No photos yet. Add a few images for the part after the record is saved.</p>
                )}
              </div>

              {errorMessage ? (
                <div className="statusBanner error" style={{ marginTop: '12px' }}>
                  {errorMessage}
                </div>
              ) : null}

              {successMessage ? (
                <div className="statusBanner success" style={{ marginTop: '12px' }}>
                  {successMessage}
                </div>
              ) : null}


              <div className="modalActions">
                <button className="secondaryButton" type="button" onClick={handleClosePartModal}>
                  Cancel
                </button>
                <button className="primaryButton" type="submit" disabled={isSavingPart}>
                  {isSavingPart ? 'Saving…' : 'Save Part'}
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
                  <span>Notes</span>
                  <textarea name="notes" value={partFormData.notes} onChange={handleRapidPartFieldChange} placeholder="Optional fitment or damage notes." rows={3} />
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
              <button className="secondaryButton" type="button" onClick={() => setShouldAutoPrintTag(true)}>
                Print Current Mode
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

