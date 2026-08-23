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
     * TEXAS OEM CLEAN PRODUCT PHOTO PASS
     *
     * Intentionally restrained:
     * - neutral color
     * - slightly deeper blacks
     * - cleaner/brighter midtones
     * - gentle highlight lift
     * - no fake background whitening
     * - no saturation boost
     */

    context.drawImage(
      imageBitmap,
      0,
      0,
      canvas.width,
      canvas.height,
    )

    const imageData = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    )

    const pixels = imageData.data

    for (
      let index = 0;
      index < pixels.length;
      index += 4
    ) {
      let red = pixels[index]
      let green = pixels[index + 1]
      let blue = pixels[index + 2]

      const luminance =
        red * 0.2126 +
        green * 0.7152 +
        blue * 0.0722

      const maxChannel = Math.max(
        red,
        green,
        blue,
      )

      const minChannel = Math.min(
        red,
        green,
        blue,
      )

      const chroma =
        maxChannel - minChannel

      /*
       * Dark automotive plastics:
       * slightly deeper, but preserve detail.
       */
      if (luminance < 105) {
        const target =
          luminance * 0.96

        const scale =
          luminance > 1
            ? target / luminance
            : 1

        red *= scale
        green *= scale
        blue *= scale
      }

      /*
       * General midtones:
       * gentle contrast/clarity lift.
       */
      else if (
        luminance < 165
      ) {
        const target =
          105 +
          (luminance - 105) *
            1.07

        const scale =
          target / luminance

        red *= scale
        green *= scale
        blue *= scale
      }

      /*
       * White/light booth background:
       * progressively blend toward neutral white.
       *
       * Low chroma prevents colorful parts from
       * being washed out.
       */
      else if (chroma < 42) {
        const progress =
          Math.max(
            0,
            Math.min(
              1,
              (luminance - 165) /
                90,
            ),
          )

        const smooth =
          progress *
          progress *
          (3 - 2 * progress)

        const strength =
          0.28 +
          smooth * 0.42

        red =
          red +
          (250 - red) *
            strength

        green =
          green +
          (250 - green) *
            strength

        blue =
          blue +
          (250 - blue) *
            strength
      }

      /*
       * Bright colored/high-chroma pixels:
       * small exposure lift only.
       */
      else {
        const lift = 1.035

        red *= lift
        green *= lift
        blue *= lift
      }

      pixels[index] =
        Math.max(
          0,
          Math.min(
            255,
            Math.round(red),
          ),
        )

      pixels[index + 1] =
        Math.max(
          0,
          Math.min(
            255,
            Math.round(green),
          ),
        )

      pixels[index + 2] =
        Math.max(
          0,
          Math.min(
            255,
            Math.round(blue),
          ),
        )
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
