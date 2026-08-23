import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  buildPartPhotoStoragePath,
  compressImage,
  getPhotoValidationError,
  type PartPhoto,
} from '../lib/partPhotos'

type MobilePart = {
  id: string
  vehicleId: string | null
  partMasterId: string | null
  sku: string
  partName: string
  partNumber: string
  shelf: string
  bin: string
  photoCount: number
}

type PartMasterRow = {
  id: string
  part_name: string | null
  part_code: string | null
}

export default function MobileCaptureMode() {
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const libraryInputRef = useRef<HTMLInputElement | null>(null)

  const [searchValue, setSearchValue] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<MobilePart[]>([])
  const [selectedPart, setSelectedPart] = useState<MobilePart | null>(null)

  const [photos, setPhotos] = useState<File[]>([])
  const [existingPhotos, setExistingPhotos] = useState<PartPhoto[]>([])

  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const resetPhotoQueue = () => {
    setPhotos([])

    if (cameraInputRef.current) {
      cameraInputRef.current.value = ''
    }

    if (libraryInputRef.current) {
      libraryInputRef.current.value = ''
    }
  }

  const clearForNextPart = () => {
    setSelectedPart(null)
    setExistingPhotos([])
    setResults([])
    setSearchValue('')
    setMessage('')
    setError('')
    resetPhotoQueue()

    window.setTimeout(() => {
      document.getElementById('mobile-part-search')?.focus()
    }, 50)
  }

  const mapPart = (
    row: Record<string, unknown>,
    masters: Map<string, PartMasterRow>,
    photoCount = 0,
  ): MobilePart => {
    const masterId =
      typeof row.part_master_id === 'string'
        ? row.part_master_id
        : null

    const master = masterId
      ? masters.get(masterId)
      : undefined

    return {
      id: String(row.id ?? ''),
      vehicleId:
        typeof row.vehicle_id === 'string'
          ? row.vehicle_id
          : null,
      partMasterId: masterId,
      sku:
        typeof row.sku === 'string'
          ? row.sku
          : '',
      partName:
        master?.part_name ||
        (typeof row.part_name === 'string'
          ? row.part_name
          : 'Part'),
      partNumber:
        master?.part_code ||
        (typeof row.part_number === 'string'
          ? row.part_number
          : ''),
      shelf:
        typeof row.shelf_location === 'string'
          ? row.shelf_location
          : '',
      bin:
        typeof row.bin === 'string'
          ? row.bin
          : '',
      photoCount,
    }
  }

  const loadPhotoRows = async (partId: string) => {
    const { data, error: photoError } = await supabase
      .from('part_photos')
      .select('*')
      .eq('part_id', partId)
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true })

    if (photoError) {
      throw new Error(photoError.message)
    }

    return (data ?? []).map((row) => ({
      id: String(row.id),
      partId: String(row.part_id),
      storagePath: String(row.storage_path),
      publicUrl:
        typeof row.public_url === 'string'
          ? row.public_url
          : null,
      isPrimary: Boolean(row.is_primary),
      sortOrder: Number(row.sort_order ?? 0),
      createdAt:
        typeof row.created_at === 'string'
          ? row.created_at
          : null,
    })) as PartPhoto[]
  }

  const selectPart = async (part: MobilePart) => {
    setError('')
    setMessage('Loading part…')
    resetPhotoQueue()

    try {
      const loadedPhotos = await loadPhotoRows(part.id)

      const freshPart = {
        ...part,
        photoCount: loadedPhotos.length,
      }

      setSelectedPart(freshPart)
      setExistingPhotos(loadedPhotos)
      setResults([])
      setMessage(
        loadedPhotos.length
          ? `${loadedPhotos.length} existing photo${loadedPhotos.length === 1 ? '' : 's'}. Ready for more.`
          : 'Ready for photos.',
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load part photos.',
      )
      setMessage('')
    }
  }

  const searchParts = async () => {
    const query = searchValue.trim()

    if (!query) {
      setError('Enter or scan a SKU, barcode, part number, or part name.')
      return
    }

    setSearching(true)
    setError('')
    setMessage('Finding part…')
    setResults([])

    try {
      const escaped = query.replace(/[%_,()]/g, '')

      const { data: directRows, error: directError } =
        await supabase
          .from('parts')
          .select(
            'id, vehicle_id, part_master_id, sku, shelf_location, bin, part_number',
          )
          .or(
            `sku.ilike.%${escaped}%,part_number.ilike.%${escaped}%`,
          )
          .limit(20)

      if (directError) {
        throw new Error(directError.message)
      }

      const { data: masterRows, error: masterError } =
        await supabase
          .from('part_master')
          .select('id, part_name, part_code')
          .or(
            `part_name.ilike.%${escaped}%,part_code.ilike.%${escaped}%`,
          )
          .limit(20)

      if (masterError) {
        throw new Error(masterError.message)
      }

      const matchingMasterIds = (masterRows ?? []).map(
        (row) => String(row.id),
      )

      let masterPartRows: Record<string, unknown>[] = []

      if (matchingMasterIds.length > 0) {
        const { data, error: masterPartError } =
          await supabase
            .from('parts')
            .select(
              'id, vehicle_id, part_master_id, sku, shelf_location, bin, part_number',
            )
            .in('part_master_id', matchingMasterIds)
            .limit(20)

        if (masterPartError) {
          throw new Error(masterPartError.message)
        }

        masterPartRows =
          (data ?? []) as Record<string, unknown>[]
      }

      const combined = new Map<
        string,
        Record<string, unknown>
      >()

      for (const row of [
        ...((directRows ?? []) as Record<string, unknown>[]),
        ...masterPartRows,
      ]) {
        combined.set(String(row.id), row)
      }

      const masterIds = Array.from(combined.values())
        .map((row) =>
          typeof row.part_master_id === 'string'
            ? row.part_master_id
            : null,
        )
        .filter((value): value is string => Boolean(value))

      let allMasters: PartMasterRow[] = []

      if (masterIds.length > 0) {
        const { data, error: allMasterError } =
          await supabase
            .from('part_master')
            .select('id, part_name, part_code')
            .in('id', masterIds)

        if (allMasterError) {
          throw new Error(allMasterError.message)
        }

        allMasters = (data ?? []) as PartMasterRow[]
      }

      const masterMap = new Map(
        allMasters.map((row) => [
          String(row.id),
          row,
        ]),
      )

      const mapped = Array.from(combined.values()).map(
        (row) => mapPart(row, masterMap),
      )

      setResults(mapped)

      if (mapped.length === 0) {
        setMessage('No matching part found.')
        return
      }

      /*
       * Exact SKU/barcode match:
       * jump straight into photo mode.
       */
      const normalizedQuery = query.toUpperCase()

      const exact = mapped.find(
        (part) =>
          part.sku.toUpperCase() === normalizedQuery,
      )

      if (exact) {
        await selectPart(exact)
        return
      }

      if (mapped.length === 1) {
        await selectPart(mapped[0])
        return
      }

      setMessage(
        `${mapped.length} matches found. Tap the correct part.`,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Part search failed.',
      )
      setMessage('')
    } finally {
      setSearching(false)
    }
  }

  const handlePhotos = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!selectedPart) {
      setError('Select a part before taking photos.')
      event.target.value = ''
      return
    }

    const incoming = Array.from(
      event.target.files ?? [],
    )

    if (!incoming.length) {
      return
    }

    const accepted: File[] = []

    for (const file of incoming) {
      const validationError = getPhotoValidationError(
        file,
        existingPhotos.length,
        photos.length + accepted.length,
      )

      if (validationError) {
        setError(validationError)
        event.target.value = ''
        return
      }

      accepted.push(file)
    }

    setPhotos((prev) => [...prev, ...accepted])
    setError('')
    setMessage(
      `${photos.length + accepted.length} new photo${
        photos.length + accepted.length === 1 ? '' : 's'
      } queued.`,
    )

    /*
     * Reset input so iPhone camera can be opened
     * repeatedly during the same part session.
     */
    event.target.value = ''
  }

  const uploadPhotos = async () => {
    if (!selectedPart) {
      setError('No part selected.')
      return
    }

    if (!photos.length) {
      setError('Take at least one photo first.')
      return
    }

    setUploading(true)
    setError('')
    setMessage('Processing and uploading photos…')

    try {
      const uploaded: PartPhoto[] = []

      for (const [index, sourceFile] of photos.entries()) {
        setMessage(
          `Processing photo ${index + 1} of ${photos.length}…`,
        )

        const file = await compressImage(sourceFile)

        const storagePath =
          buildPartPhotoStoragePath(
            selectedPart.vehicleId ?? 'standalone',
            selectedPart.id,
            file.name,
          )

        const { error: uploadError } =
          await supabase.storage
            .from('part-photos')
            .upload(storagePath, file, {
              cacheControl: '3600',
              upsert: false,
              contentType:
                file.type || 'image/jpeg',
            })

        if (uploadError) {
          throw new Error(
            `Upload failed: ${uploadError.message}`,
          )
        }

        const publicUrl =
          supabase.storage
            .from('part-photos')
            .getPublicUrl(storagePath)
            .data.publicUrl

        const isPrimary =
          existingPhotos.length + uploaded.length === 0

        const { data: photoRow, error: rowError } =
          await supabase
            .from('part_photos')
            .insert({
              part_id: selectedPart.id,
              storage_path: storagePath,
              public_url: publicUrl,
              is_primary: isPrimary,
              sort_order:
                existingPhotos.length + uploaded.length,
            })
            .select()
            .single()

        if (rowError) {
          throw new Error(
            `Photo record failed: ${rowError.message}`,
          )
        }

        uploaded.push({
          id: String(photoRow.id),
          partId: String(photoRow.part_id),
          storagePath: String(photoRow.storage_path),
          publicUrl:
            typeof photoRow.public_url === 'string'
              ? photoRow.public_url
              : null,
          isPrimary: Boolean(photoRow.is_primary),
          sortOrder: Number(
            photoRow.sort_order ?? 0,
          ),
          createdAt:
            typeof photoRow.created_at === 'string'
              ? photoRow.created_at
              : null,
        })
      }

      const newCount =
        existingPhotos.length + uploaded.length

      /*
       * Mobile Capture does NOT generate an eBay draft.
       * Its only job is warehouse photo production.
       */
      const { error: updateError } = await supabase
        .from('parts')
        .update({
          photographed: true,
          photo_count: newCount,
        })
        .eq('id', selectedPart.id)

      if (updateError) {
        console.warn(
          '[mobile-capture] part photo status update failed',
          updateError,
        )
      }

      setExistingPhotos((prev) => [
        ...prev,
        ...uploaded,
      ])

      setSelectedPart((prev) =>
        prev
          ? {
              ...prev,
              photoCount: newCount,
            }
          : prev,
      )

      resetPhotoQueue()

      setMessage(
        `✓ ${uploaded.length} photo${
          uploaded.length === 1 ? '' : 's'
        } saved to ${selectedPart.sku || selectedPart.partName}.`,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Photo upload failed.',
      )
      setMessage('')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f5f7fa',
        color: '#111827',
        padding: '20px 16px 48px',
        fontFamily:
          'Arial, Helvetica, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            marginBottom: '22px',
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: '27px',
            }}
          >
            TEXAS OEM OS
          </div>

          <div
            style={{
              marginTop: '4px',
              fontSize: '17px',
              color: '#4b5563',
            }}
          >
            Mobile Photo Session
          </div>
        </div>

        {!selectedPart ? (
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '18px',
              boxShadow:
                '0 2px 12px rgba(0,0,0,0.08)',
            }}
          >
            <label
              htmlFor="mobile-part-search"
              style={{
                display: 'block',
                textAlign: 'left',
                fontWeight: 700,
                marginBottom: '8px',
              }}
            >
              Find Part
            </label>

            <input
              id="mobile-part-search"
              autoFocus
              value={searchValue}
              onChange={(event) =>
                setSearchValue(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void searchParts()
                }
              }}
              placeholder="Scan or enter SKU / part name"
              autoCapitalize="characters"
              style={{
                boxSizing: 'border-box',
                width: '100%',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                fontSize: '19px',
              }}
            />

            <button
              type="button"
              disabled={searching}
              onClick={() => void searchParts()}
              style={{
                width: '100%',
                padding: '17px',
                marginTop: '12px',
                borderRadius: '12px',
                border: 'none',
                fontSize: '19px',
                fontWeight: 800,
                background: '#1f4b73',
                color: '#ffffff',
              }}
            >
              {searching
                ? 'SEARCHING…'
                : 'FIND PART'}
            </button>

            {results.length > 1 && (
              <div
                style={{
                  marginTop: '16px',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                {results.map((part) => (
                  <button
                    key={part.id}
                    type="button"
                    onClick={() =>
                      void selectPart(part)
                    }
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: '12px',
                      border:
                        '1px solid #cbd5e1',
                      background: '#ffffff',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: '17px',
                      }}
                    >
                      {part.sku ||
                        'NO SKU'}
                    </div>

                    <div
                      style={{
                        marginTop: '4px',
                        fontSize: '16px',
                      }}
                    >
                      {part.partName}
                    </div>

                    {(part.shelf ||
                      part.bin) && (
                      <div
                        style={{
                          marginTop: '4px',
                          color: '#64748b',
                        }}
                      >
                        {[
                          part.shelf,
                          part.bin,
                        ]
                          .filter(Boolean)
                          .join(' • ')}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '18px',
                boxShadow:
                  '0 2px 12px rgba(0,0,0,0.08)',
              }}
            >
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 800,
                  color: '#64748b',
                }}
              >
                ACTIVE PART
              </div>

              <div
                style={{
                  marginTop: '5px',
                  fontSize: '25px',
                  fontWeight: 900,
                }}
              >
                {selectedPart.sku ||
                  'NO SKU'}
              </div>

              <div
                style={{
                  marginTop: '5px',
                  fontSize: '19px',
                }}
              >
                {selectedPart.partName}
              </div>

              {(selectedPart.shelf ||
                selectedPart.bin) && (
                <div
                  style={{
                    marginTop: '6px',
                    color: '#64748b',
                  }}
                >
                  Location:{' '}
                  {[
                    selectedPart.shelf,
                    selectedPart.bin,
                  ]
                    .filter(Boolean)
                    .join(' • ')}
                </div>
              )}

              <div
                style={{
                  marginTop: '10px',
                  fontWeight: 700,
                }}
              >
                Existing photos:{' '}
                {existingPhotos.length}
              </div>
            </div>

            <button
              type="button"
              disabled={uploading}
              onClick={() =>
                cameraInputRef.current?.click()
              }
              style={{
                width: '100%',
                padding: '23px',
                marginTop: '16px',
                borderRadius: '14px',
                border: 'none',
                fontSize: '22px',
                fontWeight: 900,
                background: '#1f4b73',
                color: '#ffffff',
              }}
            >
              📸 TAKE PHOTO
            </button>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={handlePhotos}
            />

            <button
              type="button"
              disabled={uploading}
              onClick={() =>
                libraryInputRef.current?.click()
              }
              style={{
                width: '100%',
                padding: '15px',
                marginTop: '10px',
                borderRadius: '12px',
                border:
                  '1px solid #94a3b8',
                fontSize: '17px',
                fontWeight: 700,
                background: '#ffffff',
              }}
            >
              Choose Multiple From Library
            </button>

            <input
              ref={libraryInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handlePhotos}
            />

            <div
              style={{
                marginTop: '18px',
                textAlign: 'center',
                fontSize: '22px',
                fontWeight: 900,
              }}
            >
              {photos.length} NEW PHOTO
              {photos.length === 1
                ? ''
                : 'S'}{' '}
              QUEUED
            </div>

            {photos.length > 0 && (
              <>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() =>
                    void uploadPhotos()
                  }
                  style={{
                    width: '100%',
                    padding: '21px',
                    marginTop: '15px',
                    borderRadius: '14px',
                    border: 'none',
                    fontSize: '20px',
                    fontWeight: 900,
                    background: '#166534',
                    color: '#ffffff',
                  }}
                >
                  {uploading
                    ? 'UPLOADING…'
                    : `SAVE ${photos.length} PHOTO${
                        photos.length === 1
                          ? ''
                          : 'S'
                      }`}
                </button>

                <button
                  type="button"
                  disabled={uploading}
                  onClick={resetPhotoQueue}
                  style={{
                    width: '100%',
                    padding: '14px',
                    marginTop: '8px',
                    borderRadius: '12px',
                    border:
                      '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '16px',
                  }}
                >
                  Clear New Photos
                </button>
              </>
            )}

            <button
              type="button"
              disabled={uploading}
              onClick={clearForNextPart}
              style={{
                width: '100%',
                padding: '19px',
                marginTop: '22px',
                borderRadius: '14px',
                border:
                  '2px solid #1f4b73',
                background: '#ffffff',
                color: '#1f4b73',
                fontSize: '19px',
                fontWeight: 900,
              }}
            >
              DONE — NEXT PART →
            </button>
          </>
        )}

        {message && (
          <div
            style={{
              marginTop: '16px',
              padding: '13px',
              borderRadius: '10px',
              background: '#ecfdf5',
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            {message}
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: '16px',
              padding: '13px',
              borderRadius: '10px',
              background: '#fef2f2',
              color: '#991b1b',
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
