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
  onPassOne?: (blob: Blob) => void,
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

      const luminance =
        0.2126 * r +
        0.7152 * g +
        0.0722 * b

      const maxChannel = Math.max(r, g, b)
      const minChannel = Math.min(r, g, b)
      const chroma = maxChannel - minChannel

      /*
       * TEXAS OEM BOOTH CLEANUP
       *
       * The booth is bright and relatively neutral.
       * Used OEM parts are normally darker and/or
       * substantially more textured/colorful.
       *
       * This gives us a soft background mask WITHOUT
       * segmentation or removing/replacing the product.
       */
      const brightnessConfidence =
        Math.max(
          0,
          Math.min(
            1,
            (luminance - 145) / 75,
          ),
        )

      const neutralityConfidence =
        Math.max(
          0,
          Math.min(
            1,
            1 - chroma / 70,
          ),
        )

      const backgroundConfidence =
        brightnessConfidence *
        neutralityConfidence

      /*
       * Neutralize yellow/cream booth contamination.
       * Yellow cast generally means red + green are
       * elevated relative to blue.
       */
      const yellowAmount =
        Math.max(
          0,
          ((r + g) / 2) - b,
        )

      const yellowCorrection =
        yellowAmount *
        backgroundConfidence *
        0.95

      r -= yellowCorrection * 0.22
      g -= yellowCorrection * 0.16
      b += yellowCorrection * 0.82

      /*
       * Pull confident booth pixels toward clean white.
       *
       * This is intentionally much stronger than V2.1.
       * It should attack dirty/yellow seams while the
       * dark amplifier receives little or no whitening.
       */
      const whiteStrength =
        backgroundConfidence * 0.68

      r += (250 - r) * whiteStrength
      g += (250 - g) * whiteStrength
      b += (250 - b) * whiteStrength

      /*
       * Mild global polish for the actual product.
       * Do not blow out labels or metallic detail.
       */
      if (luminance >= 70 && luminance < 145) {
        r *= 1.025
        g *= 1.025
        b *= 1.025
      }

      data[i] = clamp(r)
      data[i + 1] = clamp(g)
      data[i + 2] = clamp(b)
    }

    /*
     * TEXAS OEM OPEN-BOOTH FINISH
     *
     * Conservative cleanup only for pixels already proven
     * to be bright, neutral booth.
     *
     * Product and natural shadow are intentionally excluded
     * by the high luminance requirement. This is NOT a
     * segmentation or spatial product-mask operation.
     */
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      const luminance =
        0.2126 * r +
        0.7152 * g +
        0.0722 * b

      const chroma =
        Math.max(r, g, b) -
        Math.min(r, g, b)

      /*
       * Only touch unmistakably bright booth.
       * Shadows and product edges stay below this gate.
       */
      if (
        luminance < 218 ||
        chroma > 32
      ) {
        continue
      }

      const boothConfidence =
        Math.max(
          0,
          Math.min(
            1,
            (luminance - 218) / 24,
          ),
        ) *
        Math.max(
          0,
          Math.min(
            1,
            1 - chroma / 32,
          ),
        )

      /*
       * Gentle finish toward neutral white.
       * Preserve real booth gradients instead of flattening
       * everything into pure white.
       */
      const strength =
        boothConfidence * 0.42

      data[i] = clamp(
        r + (250 - r) * strength,
      )

      data[i + 1] = clamp(
        g + (250 - g) * strength,
      )

      data[i + 2] = clamp(
        b + (250 - b) * strength,
      )
    }

    /*
     * TEXAS OEM V3 — SPATIAL BOOTH REPAIR
     *
     * Pass 1 cleaned pixels that were obviously booth.
     * Pass 2 looks for darker / yellow seam pixels whose
     * SURROUNDINGS strongly indicate that they belong to
     * the booth.
     *
     * Important:
     * - Works from a frozen copy of pass 1.
     * - Does NOT segment or replace the product.
     * - Requires strong bright-background evidence nearby.
     * - Avoids the center/product region unless confidence
     *   is extremely high.
     */

    // PHOTO LAB DIAGNOSTIC: capture exact Pass 1 output.
    if (onPassOne) {
      ctx.putImageData(image, 0, 0)

      const diagnosticBlob = await new Promise<Blob>(
        (resolve, reject) => {
          canvas.toBlob(
            (blob) =>
              blob
                ? resolve(blob)
                : reject(
                    new Error(
                      'Pass 1 diagnostic failed.',
                    ),
                  ),
            'image/jpeg',
            0.92,
          )
        },
      )

      onPassOne(diagnosticBlob)
    }

    /*
     * PASS 1 IS THE FINAL OUTPUT FOR NOW.
     *
     * V3/V4 spatial repair is disabled because testing proved
     * it creates an artificial halo around the product.
     */
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
                  'Could not create Texas OEM JPEG.',
                ),
              )
            }
          },
          'image/jpeg',
          0.92,
        )
      },
    )

    /*
     * Legacy V3/V4 code retained below temporarily while
     * Photo Lab diagnostics are active.
     */
    const passOne = new Uint8ClampedArray(data)

    /*
     * TEXAS OEM V4 — PRODUCT + SHADOW PROTECTION MASK
     *
     * Build the protection mask BEFORE booth repair.
     *
     * Dark product pixels become hard seeds.
     * Mid-gray pixels connected to those seeds become
     * product/contact-shadow candidates.
     *
     * We then grow that protection outward with a soft
     * envelope so the aggressive booth cleaner cannot
     * carve the real shadow into a fake-looking halo.
     */

    const pixelCount = width * height

    const hardMask = new Uint8Array(pixelCount)
    const softMask = new Uint8Array(pixelCount)

    /*
     * 1. Find obvious product pixels.
     *
     * These are deliberately conservative. We are NOT
     * trying to identify the entire object here — just
     * reliable dark seeds from which protection can grow.
     */
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = y * width + x
        const i = pixelIndex * 4

        const r = passOne[i]
        const g = passOne[i + 1]
        const b = passOne[i + 2]

        const luminance =
          0.2126 * r +
          0.7152 * g +
          0.0722 * b

        const maxChannel = Math.max(r, g, b)
        const minChannel = Math.min(r, g, b)
        const chroma = maxChannel - minChannel

        /*
         * Strong dark/midtone product evidence.
         *
         * Allow some colored product pixels as well,
         * but don't classify ordinary bright booth.
         */
        if (
          luminance < 138 ||
          (
            luminance < 170 &&
            chroma > 38
          )
        ) {
          hardMask[pixelIndex] = 255
        }
      }
    }

    /*
     * 2. Grow the hard product mask slightly.
     *
     * This protects brackets, tabs, thin edges and the
     * immediate contact-shadow boundary.
     *
     * Work at a modest radius so we do not swallow booth
     * seams far away from the actual part.
     */
    const hardGrowRadius = Math.max(
      3,
      Math.round(Math.min(width, height) * 0.006),
    )

    const grownHardMask = new Uint8Array(hardMask)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = y * width + x

        if (hardMask[pixelIndex] !== 255) {
          continue
        }

        const minY = Math.max(0, y - hardGrowRadius)
        const maxY = Math.min(
          height - 1,
          y + hardGrowRadius,
        )

        const minX = Math.max(0, x - hardGrowRadius)
        const maxX = Math.min(
          width - 1,
          x + hardGrowRadius,
        )

        for (
          let gy = minY;
          gy <= maxY;
          gy++
        ) {
          for (
            let gx = minX;
            gx <= maxX;
            gx++
          ) {
            const dx = gx - x
            const dy = gy - y

            if (
              dx * dx + dy * dy >
              hardGrowRadius * hardGrowRadius
            ) {
              continue
            }

            grownHardMask[gy * width + gx] = 255
          }
        }
      }
    }

    /*
     * TEXAS OEM V4.2 — SHADOW-QUALIFIED PROTECTION
     *
     * Distance alone is not enough to call something shadow.
     * A nearby pixel must also actually look like a neutral,
     * darker photographic shadow.
     */
    const shadowRadius = Math.max(
      8,
      Math.round(Math.min(width, height) * 0.018),
    )

    const shadowRadiusSq =
      shadowRadius * shadowRadius

    const seedStride = Math.max(
      2,
      Math.round(Math.min(width, height) / 700),
    )

    const proximityMask =
      new Uint8Array(pixelCount)

    /*
     * First build proximity to the protected product.
     * This is ONLY a candidate map — not the final shadow.
     */
    for (
      let y = 0;
      y < height;
      y += seedStride
    ) {
      for (
        let x = 0;
        x < width;
        x += seedStride
      ) {
        const pixelIndex = y * width + x

        if (grownHardMask[pixelIndex] !== 255) {
          continue
        }

        const minY =
          Math.max(0, y - shadowRadius)

        const maxY =
          Math.min(height - 1, y + shadowRadius)

        const minX =
          Math.max(0, x - shadowRadius)

        const maxX =
          Math.min(width - 1, x + shadowRadius)

        for (let sy = minY; sy <= maxY; sy++) {
          for (let sx = minX; sx <= maxX; sx++) {
            const dx = sx - x
            const dy = sy - y
            const distanceSq = dx * dx + dy * dy

            if (distanceSq > shadowRadiusSq) {
              continue
            }

            const distance = Math.sqrt(distanceSq)

            const proximity = Math.round(
              255 * (1 - distance / shadowRadius),
            )

            const si = sy * width + sx

            if (proximity > proximityMask[si]) {
              proximityMask[si] = proximity
            }
          }
        }
      }
    }

    /*
     * Now qualify those nearby pixels by appearance.
     *
     * This is the important V4.2 change:
     * ordinary gray booth does NOT automatically get
     * protected merely because it sits beside the part.
     */
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = y * width + x

        if (grownHardMask[pixelIndex] === 255) {
          softMask[pixelIndex] = 255
          continue
        }

        const proximity =
          proximityMask[pixelIndex] / 255

        if (proximity <= 0) {
          continue
        }

        const i = pixelIndex * 4

        const r = passOne[i]
        const g = passOne[i + 1]
        const b = passOne[i + 2]

        const luminance =
          0.2126 * r +
          0.7152 * g +
          0.0722 * b

        const chroma =
          Math.max(r, g, b) -
          Math.min(r, g, b)

        /*
         * Stronger protection for genuinely dark pixels.
         * Light gray booth loses protection quickly.
         */
        const darknessConfidence =
          Math.max(
            0,
            Math.min(
              1,
              (218 - luminance) / 63,
            ),
          )

        /*
         * Real shadow on the booth should be relatively
         * neutral rather than strongly colored.
         */
        const neutralityConfidence =
          Math.max(
            0,
            Math.min(
              1,
              1 - chroma / 55,
            ),
          )

        const shadowConfidence =
          proximity *
          darknessConfidence *
          darknessConfidence *
          neutralityConfidence

        if (shadowConfidence < 0.08) {
          continue
        }

        softMask[pixelIndex] =
          Math.round(
            255 *
              Math.min(1, shadowConfidence),
          )
      }
    }

    /*
     * Hard product protection always wins.
     */
    for (let i = 0; i < pixelCount; i++) {
      if (grownHardMask[i] === 255) {
        softMask[i] = 255
      }
    }

    /*
     * 4. Aggressive booth repair.
     *
     * The cleaner now operates ONLY according to booth
     * evidence and is attenuated by the precomputed
     * product/shadow mask.
     */
    const sampleRadius = Math.max(
      8,
      Math.round(Math.min(width, height) * 0.018),
    )

    const sampleOffsets = [
      [-sampleRadius, 0],
      [sampleRadius, 0],
      [0, -sampleRadius],
      [0, sampleRadius],
      [-sampleRadius, -sampleRadius],
      [sampleRadius, -sampleRadius],
      [-sampleRadius, sampleRadius],
      [sampleRadius, sampleRadius],
    ]

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = y * width + x
        const i = pixelIndex * 4

        const r = passOne[i]
        const g = passOne[i + 1]
        const b = passOne[i + 2]

        const luminance =
          0.2126 * r +
          0.7152 * g +
          0.0722 * b

        /*
         * PRODUCT/SHADOW EXCLUSION ZONE
         *
         * PASS 1 proves the natural product shadow is already
         * correct. Spatial booth repair therefore has no
         * business operating anywhere close to the product.
         *
         * proximityMask is geometric distance from the product
         * and does not depend on guessing whether a pixel
         * "looks like" shadow.
         */
        /*
         * Never alter the actual product.
         *
         * Do NOT hard-exclude the surrounding shadow.
         * A hard exclusion creates a visible boundary.
         * Instead, proximityMask below continuously fades
         * booth repair from zero beside the product to full
         * strength in open booth.
         */
        if (grownHardMask[pixelIndex] === 255) {
          continue
        }

        /*
         * Dark pixels outside the product mask are still
         * too risky to whiten.
         */
        if (luminance < 105) {
          continue
        }

        let boothNeighbors = 0
        let validNeighbors = 0
        let neighborR = 0
        let neighborG = 0
        let neighborB = 0

        for (const [dx, dy] of sampleOffsets) {
          const sx = x + dx
          const sy = y + dy

          if (
            sx < 0 ||
            sx >= width ||
            sy < 0 ||
            sy >= height
          ) {
            continue
          }

          validNeighbors++

          const si = (sy * width + sx) * 4

          const sr = passOne[si]
          const sg = passOne[si + 1]
          const sb = passOne[si + 2]

          const sLum =
            0.2126 * sr +
            0.7152 * sg +
            0.0722 * sb

          const sChroma =
            Math.max(sr, sg, sb) -
            Math.min(sr, sg, sb)

          if (
            sLum >= 205 &&
            sChroma <= 48
          ) {
            boothNeighbors++
            neighborR += sr
            neighborG += sg
            neighborB += sb
          }
        }

        if (validNeighbors < 4) {
          continue
        }

        const surroundingConfidence =
          boothNeighbors / validNeighbors

        if (surroundingConfidence < 0.625) {
          continue
        }

        const maxChannel = Math.max(r, g, b)
        const minChannel = Math.min(r, g, b)
        const chroma = maxChannel - minChannel

        const yellowAmount =
          Math.max(
            0,
            ((r + g) / 2) - b,
          )

        const plausibleBoothDefect =
          luminance >= 125 &&
          (
            chroma <= 72 ||
            yellowAmount >= 5
          )

        if (!plausibleBoothDefect) {
          continue
        }

        const avgR =
          boothNeighbors > 0
            ? neighborR / boothNeighbors
            : 248

        const avgG =
          boothNeighbors > 0
            ? neighborG / boothNeighbors
            : 248

        const avgB =
          boothNeighbors > 0
            ? neighborB / boothNeighbors
            : 248

        const baseStrength =
          Math.min(
            0.88,
            0.48 +
              surroundingConfidence * 0.25 +
              Math.min(
                0.15,
                yellowAmount / 100,
              ),
          )

        /*
         * Soft mask = 255 directly beside/on product,
         * fading toward 0 as we move into open booth.
         *
         * Keep nearly all natural shadow near the part,
         * but progressively restore full booth cleaning
         * farther away.
         */
        /*
         * GEOMETRIC FEATHER
         *
         * proximityMask is 255 beside the product and
         * continuously falls toward 0 with distance.
         *
         * Combine it with the appearance-based shadow mask.
         * This prevents an abrupt protected/unprotected edge.
         */
        const geometricProtection =
          proximityMask[pixelIndex] / 255

        let protection =
          Math.max(
            softMask[pixelIndex] / 255,
            geometricProtection,
          )

        /*
         * TEXAS OEM V4.1 — WATERMARK SAFE ZONE
         *
         * Protect the upper-right watermark area from
         * spatial booth repair.
         */
        const normalizedX = x / width
        const normalizedY = y / height

        const inWatermarkSafeZone =
          normalizedX >= 0.78 &&
          normalizedY <= 0.18

        if (inWatermarkSafeZone) {
          protection = 1
        }

        /*
         * TEXAS OEM V4.1 — NATURAL SHADOW FEATHER
         *
         * Extend the useful range of the existing soft
         * product/shadow mask so the natural shadow fades
         * smoothly into the cleaned booth.
         */
        const featheredProtection =
          Math.pow(protection, 0.72)

        const defectStrength =
          baseStrength *
          Math.pow(
            1 - featheredProtection,
            1.35,
          )

        /*
         * If protection makes the repair negligible,
         * preserve the original pass-one pixel exactly.
         */
        if (defectStrength < 0.035) {
          continue
        }

        const targetR = Math.max(245, avgR)
        const targetG = Math.max(245, avgG)
        const targetB = Math.max(245, avgB)

        data[i] = clamp(
          r + (targetR - r) * defectStrength,
        )

        data[i + 1] = clamp(
          g + (targetG - g) * defectStrength,
        )

        data[i + 2] = clamp(
          b + (targetB - b) * defectStrength,
        )
      }
    }

    ctx!.putImageData(image, 0, 0)

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
