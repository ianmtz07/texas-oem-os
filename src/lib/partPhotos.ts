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
     * Designed for automotive parts:
     * - neutral white balance
     * - cleaner white booth background
     * - deeper blacks
     * - stronger local definition
     * - restrained color
     * - truthful part condition
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

    /*
     * STEP 1 — Estimate the color of the booth/background.
     *
     * Only sample pixels that are already bright and
     * reasonably neutral so the actual part colors do
     * not control white balance.
     */
    let whiteRed = 0
    let whiteGreen = 0
    let whiteBlue = 0
    let whiteSamples = 0

    for (
      let index = 0;
      index < pixels.length;
      index += 64
    ) {
      const red = pixels[index]
      const green = pixels[index + 1]
      const blue = pixels[index + 2]

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

      if (
        luminance > 185 &&
        chroma < 45
      ) {
        whiteRed += red
        whiteGreen += green
        whiteBlue += blue
        whiteSamples += 1
      }
    }

    let redGain = 1
    let greenGain = 1
    let blueGain = 1

    if (whiteSamples > 20) {
      const averageRed =
        whiteRed / whiteSamples

      const averageGreen =
        whiteGreen / whiteSamples

      const averageBlue =
        whiteBlue / whiteSamples

      const neutralTarget =
        (
          averageRed +
          averageGreen +
          averageBlue
        ) / 3

      redGain =
        neutralTarget /
        Math.max(1, averageRed)

      greenGain =
        neutralTarget /
        Math.max(1, averageGreen)

      blueGain =
        neutralTarget /
        Math.max(1, averageBlue)

      /*
       * Prevent aggressive automatic white balance.
       */
      redGain = Math.max(
        0.92,
        Math.min(1.08, redGain),
      )

      greenGain = Math.max(
        0.92,
        Math.min(1.08, greenGain),
      )

      blueGain = Math.max(
        0.92,
        Math.min(1.08, blueGain),
      )
    }

    /*
     * STEP 2 — Tonal correction.
     *
     * Adjust luminance instead of blindly increasing
     * every RGB channel. This keeps colors much more
     * natural.
     */
    for (
      let index = 0;
      index < pixels.length;
      index += 4
    ) {
      let red =
        pixels[index] * redGain

      let green =
        pixels[index + 1] *
        greenGain

      let blue =
        pixels[index + 2] *
        blueGain

      const originalLuminance =
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

      let targetLuminance =
        originalLuminance

      /*
       * Richer blacks.
       */
      if (originalLuminance < 72) {
        targetLuminance =
          originalLuminance * 0.92
      }

      /*
       * Better midtone separation.
       */
      if (
        originalLuminance >= 72 &&
        originalLuminance < 190
      ) {
        targetLuminance =
          72 +
          (originalLuminance - 72) *
            1.08
      }

      /*
       * Lift bright areas toward clean white.
       */
      if (originalLuminance >= 190) {
        targetLuminance =
          originalLuminance +
          (255 - originalLuminance) *
            0.22
      }

      /*
       * Near-neutral bright pixels are probably
       * booth/background. Clean those more strongly.
       */
      if (
        originalLuminance > 205 &&
        chroma < 32
      ) {
        targetLuminance =
          targetLuminance +
          (252 - targetLuminance) *
            0.42
      }

      const luminanceScale =
        originalLuminance > 1
          ? targetLuminance /
            originalLuminance
          : 1

      red *= luminanceScale
      green *= luminanceScale
      blue *= luminanceScale

      /*
       * Tiny color boost only.
       * We do NOT want cartoon saturation.
       */
      const adjustedLuminance =
        red * 0.2126 +
        green * 0.7152 +
        blue * 0.0722

      const saturation = 1.025

      red =
        adjustedLuminance +
        (red - adjustedLuminance) *
          saturation

      green =
        adjustedLuminance +
        (green - adjustedLuminance) *
          saturation

      blue =
        adjustedLuminance +
        (blue - adjustedLuminance) *
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

    /*
     * STEP 3 — Mild unsharp-mask style sharpening.
     *
     * Helps OEM lettering, switches, casting marks,
     * edges and connectors without making scratches
     * or noise look ridiculous.
     */
    const sourcePixels =
      new Uint8ClampedArray(
        pixels,
      )

    const sharpenWidth =
      canvas.width

    const sharpenHeight =
      canvas.height

    const sharpenAmount = 0.18

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
          (y * sharpenWidth + x) *
          4

        const northIndex =
          ((y - 1) *
            sharpenWidth +
            x) *
          4

        const southIndex =
          ((y + 1) *
            sharpenWidth +
            x) *
          4

        const westIndex =
          (y * sharpenWidth +
            (x - 1)) *
          4

        const eastIndex =
          (y * sharpenWidth +
            (x + 1)) *
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

          const neighborhood =
            (
              sourcePixels[
                northIndex +
                  channel
              ] +
              sourcePixels[
                southIndex +
                  channel
              ] +
              sourcePixels[
                westIndex +
                  channel
              ] +
              sourcePixels[
                eastIndex +
                  channel
              ]
            ) / 4

          const sharpened =
            center +
            sharpenAmount *
              (
                center -
                neighborhood
              )

          pixels[
            pixelIndex + channel
          ] = Math.max(
            0,
            Math.min(
              255,
              Math.round(
                sharpened,
              ),
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
