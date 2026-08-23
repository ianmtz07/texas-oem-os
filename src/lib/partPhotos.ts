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
const maxSourcePhotoBytes = 25 * 1024 * 1024

export function buildPartPhotoStoragePath(
  vehicleId: string,
  partId: string,
  fileName: string,
) {
  const safeVehicleId = (vehicleId || 'vehicle')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')

  const safePartId = (partId || 'part')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')

  const safeFileName = (fileName || 'photo')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')

  const timestamp = Date.now()

  return `${safeVehicleId}/${safePartId}/${timestamp}-${safeFileName}`
}

function getNormalizedImageType(file: File) {
  const rawType = (file.type || '').trim().toLowerCase()

  if (supportedImageTypes.includes(rawType)) {
    return rawType
  }

  const extension = (file.name || '')
    .toLowerCase()
    .match(/\.[a-z0-9]+$/)?.[0]

  return extension ? supportedImageExtensions[extension] ?? '' : ''
}

export function getPhotoValidationError(
  file: File,
  photoCount: number,
  pendingCount = 0,
) {
  const normalizedType = getNormalizedImageType(file)

  if (!normalizedType) {
    return 'Unsupported image type. Please upload JPEG, PNG, HEIC, HEIF, or WebP images.'
  }

  if (file.size > maxSourcePhotoBytes) {
    return 'Image is larger than 25MB. Please choose a smaller image.'
  }

  if (photoCount + pendingCount >= maxPhotoCount) {
    return `You can only upload up to ${maxPhotoCount} photos per part.`
  }

  return null
}

function makeJpegFileName(fileName: string) {
  const baseName = (fileName || 'photo')
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .trim()

  return `${baseName || 'photo'}.jpg`
}

export async function compressImage(file: File, maxWidth = 1600) {
  const normalizedType = getNormalizedImageType(file)

  if (!normalizedType) {
    return file
  }

  try {
    const imageBitmap = await createImageBitmap(file)

    const width = imageBitmap.width
    const height = imageBitmap.height

    const scale = Math.min(
      1,
      maxWidth / Math.max(width, height),
    )

    const canvas = document.createElement('canvas')

    canvas.width = Math.max(
      1,
      Math.round(width * scale),
    )

    canvas.height = Math.max(
      1,
      Math.round(height * scale),
    )

    const context = canvas.getContext('2d')

    if (!context) {
      imageBitmap.close()
      throw new Error('Unable to prepare photo.')
    }

    /*
     * JPEG does not support transparency.
     * Fill the background first so PNG/WebP images
     * do not turn black after conversion.
     */
    context.fillStyle = '#ffffff'
    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height,
    )

    /*
     * TEXAS OEM automatic photo enhancement.
     *
     * Keep this intentionally conservative:
     * - slight exposure lift
     * - moderate contrast improvement
     * - slight color boost
     *
     * This happens BEFORE the watermark so the
     * watermark itself is not altered.
     */
    /*
     * Draw original pixels first.
     */
    context.drawImage(
      imageBitmap,
      0,
      0,
      canvas.width,
      canvas.height,
    )

    /*
     * TEXAS OEM automatic photo enhancement.
     *
     * Goal:
     * - cleaner white background
     * - deeper blacks
     * - stronger definition
     * - richer but realistic color
     * - improved clarity without looking fake
     */

    const imageData = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    )

    const pixels = imageData.data

    const brightness = 10
    const contrast = 1.16
    const saturation = 1.10

    for (
      let index = 0;
      index < pixels.length;
      index += 4
    ) {
      let red = pixels[index]
      let green = pixels[index + 1]
      let blue = pixels[index + 2]

      red += brightness
      green += brightness
      blue += brightness

      red =
        (red - 128) * contrast +
        128

      green =
        (green - 128) * contrast +
        128

      blue =
        (blue - 128) * contrast +
        128

      const luminance =
        red * 0.2126 +
        green * 0.7152 +
        blue * 0.0722

      red =
        luminance +
        (red - luminance) *
          saturation

      green =
        luminance +
        (green - luminance) *
          saturation

      blue =
        luminance +
        (blue - luminance) *
          saturation

      pixels[index] = Math.max(
        0,
        Math.min(
          255,
          Math.round(red),
        ),
      )

      pixels[index + 1] = Math.max(
        0,
        Math.min(
          255,
          Math.round(green),
        ),
      )

      pixels[index + 2] = Math.max(
        0,
        Math.min(
          255,
          Math.round(blue),
        ),
      )
    }

    const sourcePixels =
      new Uint8ClampedArray(
        pixels,
      )

    const sharpenWidth = canvas.width
    const sharpenHeight = canvas.height

    const sharpenAmount = 0.28

    for (
      let y = 1;
      y < sharpenHeight - 1;
      y += 1
    ) {
      for (
        let x = 1;
        x < sharpenWidth - 1;
        x += 1
      ) {
        const pixelIndex =
          (y * sharpenWidth + x) * 4

        const northIndex =
          ((y - 1) * sharpenWidth + x) *
          4

        const southIndex =
          ((y + 1) * sharpenWidth + x) *
          4

        const westIndex =
          (y * sharpenWidth + (x - 1)) *
          4

        const eastIndex =
          (y * sharpenWidth + (x + 1)) *
          4

        for (
          let channel = 0;
          channel < 3;
          channel += 1
        ) {
          const center =
            sourcePixels[
              pixelIndex + channel
            ]

          const blurred =
            (
              sourcePixels[
                northIndex + channel
              ] +
              sourcePixels[
                southIndex + channel
              ] +
              sourcePixels[
                westIndex + channel
              ] +
              sourcePixels[
                eastIndex + channel
              ]
            ) / 4

          const sharpened =
            center +
            sharpenAmount *
              (center - blurred)

          pixels[
            pixelIndex + channel
          ] = Math.max(
            0,
            Math.min(
              255,
              Math.round(sharpened),
            ),
          )
        }
      }
    }

    context.putImageData(
      imageData,
      0,
      0,
    )

    const watermark = new Image()
    watermark.src = '/texas-oem-watermark.png'
    await watermark.decode()

    const watermarkWidth = Math.round(
      canvas.width * 0.17,
    )

    const watermarkHeight = Math.round(
      watermarkWidth *
        (watermark.naturalHeight /
          watermark.naturalWidth),
    )

    const margin = Math.round(
      canvas.width * 0.02,
    )

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

    const blob = await new Promise<Blob>(
      (resolve, reject) => {
        canvas.toBlob(
          (result) => {
            if (result) {
              resolve(result)
            } else {
              reject(
                new Error(
                  'Unable to create JPEG photo.',
                ),
              )
            }
          },
          'image/jpeg',
          0.9,
        )
      },
    )

    imageBitmap.close()

    return new File(
      [blob],
      makeJpegFileName(file.name),
      {
        type: 'image/jpeg',
        lastModified: Date.now(),
      },
    )
  } catch (error) {
    console.error(
      '[part-photos] image processing failed',
      error,
    )

    throw new Error(
      `Unable to process ${file.name}. Please try taking the photo again.`,
    )
  }
}
