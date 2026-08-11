export type PartPhoto = {
  id: string
  partId: string
  storagePath: string
  publicUrl?: string | null
  isPrimary: boolean
  sortOrder: number
  createdAt?: string | null
}

const supportedImageTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
const supportedImageExtensions: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.webp': 'image/webp',
}
const maxPhotoCount = 15
const maxPhotoBytes = 8 * 1024 * 1024

export function buildPartPhotoStoragePath(vehicleId: string, partId: string, fileName: string) {
  const safeVehicleId = (vehicleId || 'vehicle').trim().replace(/[^a-zA-Z0-9._-]+/g, '-')
  const safePartId = (partId || 'part').trim().replace(/[^a-zA-Z0-9._-]+/g, '-')
  const safeFileName = (fileName || 'photo').trim().replace(/[^a-zA-Z0-9._-]+/g, '-')
  const timestamp = Date.now()
  return `${safeVehicleId}/${safePartId}/${timestamp}-${safeFileName}`
}

function getNormalizedImageType(file: File) {
  const rawType = (file.type || '').trim().toLowerCase()
  if (supportedImageTypes.includes(rawType)) {
    return rawType
  }

  const extension = (file.name || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0]
  return extension ? supportedImageExtensions[extension] ?? '' : ''
}

export function getPhotoValidationError(file: File, photoCount: number, pendingCount = 0) {
  const normalizedType = getNormalizedImageType(file)
  if (!normalizedType) {
    return 'Unsupported image type. Please upload JPEG, PNG, HEIC, HEIF, or WebP images.'
  }

  if (file.size > maxPhotoBytes) {
    return 'Image is larger than 8MB after compression. Please choose a smaller image.'
  }

  if (photoCount + pendingCount > maxPhotoCount) {
    return `You can only upload up to ${maxPhotoCount} photos per part.`
  }

  return null
}

export async function compressImage(file: File, maxWidth = 1600) {
  const normalizedType = getNormalizedImageType(file)
  if (!normalizedType || !file.type.startsWith('image/')) {
    return file
  }

  try {
    const imageBitmap = await createImageBitmap(file)
    const width = imageBitmap.width
    const height = imageBitmap.height
    const scale = Math.min(1, maxWidth / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')

    if (!context) {
      imageBitmap.close()
      return file
    }

    context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height)

    const watermark = new Image()
    watermark.src = '/texas-oem-watermark.png'
    await watermark.decode()

    const watermarkWidth = Math.round(canvas.width * 0.17)
    const watermarkHeight = Math.round(
      watermarkWidth * (watermark.naturalHeight / watermark.naturalWidth),
    )
    const margin = Math.round(canvas.width * 0.02)

    context.save()
    context.globalAlpha = 0.72
    context.drawImage(
      watermark,
      canvas.width - watermarkWidth - margin,
      margin,
      watermarkWidth,
      watermarkHeight,
    )
    context.restore()
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result)
        } else {
          reject(new Error('Unable to compress image.'))
        }
      }, normalizedType || 'image/jpeg', 0.9)
    })

    imageBitmap.close()
    return new File([blob], file.name, { type: blob.type || normalizedType })
  } catch {
    return file
  }
}
