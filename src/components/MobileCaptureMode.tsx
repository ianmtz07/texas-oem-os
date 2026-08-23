import {
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from '@zxing/browser'

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
  const scannerVideoRef =
    useRef<HTMLVideoElement | null>(null)

  const photoVideoRef =
    useRef<HTMLVideoElement | null>(null)

  const scannerControlsRef =
    useRef<IScannerControls | null>(null)

  const photoStreamRef =
    useRef<MediaStream | null>(null)

  const scanLockedRef =
    useRef(false)

  const [searchValue, setSearchValue] =
    useState('')

  const [searching, setSearching] =
    useState(false)

  const [results, setResults] =
    useState<MobilePart[]>([])

  const [selectedPart, setSelectedPart] =
    useState<MobilePart | null>(null)

  const [photos, setPhotos] =
    useState<File[]>([])

  const [
    existingPhotos,
    setExistingPhotos,
  ] = useState<PartPhoto[]>([])

  const [scannerActive, setScannerActive] =
    useState(false)

  const [
    photoCameraActive,
    setPhotoCameraActive,
  ] = useState(false)

  const [uploading, setUploading] =
    useState(false)

  const [message, setMessage] =
    useState('')

  const [error, setError] =
    useState('')

  const stopScanner = () => {
    scannerControlsRef.current?.stop()
    scannerControlsRef.current = null
    setScannerActive(false)
    scanLockedRef.current = false
  }

  const stopPhotoCamera = () => {
    if (photoStreamRef.current) {
      for (
        const track of
        photoStreamRef.current.getTracks()
      ) {
        track.stop()
      }
    }

    photoStreamRef.current = null

    if (photoVideoRef.current) {
      photoVideoRef.current.srcObject = null
    }

    setPhotoCameraActive(false)
  }

  useEffect(() => {
    return () => {
      scannerControlsRef.current?.stop()

      if (photoStreamRef.current) {
        for (
          const track of
          photoStreamRef.current.getTracks()
        ) {
          track.stop()
        }
      }
    }
  }, [])

  const resetPhotoQueue = () => {
    setPhotos([])
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
        master?.part_name || 'Part',

      partNumber:
        master?.part_code || '',

      shelf:
        typeof row.shelf_location ===
        'string'
          ? row.shelf_location
          : '',

      bin:
        typeof row.bin === 'string'
          ? row.bin
          : '',

      photoCount,
    }
  }

  const loadPhotoRows = async (
    partId: string,
  ) => {
    const {
      data,
      error: photoError,
    } = await supabase
      .from('part_photos')
      .select('*')
      .eq('part_id', partId)
      .order('is_primary', {
        ascending: false,
      })
      .order('sort_order', {
        ascending: true,
      })

    if (photoError) {
      throw new Error(
        photoError.message,
      )
    }

    return (data ?? []).map(
      (row) => ({
        id: String(row.id),

        partId: String(row.part_id),

        storagePath: String(
          row.storage_path,
        ),

        publicUrl:
          typeof row.public_url ===
          'string'
            ? row.public_url
            : null,

        isPrimary: Boolean(
          row.is_primary,
        ),

        sortOrder: Number(
          row.sort_order ?? 0,
        ),

        createdAt:
          typeof row.created_at ===
          'string'
            ? row.created_at
            : null,
      }),
    ) as PartPhoto[]
  }

  const startPhotoCamera = async () => {
    stopPhotoCamera()

    setError('')
    setMessage(
      'Starting photo camera…',
    )

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            video: {
              facingMode: {
                ideal: 'environment',
              },

              width: {
                ideal: 1920,
              },

              height: {
                ideal: 1080,
              },
            },

            audio: false,
          },
        )

      photoStreamRef.current = stream

      const video =
        photoVideoRef.current

      if (!video) {
        throw new Error(
          'Photo camera preview unavailable.',
        )
      }

      video.srcObject = stream

      video.setAttribute(
        'playsinline',
        'true',
      )

      video.muted = true

      await video.play()

      setPhotoCameraActive(true)
      setMessage(
        'Camera ready. Take your photos.',
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to start camera.',
      )

      setMessage('')
    }
  }

  const selectPart = async (
    part: MobilePart,
  ) => {
    stopScanner()

    setError('')
    setMessage('Loading part…')
    resetPhotoQueue()

    try {
      const loadedPhotos =
        await loadPhotoRows(part.id)

      const freshPart = {
        ...part,
        photoCount:
          loadedPhotos.length,
      }

      setSelectedPart(freshPart)
      setExistingPhotos(
        loadedPhotos,
      )
      setResults([])

      setMessage(
        loadedPhotos.length
          ? `${loadedPhotos.length} existing photo${
              loadedPhotos.length === 1
                ? ''
                : 's'
            }.`
          : 'No existing photos.',
      )

      window.setTimeout(() => {
        void startPhotoCamera()
      }, 100)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load part.',
      )

      setMessage('')
    }
  }

  const searchParts = async (
    rawQuery?: string,
  ) => {
    const query = (
      rawQuery ??
      searchValue
    ).trim()

    if (!query) {
      setError(
        'Enter or scan a SKU.',
      )
      return
    }

    /*
     * Texas OEM part tags may contain either:
     *   TX-2026... SKU
     * or
     *   /parts/<database UUID>
     *
     * Support both so mobile scanning is instant.
     */
    const partRouteMatch = query.match(
      /\/parts\/([0-9a-f-]{36})/i,
    )

    const scannedPartId =
      partRouteMatch?.[1] ?? null

    setSearching(true)
    setError('')
    setMessage('Finding part…')
    setResults([])

    try {
      const escaped =
        query.replace(
          /[%_,()]/g,
          '',
        )

      let directRows: Record<string, unknown>[] = []

      if (scannedPartId) {
        const {
          data,
          error: directError,
        } = await supabase
          .from('parts')
          .select(
            'id, vehicle_id, part_master_id, sku, shelf_location, bin',
          )
          .eq('id', scannedPartId)
          .limit(1)

        if (directError) {
          throw new Error(
            directError.message,
          )
        }

        directRows =
          (data ?? []) as Record<string, unknown>[]
      } else {
        const {
          data,
          error: directError,
        } = await supabase
          .from('parts')
          .select(
            'id, vehicle_id, part_master_id, sku, shelf_location, bin',
          )
          .ilike(
            'sku',
            `%${escaped}%`,
          )
          .limit(20)

        if (directError) {
          throw new Error(
            directError.message,
          )
        }

        directRows =
          (data ?? []) as Record<string, unknown>[]
      }

      const {
        data: masterRows,
        error: masterError,
      } = await supabase
        .from('part_master')
        .select(
          'id, part_name, part_code',
        )
        .or(
          `part_name.ilike.%${escaped}%,part_code.ilike.%${escaped}%`,
        )
        .limit(20)

      if (masterError) {
        throw new Error(
          masterError.message,
        )
      }

      const matchingMasterIds =
        (masterRows ?? []).map(
          (row) =>
            String(row.id),
        )

      let masterPartRows:
        Record<string, unknown>[] =
          []

      if (
        matchingMasterIds.length > 0
      ) {
        const {
          data,
          error: masterPartError,
        } = await supabase
          .from('parts')
          .select(
            'id, vehicle_id, part_master_id, sku, shelf_location, bin',
          )
          .in(
            'part_master_id',
            matchingMasterIds,
          )
          .limit(20)

        if (masterPartError) {
          throw new Error(
            masterPartError.message,
          )
        }

        masterPartRows =
          (data ??
            []) as Record<
            string,
            unknown
          >[]
      }

      const combined =
        new Map<
          string,
          Record<string, unknown>
        >()

      for (const row of [
        ...directRows,

        ...masterPartRows,
      ]) {
        combined.set(
          String(row.id),
          row,
        )
      }

      const masterIds =
        Array.from(
          combined.values(),
        )
          .map((row) =>
            typeof row.part_master_id ===
            'string'
              ? row.part_master_id
              : null,
          )
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          )

      let allMasters:
        PartMasterRow[] = []

      if (masterIds.length > 0) {
        const {
          data,
          error: allMasterError,
        } = await supabase
          .from('part_master')
          .select(
            'id, part_name, part_code',
          )
          .in(
            'id',
            masterIds,
          )

        if (allMasterError) {
          throw new Error(
            allMasterError.message,
          )
        }

        allMasters =
          (data ??
            []) as PartMasterRow[]
      }

      const masterMap =
        new Map(
          allMasters.map(
            (row) => [
              String(row.id),
              row,
            ],
          ),
        )

      const mapped =
        Array.from(
          combined.values(),
        ).map((row) =>
          mapPart(
            row,
            masterMap,
          ),
        )

      setResults(mapped)

      if (
        mapped.length === 0
      ) {
        setMessage(
          'No matching part found.',
        )

        scanLockedRef.current =
          false

        return
      }

      const normalizedQuery =
        query.toUpperCase()

      const exact =
        mapped.find(
          (part) =>
            scannedPartId
              ? part.id === scannedPartId
              : part.sku.toUpperCase() ===
                normalizedQuery,
        )

      if (exact) {
        await selectPart(exact)
        return
      }

      if (
        mapped.length === 1
      ) {
        await selectPart(
          mapped[0],
        )
        return
      }

      setMessage(
        `${mapped.length} matches found. Tap the correct part.`,
      )

      scanLockedRef.current =
        false
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Part search failed.',
      )

      setMessage('')

      scanLockedRef.current =
        false
    } finally {
      setSearching(false)
    }
  }

  const startScanner = async () => {
    stopPhotoCamera()
    stopScanner()

    const activeElement =
      document.activeElement

    if (
      activeElement instanceof
      HTMLElement
    ) {
      activeElement.blur()
    }

    setSelectedPart(null)
    setExistingPhotos([])
    setResults([])
    setError('')
    setMessage(
      'Point camera at part barcode…',
    )

    scanLockedRef.current =
      false

    try {
      /*
       * Render the scanner video element first.
       * React needs one frame before the ref exists.
       */
      setScannerActive(true)

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve())
        })
      })

      const video =
        scannerVideoRef.current

      if (!video) {
        throw new Error(
          'Scanner preview unavailable.',
        )
      }

      video.setAttribute(
        'playsinline',
        'true',
      )

      video.muted = true

      const reader =
        new BrowserMultiFormatReader()

      const controls =
        await reader.decodeFromVideoDevice(
          undefined,
          video,
          (result) => {
            if (
              !result ||
              scanLockedRef.current
            ) {
              return
            }

            const scanned =
              result
                .getText()
                .trim()

            if (!scanned) {
              return
            }

            scanLockedRef.current =
              true

            setSearchValue(
              scanned,
            )

            setMessage(
              `Scanned ${scanned}`,
            )

            void searchParts(
              scanned,
            )
          },
        )

      scannerControlsRef.current =
        controls

      setScannerActive(true)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to start barcode scanner.',
      )

      setMessage('')
      setScannerActive(false)
    }
  }

  const capturePhoto = async () => {
    if (!selectedPart) {
      setError(
        'No part selected.',
      )
      return
    }

    const video =
      photoVideoRef.current

    if (
      !video ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      setError(
        'Camera is not ready yet.',
      )
      return
    }

    const validationError =
      getPhotoValidationError(
        new File(
          [
            new Blob(
              ['camera'],
              {
                type:
                  'image/jpeg',
              },
            ),
          ],
          'camera.jpg',
          {
            type:
              'image/jpeg',
          },
        ),
        existingPhotos.length,
        photos.length,
      )

    if (
      validationError &&
      existingPhotos.length +
        photos.length >=
        15
    ) {
      setError(
        validationError,
      )
      return
    }

    const canvas =
      document.createElement(
        'canvas',
      )

    canvas.width =
      video.videoWidth

    canvas.height =
      video.videoHeight

    const context =
      canvas.getContext('2d')

    if (!context) {
      setError(
        'Unable to capture photo.',
      )
      return
    }

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height,
    )

    const blob =
      await new Promise<Blob>(
        (resolve, reject) => {
          canvas.toBlob(
            (result) => {
              if (result) {
                resolve(result)
              } else {
                reject(
                  new Error(
                    'Unable to capture photo.',
                  ),
                )
              }
            },
            'image/jpeg',
            0.95,
          )
        },
      )

    const file =
      new File(
        [blob],
        `mobile-${Date.now()}.jpg`,
        {
          type: 'image/jpeg',
          lastModified:
            Date.now(),
        },
      )

    const realValidationError =
      getPhotoValidationError(
        file,
        existingPhotos.length,
        photos.length,
      )

    if (realValidationError) {
      setError(
        realValidationError,
      )
      return
    }

    setPhotos((prev) => [
      ...prev,
      file,
    ])

    setError('')

    setMessage(
      `Photo ${
        photos.length + 1
      } captured.`,
    )
  }

  const uploadPhotos = async () => {
    if (!selectedPart) {
      setError(
        'No part selected.',
      )
      return false
    }

    if (!photos.length) {
      setError(
        'Take at least one photo first.',
      )
      return false
    }

    setUploading(true)
    setError('')

    try {
      const uploaded:
        PartPhoto[] = []

      for (
        const [
          index,
          sourceFile,
        ] of photos.entries()
      ) {
        setMessage(
          `Saving photo ${
            index + 1
          } of ${photos.length}…`,
        )

        const file =
          await compressImage(
            sourceFile,
          )

        const storagePath =
          buildPartPhotoStoragePath(
            selectedPart.vehicleId ??
              'standalone',

            selectedPart.id,

            file.name,
          )

        const {
          error: uploadError,
        } =
          await supabase.storage
            .from(
              'part-photos',
            )
            .upload(
              storagePath,
              file,
              {
                cacheControl:
                  '3600',

                upsert: false,

                contentType:
                  file.type ||
                  'image/jpeg',
              },
            )

        if (uploadError) {
          throw new Error(
            `Upload failed: ${uploadError.message}`,
          )
        }

        const publicUrl =
          supabase.storage
            .from(
              'part-photos',
            )
            .getPublicUrl(
              storagePath,
            )
            .data.publicUrl

        const isPrimary =
          existingPhotos.length +
            uploaded.length ===
          0

        const {
          data: photoRow,
          error: rowError,
        } = await supabase
          .from(
            'part_photos',
          )
          .insert({
            part_id:
              selectedPart.id,

            storage_path:
              storagePath,

            public_url:
              publicUrl,

            is_primary:
              isPrimary,

            sort_order:
              existingPhotos.length +
              uploaded.length,
          })
          .select()
          .single()

        if (rowError) {
          throw new Error(
            `Photo record failed: ${rowError.message}`,
          )
        }

        uploaded.push({
          id: String(
            photoRow.id,
          ),

          partId: String(
            photoRow.part_id,
          ),

          storagePath: String(
            photoRow.storage_path,
          ),

          publicUrl:
            typeof photoRow.public_url ===
            'string'
              ? photoRow.public_url
              : null,

          isPrimary:
            Boolean(
              photoRow.is_primary,
            ),

          sortOrder:
            Number(
              photoRow.sort_order ??
                0,
            ),

          createdAt:
            typeof photoRow.created_at ===
            'string'
              ? photoRow.created_at
              : null,
        })
      }

      const newCount =
        existingPhotos.length +
        uploaded.length

      const {
        error: updateError,
      } = await supabase
        .from('parts')
        .update({
          photographed: true,
          photo_count:
            newCount,
        })
        .eq(
          'id',
          selectedPart.id,
        )

      if (updateError) {
        console.warn(
          '[mobile-capture] part status update failed',
          updateError,
        )
      }

      setExistingPhotos(
        (prev) => [
          ...prev,
          ...uploaded,
        ],
      )

      setSelectedPart(
        (prev) =>
          prev
            ? {
                ...prev,
                photoCount:
                  newCount,
              }
            : prev,
      )

      resetPhotoQueue()

      setMessage(
        `✓ ${uploaded.length} photo${
          uploaded.length === 1
            ? ''
            : 's'
        } saved.`,
      )

      return true
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Photo upload failed.',
      )

      setMessage('')
      return false
    } finally {
      setUploading(false)
    }
  }

  const saveAndNext =
    async () => {
      if (
        photos.length > 0
      ) {
        const success =
          await uploadPhotos()

        if (!success) {
          return
        }
      }

      stopPhotoCamera()

      setSelectedPart(null)
      setExistingPhotos([])
      setResults([])
      setPhotos([])
      setSearchValue('')
      setError('')
      setMessage(
        'Ready for next part.',
      )

      window.setTimeout(
        () => {
          void startScanner()
        },
        150,
      )
    }

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          '#f5f7fa',
        color: '#111827',
        padding:
          '16px 14px 40px',
        fontFamily:
          'Arial, Helvetica, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            textAlign:
              'center',
            marginBottom:
              '16px',
          }}
        >
          <div
            style={{
              fontWeight: 900,
              fontSize: '28px',
            }}
          >
            TEXAS OEM OS
          </div>

          <div
            style={{
              marginTop: '3px',
              fontSize: '17px',
              color: '#4b5563',
            }}
          >
            Mobile Photo Session
          </div>
        </div>

        {!selectedPart ? (
          <>
            <div
              style={{
                background:
                  '#ffffff',
                borderRadius:
                  '16px',
                padding: '16px',
              }}
            >
              <button
                type="button"
                onClick={() =>
                  void startScanner()
                }
                style={{
                  width: '100%',
                  padding: '20px',
                  border: 'none',
                  borderRadius:
                    '14px',
                  background:
                    '#1f4b73',
                  color: '#ffffff',
                  fontSize:
                    '21px',
                  fontWeight: 900,
                }}
              >
                {scannerActive
                  ? 'SCANNING…'
                  : '▦ SCAN PART BARCODE'}
              </button>

              <div
                style={{
                  margin:
                    '14px 0',
                  textAlign:
                    'center',
                  color:
                    '#64748b',
                  fontWeight:
                    700,
                }}
              >
                OR ENTER SKU
              </div>

              <input
                value={
                  searchValue
                }
                onChange={(
                  event,
                ) =>
                  setSearchValue(
                    event.target
                      .value,
                  )
                }
                onKeyDown={(
                  event,
                ) => {
                  if (
                    event.key ===
                    'Enter'
                  ) {
                    void searchParts()
                  }
                }}
                placeholder="TX-2026..."
                autoCapitalize="characters"
                style={{
                  boxSizing:
                    'border-box',
                  width: '100%',
                  padding: '15px',
                  borderRadius:
                    '12px',
                  border:
                    '1px solid #cbd5e1',
                  fontSize:
                    '18px',
                }}
              />

              <button
                type="button"
                disabled={
                  searching
                }
                onClick={() =>
                  void searchParts()
                }
                style={{
                  width: '100%',
                  padding: '15px',
                  marginTop:
                    '10px',
                  border:
                    '1px solid #1f4b73',
                  borderRadius:
                    '12px',
                  background:
                    '#ffffff',
                  color:
                    '#1f4b73',
                  fontSize:
                    '18px',
                  fontWeight:
                    800,
                }}
              >
                FIND PART
              </button>
            </div>

            {scannerActive && (
              <div
                style={{
                  marginTop:
                    '14px',
                  overflow:
                    'hidden',
                  borderRadius:
                    '16px',
                  background:
                    '#000000',
                }}
              >
                <video
                  ref={
                    scannerVideoRef
                  }
                  playsInline
                  muted
                  style={{
                    width:
                      '100%',
                    display:
                      'block',
                    aspectRatio:
                      '4 / 3',
                    objectFit:
                      'cover',
                  }}
                />

                <div
                  style={{
                    padding:
                      '10px',
                    textAlign:
                      'center',
                    color:
                      '#ffffff',
                    fontWeight:
                      800,
                  }}
                >
                  Point at SKU
                  barcode
                </div>
              </div>
            )}

            {results.length >
              1 && (
              <div
                style={{
                  marginTop:
                    '12px',
                  display:
                    'grid',
                  gap: '8px',
                }}
              >
                {results.map(
                  (part) => (
                    <button
                      key={
                        part.id
                      }
                      type="button"
                      onClick={() =>
                        void selectPart(
                          part,
                        )
                      }
                      style={{
                        padding:
                          '14px',
                        border:
                          '1px solid #cbd5e1',
                        borderRadius:
                          '12px',
                        background:
                          '#ffffff',
                        textAlign:
                          'left',
                      }}
                    >
                      <strong>
                        {
                          part.sku
                        }
                      </strong>

                      <div>
                        {
                          part.partName
                        }
                      </div>
                    </button>
                  ),
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div
              style={{
                background:
                  '#ffffff',
                borderRadius:
                  '16px',
                padding: '15px',
                textAlign:
                  'center',
              }}
            >
              <div
                style={{
                  color:
                    '#64748b',
                  fontWeight:
                    800,
                  fontSize:
                    '14px',
                }}
              >
                ACTIVE PART
              </div>

              <div
                style={{
                  fontSize:
                    '23px',
                  fontWeight:
                    900,
                  marginTop:
                    '4px',
                }}
              >
                {
                  selectedPart.sku
                }
              </div>

              <div
                style={{
                  fontSize:
                    '18px',
                  marginTop:
                    '4px',
                }}
              >
                {
                  selectedPart.partName
                }
              </div>

              <div
                style={{
                  marginTop:
                    '8px',
                  fontWeight:
                    700,
                }}
              >
                Existing:{' '}
                {
                  existingPhotos.length
                }
                {' • '}
                New:{' '}
                {
                  photos.length
                }
              </div>
            </div>

            <div
              style={{
                marginTop:
                  '12px',
                overflow:
                  'hidden',
                borderRadius:
                  '16px',
                background:
                  '#000000',
              }}
            >
              <video
                ref={
                  photoVideoRef
                }
                playsInline
                muted
                style={{
                  width:
                    '100%',
                  display:
                    'block',
                  aspectRatio:
                    '3 / 4',
                  objectFit:
                    'cover',
                }}
              />
            </div>

            {!photoCameraActive && (
              <button
                type="button"
                onClick={() =>
                  void startPhotoCamera()
                }
                style={{
                  width: '100%',
                  padding:
                    '17px',
                  marginTop:
                    '10px',
                  border:
                    'none',
                  borderRadius:
                    '12px',
                  background:
                    '#1f4b73',
                  color:
                    '#ffffff',
                  fontSize:
                    '18px',
                  fontWeight:
                    900,
                }}
              >
                START CAMERA
              </button>
            )}

            <button
              type="button"
              disabled={
                !photoCameraActive ||
                uploading
              }
              onClick={() =>
                void capturePhoto()
              }
              style={{
                width: '100%',
                height: '86px',
                marginTop:
                  '12px',
                border:
                  'none',
                borderRadius:
                  '18px',
                background:
                  '#1f4b73',
                color:
                  '#ffffff',
                fontSize:
                  '25px',
                fontWeight:
                  900,
              }}
            >
              📸 CAPTURE
            </button>

            <div
              style={{
                marginTop:
                  '10px',
                textAlign:
                  'center',
                fontSize:
                  '22px',
                fontWeight:
                  900,
              }}
            >
              {photos.length}{' '}
              NEW PHOTO
              {photos.length === 1
                ? ''
                : 'S'}
            </div>

            {photos.length >
              0 && (
              <button
                type="button"
                disabled={
                  uploading
                }
                onClick={() =>
                  void uploadPhotos()
                }
                style={{
                  width: '100%',
                  padding:
                    '17px',
                  marginTop:
                    '10px',
                  border:
                    'none',
                  borderRadius:
                    '12px',
                  background:
                    '#166534',
                  color:
                    '#ffffff',
                  fontSize:
                    '18px',
                  fontWeight:
                    900,
                }}
              >
                {uploading
                  ? 'SAVING…'
                  : `SAVE ${photos.length} PHOTO${
                      photos.length ===
                      1
                        ? ''
                        : 'S'
                    }`}
              </button>
            )}

            <button
              type="button"
              disabled={
                uploading
              }
              onClick={() =>
                void saveAndNext()
              }
              style={{
                width: '100%',
                padding:
                  '18px',
                marginTop:
                  '10px',
                border:
                  '2px solid #1f4b73',
                borderRadius:
                  '12px',
                background:
                  '#ffffff',
                color:
                  '#1f4b73',
                fontSize:
                  '18px',
                fontWeight:
                  900,
              }}
            >
              SAVE & NEXT PART →
            </button>
          </>
        )}

        {message && (
          <div
            style={{
              marginTop:
                '12px',
              padding: '12px',
              background:
                '#ecfdf5',
              borderRadius:
                '10px',
              textAlign:
                'center',
              fontWeight:
                700,
            }}
          >
            {message}
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop:
                '12px',
              padding: '12px',
              background:
                '#fef2f2',
              color:
                '#991b1b',
              borderRadius:
                '10px',
              textAlign:
                'center',
              fontWeight:
                700,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
