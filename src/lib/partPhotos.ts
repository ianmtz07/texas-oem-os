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
     * TEXAS OEM PRODUCT PHOTO ENHANCEMENT
     *
     * Background-aware version.
     *
     * Instead of whitening every light pixel, identify
     * the connected studio background starting from the
     * outside edges of the photo. This protects the part
     * itself while allowing a much cleaner white backdrop.
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
    const imageWidth = canvas.width
    const imageHeight = canvas.height
    const pixelCount = imageWidth * imageHeight

    const backgroundMask =
      new Uint8Array(pixelCount)

    const queue =
      new Int32Array(pixelCount)

    let queueStart = 0
    let queueEnd = 0

    const isBackgroundCandidate = (
      pixelNumber: number,
    ) => {
      const offset =
        pixelNumber * 4

      const red =
        pixels[offset]

      const green =
        pixels[offset + 1]

      const blue =
        pixels[offset + 2]

      const luminance =
        red * 0.2126 +
        green * 0.7152 +
        blue * 0.0722

      const maxChannel =
        Math.max(
          red,
          green,
          blue,
        )

      const minChannel =
        Math.min(
          red,
          green,
          blue,
        )

      const chroma =
        maxChannel -
        minChannel

      /*
       * The booth is light and mostly neutral.
       * This threshold is intentionally wide enough
       * to include your current off-white background.
       */
      return (
        luminance >= 145 &&
        chroma <= 52
      )
    }

    const addBackgroundPixel = (
      pixelNumber: number,
    ) => {
      if (
        pixelNumber < 0 ||
        pixelNumber >= pixelCount ||
        backgroundMask[pixelNumber]
      ) {
        return
      }

      if (
        !isBackgroundCandidate(
          pixelNumber,
        )
      ) {
        return
      }

      backgroundMask[
        pixelNumber
      ] = 1

      queue[
        queueEnd++
      ] = pixelNumber
    }

    /*
     * Seed the flood fill from all four outer edges.
     */
    for (
      let x = 0;
      x < imageWidth;
      x += 1
    ) {
      addBackgroundPixel(x)

      addBackgroundPixel(
        (imageHeight - 1) *
          imageWidth +
          x,
      )
    }

    for (
      let y = 0;
      y < imageHeight;
      y += 1
    ) {
      addBackgroundPixel(
        y * imageWidth,
      )

      addBackgroundPixel(
        y * imageWidth +
          imageWidth -
          1,
      )
    }

    /*
     * Grow only through connected booth/background pixels.
     */
    while (
      queueStart <
      queueEnd
    ) {
      const pixelNumber =
        queue[
          queueStart++
        ]

      const x =
        pixelNumber %
        imageWidth

      const y =
        Math.floor(
          pixelNumber /
            imageWidth,
        )

      if (x > 0) {
        addBackgroundPixel(
          pixelNumber - 1,
        )
      }

      if (
        x <
        imageWidth - 1
      ) {
        addBackgroundPixel(
          pixelNumber + 1,
        )
      }

      if (y > 0) {
        addBackgroundPixel(
          pixelNumber -
            imageWidth,
        )
      }

      if (
        y <
        imageHeight - 1
      ) {
        addBackgroundPixel(
          pixelNumber +
            imageWidth,
        )
      }
    }

    /*
     * Apply the final product-photo treatment.
     */
    for (
      let pixelNumber = 0;
      pixelNumber < pixelCount;
      pixelNumber += 1
    ) {
      const offset =
        pixelNumber * 4

      let red =
        pixels[offset]

      let green =
        pixels[offset + 1]

      let blue =
        pixels[offset + 2]

      if (
        backgroundMask[
          pixelNumber
        ]
      ) {
        /*
         * Strong white-background cleanup.
         *
         * Preserve a small amount of natural shading so
         * the item does not look artificially cut out.
         */
        const luminance =
          red * 0.2126 +
          green * 0.7152 +
          blue * 0.0722

        const whiteningStrength =
          luminance >= 205
            ? 0.88
            : luminance >= 175
              ? 0.78
              : 0.66

        red +=
          (255 - red) *
          whiteningStrength

        green +=
          (255 - green) *
          whiteningStrength

        blue +=
          (255 - blue) *
          whiteningStrength
      } else {
        /*
         * Part itself:
         * slightly richer blacks and better midtone
         * separation without changing its actual color.
         */
        const luminance =
          red * 0.2126 +
          green * 0.7152 +
          blue * 0.0722

        let targetLuminance =
          luminance

        if (
          luminance < 90
        ) {
          targetLuminance =
            luminance * 0.95
        } else if (
          luminance < 190
        ) {
          targetLuminance =
            90 +
            (
              luminance -
              90
            ) *
              1.055
        }

        const scale =
          luminance > 1
            ? targetLuminance /
              luminance
            : 1

        red *= scale
        green *= scale
        blue *= scale
      }

      pixels[offset] =
        Math.max(
          0,
          Math.min(
            255,
            Math.round(red),
          ),
        )

      pixels[
        offset + 1
      ] =
        Math.max(
          0,
          Math.min(
            255,
            Math.round(green),
          ),
        )

      pixels[
        offset + 2
      ] =
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
