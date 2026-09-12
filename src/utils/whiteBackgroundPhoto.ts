import { removeBackground } from '@imgly/background-removal'

const OUTPUT_SIZE = 1600
const PADDING = 120

export async function createTexasOEMPhoto(
  originalFile: File
): Promise<Blob> {
  const cutoutBlob = await removeBackground(originalFile)
  const cutoutUrl = URL.createObjectURL(cutoutBlob)

  try {
    const img = await loadImage(cutoutUrl)

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE

    const ctx = canvas.getContext('2d', { alpha: false })

    if (!ctx) {
      throw new Error('Could not create photo canvas')
    }

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

    const availableWidth = OUTPUT_SIZE - PADDING * 2
    const availableHeight = OUTPUT_SIZE - PADDING * 2

    const scale = Math.min(
      availableWidth / img.width,
      availableHeight / img.height
    )

    const drawWidth = img.width * scale
    const drawHeight = img.height * scale

    const x = (OUTPUT_SIZE - drawWidth) / 2
    const y =
      (OUTPUT_SIZE - drawHeight) / 2 -
      Math.min(30, OUTPUT_SIZE * 0.02)

    drawSoftShadow(
      ctx,
      img,
      x,
      y,
      drawWidth,
      drawHeight
    )

    ctx.globalAlpha = 1
    ctx.filter = 'none'

    ctx.drawImage(
      img,
      x,
      y,
      drawWidth,
      drawHeight
    )

    return await canvasToBlob(canvas)
  } finally {
    URL.revokeObjectURL(cutoutUrl)
  }
}

function drawSoftShadow(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const shadowCanvas = document.createElement('canvas')

  shadowCanvas.width = OUTPUT_SIZE
  shadowCanvas.height = OUTPUT_SIZE

  const shadowCtx = shadowCanvas.getContext('2d')

  if (!shadowCtx) return

  shadowCtx.drawImage(
    img,
    x,
    y + 28,
    width,
    height
  )

  shadowCtx.globalCompositeOperation = 'source-in'
  shadowCtx.fillStyle = 'rgba(0, 0, 0, 0.26)'
  shadowCtx.fillRect(
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE
  )

  shadowCtx.globalCompositeOperation = 'source-over'

  ctx.save()
  ctx.filter = 'blur(22px)'
  ctx.globalAlpha = 0.55
  ctx.drawImage(shadowCanvas, 0, 0)
  ctx.restore()

  ctx.save()
  ctx.filter = 'blur(9px)'
  ctx.globalAlpha = 0.18
  ctx.drawImage(shadowCanvas, 0, -12)
  ctx.restore()
}

function loadImage(
  url: string
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => resolve(img)

    img.onerror = () =>
      reject(
        new Error(
          'Could not load processed photo'
        )
      )

    img.src = url
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(
            new Error(
              'Could not export processed photo'
            )
          )

          return
        }

        resolve(blob)
      },
      'image/jpeg',
      0.94
    )
  })
}
