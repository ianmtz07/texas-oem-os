export type ListingDraft = {
  id?: string
  partId?: string | null
  title?: string | null
  seoSubtitle?: string | null
  conditionDescription?: string | null
  description?: string | null
  categorySuggestion?: string | null
  itemSpecifics?: Record<string, unknown> | null
  compatibilityNotes?: string | null
  keywords?: string[] | string | null
  shippingRecommendation?: string | null
  estimatedWeight?: string | null
  estimatedDimensions?: string | null
  aiConfidence?: number | null
  ocrResults?: string | null
  imageAnalysis?: string | null
  needsMorePhotos?: boolean | null
  pricingStatus?: string | null
  draftStatus?: string | null
  generatedAt?: string | null
  updatedAt?: string | null
}

export type ListingDraftHistory = {
  id?: string
  listingDraftId?: string | null
  title?: string | null
  conditionDescription?: string | null
  description?: string | null
  itemSpecifics?: Record<string, unknown> | null
  changedAt?: string | null
  changeReason?: string | null
}

export function createDefaultListingDraft() {
  return {
    title: '',
    seoSubtitle: '',
    conditionDescription: '',
    description: '',
    categorySuggestion: 'Suggestion pending eBay category validation',
    itemSpecifics: {},
    compatibilityNotes: 'Compatibility should be verified by the buyer.',
    keywords: [],
    shippingRecommendation: 'Use insured shipping and packaging protection.',
    estimatedWeight: 'TBD',
    estimatedDimensions: 'TBD',
    aiConfidence: 0,
    ocrResults: '',
    imageAnalysis: '',
    needsMorePhotos: false,
    pricingStatus: 'Pending eBay sold-data access',
    draftStatus: 'Draft',
  }
}

export function normalizeServerListingDraft(payload?: Record<string, unknown> | null, fallback: Partial<ListingDraft> = {}) {
  const base = createDefaultListingDraft()
  const draft = payload && typeof payload === 'object' ? payload : {}

  const title = typeof draft.title === 'string' && draft.title.trim() ? draft.title : fallback.title ?? base.title
  const seoSubtitle = typeof draft.seoSubtitle === 'string' && draft.seoSubtitle.trim() ? draft.seoSubtitle : fallback.seoSubtitle ?? base.seoSubtitle
  const conditionDescription = typeof draft.conditionDescription === 'string' && draft.conditionDescription.trim() ? draft.conditionDescription : fallback.conditionDescription ?? base.conditionDescription
  const description = typeof draft.description === 'string' && draft.description.trim() ? draft.description : fallback.description ?? base.description
  const categorySuggestion = typeof draft.categorySuggestion === 'string' && draft.categorySuggestion.trim() ? draft.categorySuggestion : fallback.categorySuggestion ?? base.categorySuggestion
  const itemSpecifics = draft.itemSpecifics && typeof draft.itemSpecifics === 'object' ? draft.itemSpecifics as Record<string, unknown> : (fallback.itemSpecifics ?? base.itemSpecifics)
  const compatibilityNotes = typeof draft.compatibilityNotes === 'string' && draft.compatibilityNotes.trim() ? draft.compatibilityNotes : fallback.compatibilityNotes ?? base.compatibilityNotes
  const keywords = Array.isArray(draft.keywords)
    ? draft.keywords.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : typeof draft.keywords === 'string' && draft.keywords.trim()
      ? draft.keywords.split(',').map((value) => value.trim()).filter(Boolean)
      : (Array.isArray(fallback.keywords) ? fallback.keywords : (typeof fallback.keywords === 'string' ? fallback.keywords.split(',').map((value) => value.trim()).filter(Boolean) : base.keywords))
  const shippingRecommendation = typeof draft.shippingRecommendation === 'string' && draft.shippingRecommendation.trim() ? draft.shippingRecommendation : fallback.shippingRecommendation ?? base.shippingRecommendation
  const estimatedWeight = typeof draft.estimatedWeight === 'string' && draft.estimatedWeight.trim() ? draft.estimatedWeight : fallback.estimatedWeight ?? base.estimatedWeight
  const estimatedDimensions = typeof draft.estimatedDimensions === 'string' && draft.estimatedDimensions.trim() ? draft.estimatedDimensions : fallback.estimatedDimensions ?? base.estimatedDimensions
  const aiConfidence = typeof draft.aiConfidence === 'number' ? draft.aiConfidence : (typeof fallback.aiConfidence === 'number' ? fallback.aiConfidence : base.aiConfidence)
  const ocrResults = typeof draft.ocrResults === 'string' ? draft.ocrResults : fallback.ocrResults ?? base.ocrResults
  const imageAnalysis = typeof draft.imageAnalysis === 'string' ? draft.imageAnalysis : fallback.imageAnalysis ?? base.imageAnalysis
  const needsMorePhotos = typeof draft.needsMorePhotos === 'boolean' ? draft.needsMorePhotos : (typeof fallback.needsMorePhotos === 'boolean' ? fallback.needsMorePhotos : base.needsMorePhotos)

  return {
    ...base,
    ...fallback,
    title,
    seoSubtitle,
    conditionDescription,
    description,
    categorySuggestion,
    itemSpecifics,
    compatibilityNotes,
    keywords,
    shippingRecommendation,
    estimatedWeight,
    estimatedDimensions,
    aiConfidence,
    ocrResults,
    imageAnalysis,
    needsMorePhotos,
  }
}

export function buildFallbackListingDraft(input: {
  part?: {
    partName?: string | null
    partNumber?: string | null
    interchangeNumber?: string | null
    sku?: string | null
    condition?: string | null
    notes?: string | null
  }
  vehicle?: {
    year?: string | null
    make?: string | null
    model?: string | null
    trim?: string | null
    vin?: string | null
  } | null
  primaryPhotoUrl?: string | null
  photoUrls?: Array<string | null | undefined>
}) {
  const partName = input.part?.partName ?? 'Auto part'
  const partNumber = input.part?.partNumber ?? 'N/A'
  const interchangeNumber = input.part?.interchangeNumber ?? 'N/A'
  const sku = input.part?.sku ?? 'N/A'
  const condition = input.part?.condition ?? 'Used'
  const notes = input.part?.notes?.trim() ? input.part.notes : 'Condition and fitment should be verified before sale.'
  const vehicleLabel = [input.vehicle?.year, input.vehicle?.make, input.vehicle?.model, input.vehicle?.trim].filter(Boolean).join(' ').trim() || 'vehicle'
  const vin = input.vehicle?.vin ?? 'VIN pending'
  const photoCount = (input.photoUrls ?? []).filter((value): value is string => Boolean(value)).length

  return {
    ...createDefaultListingDraft(),
    title: `${partName} for ${vehicleLabel}`,
    conditionDescription: `${condition} part pulled from ${vehicleLabel}.`,
    description: `This ${partName.toLowerCase()} is being offered as a ${condition.toLowerCase()} part for ${vehicleLabel}. OEM part number ${partNumber}. Interchange ${interchangeNumber}. Notes: ${notes}. VIN: ${vin}.`,
    categorySuggestion: 'Auto Parts > Engine / Drivetrain / Electrical (verify category before listing)',
    itemSpecifics: {
      OEMPartNumber: partNumber,
      InterchangeNumber: interchangeNumber,
      SKU: sku,
      Condition: condition,
      Vehicle: vehicleLabel,
      VIN: vin,
      Photos: photoCount,
    },
    compatibilityNotes: `Confirm fitment for ${vehicleLabel} before shipment.`,
    pricingStatus: 'Pending eBay sold-data access',
    draftStatus: 'Draft',
  }
}
