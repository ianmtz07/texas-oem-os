import { describe, expect, it } from 'vitest'
import { buildFallbackListingDraft } from './listingDraft'

describe('buildFallbackListingDraft', () => {
  it('creates a usable draft from vehicle and part details', () => {
    const draft = buildFallbackListingDraft({
      part: {
        partName: 'Radiator',
        partNumber: '123456',
        interchangeNumber: 'ABC-789',
        sku: 'ABC-789',
        condition: 'Used',
        notes: 'Needs cleaning',
      },
      vehicle: {
        year: '2020',
        make: 'Ford',
        model: 'F-150',
        trim: 'XLT',
        vin: '1FTFW1EF4LFA12345',
      },
      primaryPhotoUrl: 'https://example.com/photo.jpg',
      photoUrls: ['https://example.com/photo.jpg'],
    })

    expect(draft.title).toContain('Radiator')
    expect(draft.description).toContain('radiator')
    expect(draft.itemSpecifics).toMatchObject({
      OEMPartNumber: '123456',
      InterchangeNumber: 'ABC-789',
      SKU: 'ABC-789',
    })
    expect(draft.draftStatus).toBe('Draft')
  })
})
