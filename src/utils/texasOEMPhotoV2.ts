const OUTPUT_MAX = 1600

type RGB = {
  r: number
  g: number
  b: number
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, value))
}

function percentile(values: number[], p: number) {
  if (!values.length) return 255

  values.sort((a, b) => a - b)

  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.floor(values.length * p)),
  )

  return values[index]
}

function estimateBackgroundWhite(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): RGB {
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []

  /*
   * Sample mostly around the perimeter of the photo.
   * In the Texas OEM booth these areas should normally
   * represent the white/neutral booth rather than the part.
   */
  const edgeX = Math.max(1, Math.floor(width * 0.16))
  const edgeY = Math.max(1, Math.floor(height * 0.16))
  const step = Math.max(1, Math.floor(Math.min(width, height) / 180))

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const onEdge =
        x < edgeX ||
        x >= width - edgeX ||
        y < edgeY ||
        y >= height - edgeY

      if (!onEdge) continue

      const i = (y * width + x) * 4

      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)

      /*
       * Ignore obviously dark/object pixels.
       * Keep reasonably bright, low/moderate saturation
       * pixels that are likely part of the booth.
       */
      if (
        max >= 145 &&
        max - min <= 75
      ) {
        rs.push(r)
        gs.push(g)
        bs.push(b)
      }
    }
  }

  return {
    r: percentile(rs, 0.72),
    g: percentile(gs, 0.72),
    b: percentile(bs, 0.72),
  }
}

export async function createTexasOEMPhotoV2(
  originalFile: File,
): Promise<Blob> {
  const bitmap = await createImageBitmap(originalFile)

  try {
    const scale = Math.min(
      1,
      OUTPUT_MAX /
        Math.max(bitmap.width, bitmap.height),
    )

    const width = Math.max(
      1,
      Math.round(bitmap.width * scale),
    )

    const height = Math.max(
      1,
      Math.round(bitmap.height * scale),
    )

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d', {
      willReadFrequently: true,
    })

    if (!ctx) {
      throw new Error('Could not create V2 photo canvas.')
    }

    ctx.drawImage(bitmap, 0, 0, width, height)

    const image = ctx.getImageData(
      0,
      0,
      width,
      height,
    )

    const data = image.data

    const white = estimateBackgroundWhite(
      data,
      width,
      height,
    )

    /*
     * Neutralize the measured booth color.
     *
     * Gain is deliberately capped so a weird photo
     * cannot cause an extreme color correction.
     */
    const targetWhite = 238

    const rGain = Math.min(
      1.22,
      Math.max(0.88, targetWhite / Math.max(1, white.r)),
    )

    const gGain = Math.min(
      1.22,
      Math.max(0.88, targetWhite / Math.max(1, white.g)),
    )

    const bGain = Math.min(
      1.22,
      Math.max(0.88, targetWhite / Math.max(1, white.b)),
    )

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] * rGain
      let g = data[i + 1] * gGain
      let b = data[i + 2] * bGain

      /*
       * Gentle luminance curve:
       * - preserve blacks
       * - slightly open midtones
       * - push already-light booth pixels cleaner
       */
      const luminance =
        0.2126 * r +
        0.7152 * g +
        0.0722 * b

      let lift = 1

      if (luminance >= 210) {
        lift = 1.055
      } else if (luminance >= 150) {
        lift = 1.025
      } else if (luminance >= 70) {
        lift = 1.012
      }

      r *= lift
      g *= lift
      b *= lift

      data[i] = clamp(r)
      data[i + 1] = clamp(g)
      data[i + 2] = clamp(b)
    }

    ctx.putImageData(image, 0, 0)

    return await new Promise<Blob>(
      (resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(
                new Error(
                  'Could not create Texas OEM V2 JPEG.',
                ),
              )
            }
          },
          'image/jpeg',
          0.92,
        )
      },
    )
  } finally {
    bitmap.close()
  }
}
