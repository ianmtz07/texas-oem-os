import { describe, expect, it } from 'vitest'
import { buildPartPhotoStoragePath, getPhotoValidationError } from './partPhotos'

describe('part photo helpers', () => {
  it('builds a storage path with vehicle and part segments', () => {
    const path = buildPartPhotoStoragePath('vehicle-123', 'part-456', 'IMG_001.JPG')

    expect(path).toContain('vehicle-123/part-456/')
    expect(path).toContain('IMG_001.JPG')
  })

  it('rejects unsupported photo files and overly large batches', () => {
    const unsupported = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    expect(getPhotoValidationError(unsupported, 0, 0)).toContain('Unsupported image type')

    const oversized = new File([new Uint8Array(1024 * 1024 * 16)], 'photo.jpg', { type: 'image/jpeg' })
    expect(getPhotoValidationError(oversized, 0, 0)).toContain('larger than 8MB')
  })
})
