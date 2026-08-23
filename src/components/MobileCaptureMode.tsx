import { useRef, useState } from 'react'

export default function MobileCaptureMode() {
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const [photos, setPhotos] = useState<File[]>([])

  const handlePhotos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    setPhotos((prev) => [...prev, ...files])
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#ffffff',
        color: '#111827',
        padding: '32px 20px',
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '32px' }}>
        Texas OEM OS
      </h1>

      <h2 style={{ fontSize: '24px' }}>
        Mobile Capture
      </h2>

      <button
        type="button"
        onClick={() => cameraInputRef.current?.click()}
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '22px',
          marginTop: '30px',
          fontSize: '22px',
          fontWeight: 'bold',
          borderRadius: '14px',
          background: '#1f4b73',
          color: 'white',
          border: 'none',
        }}
      >
        📸 TAKE PHOTOS
      </button>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={handlePhotos}
      />

      <div
        style={{
          marginTop: '30px',
          fontSize: '20px',
        }}
      >
        Photos captured: {photos.length}
      </div>

      {photos.length > 0 && (
        <button
          type="button"
          style={{
            marginTop: '25px',
            width: '100%',
            maxWidth: '400px',
            padding: '18px',
            fontSize: '18px',
          }}
        >
          Upload {photos.length} Photos
        </button>
      )}
    </div>
  )
}
