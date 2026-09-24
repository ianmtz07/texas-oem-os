import { useEffect, useState } from 'react'
import { createTexasOEMPhotoV2 } from '../utils/texasOEMPhotoV2'

export default function PhotoLab() {
  const [originalUrl, setOriginalUrl] = useState('')
  const [enhancedUrl, setEnhancedUrl] = useState('')
  const [status, setStatus] = useState('Choose a real Texas OEM photo.')
  const [processingTime, setProcessingTime] = useState<number | null>(null)

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl)
      if (enhancedUrl) URL.revokeObjectURL(enhancedUrl)
    }
  }, [originalUrl, enhancedUrl])

  async function handlePhoto(file: File | undefined) {
    if (!file) return

    if (originalUrl) URL.revokeObjectURL(originalUrl)
    if (enhancedUrl) URL.revokeObjectURL(enhancedUrl)

    const sourceUrl = URL.createObjectURL(file)
    setOriginalUrl(sourceUrl)
    setEnhancedUrl('')
    setProcessingTime(null)
    setStatus('Processing Texas OEM V2…')

    const started = performance.now()

    try {
      const blob = await createTexasOEMPhotoV2(file)

      const elapsed = performance.now() - started
      const resultUrl = URL.createObjectURL(blob)

      setEnhancedUrl(resultUrl)
      setProcessingTime(elapsed)
      setStatus('Done.')
    } catch (error) {
      console.error(error)
      setStatus(
        error instanceof Error
          ? error.message
          : 'Photo processing failed.',
      )
    }
  }

  return (
    <main
      style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1>Texas OEM Photo Lab V2</h1>

      <p>
        Temporary test only. Nothing is uploaded or saved to inventory.
      </p>

      <input
        type="file"
        accept="image/*"
        onChange={(event) =>
          handlePhoto(event.target.files?.[0])
        }
      />

      <p>
        <strong>{status}</strong>
        {processingTime !== null &&
          ` — ${(processingTime / 1000).toFixed(2)} sec`}
      </p>

      {(originalUrl || enhancedUrl) && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 24,
            marginTop: 24,
          }}
        >
          <section>
            <h2>ORIGINAL</h2>
            {originalUrl && (
              <img
                src={originalUrl}
                alt="Original"
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                }}
              />
            )}
          </section>

          <section>
            <h2>TEXAS OEM V2</h2>
            {enhancedUrl && (
              <img
                src={enhancedUrl}
                alt="Texas OEM enhanced"
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                }}
              />
            )}
          </section>
        </div>
      )}
    </main>
  )
}
