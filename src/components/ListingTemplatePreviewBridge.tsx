import { useEffect, useMemo, useState } from 'react'
import { buildTexasOemEbayDescription } from '../lib/ebayDescriptionTemplate'

type PreviewData = {
  title: string
  partName: string
  partNumber: string
  interchangeNumber: string
  sku: string
  condition: string
  vehicle: string
  notes: string
  photoUrls: string[]
}

function readFieldValue(modal: Element, label: string) {
  const field = Array.from(modal.querySelectorAll('label.field')).find((node) =>
    node.querySelector('span')?.textContent?.trim().toLowerCase() === label.toLowerCase(),
  )
  const input = field?.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null
  return input?.value?.trim() ?? ''
}

function readDetailValue(label: string) {
  const modal = document.querySelector('[aria-label="Part details"]')
  if (!modal) return ''
  const card = Array.from(modal.querySelectorAll('.detailCard')).find((node) =>
    node.querySelector(':scope > span')?.textContent?.trim().toLowerCase() === label.toLowerCase(),
  )
  return card?.querySelector(':scope > strong')?.textContent?.trim() ?? ''
}

function splitVehicle(vehicle: string) {
  const match = vehicle.trim().match(/^(\d{4})\s+([^\s]+)\s+(.+)$/)
  return match
    ? { year: match[1] ?? '', make: match[2] ?? '', model: match[3] ?? '' }
    : { year: '', make: '', model: vehicle.trim() }
}

export function ListingTemplatePreviewBridge() {
  const [draftModalOpen, setDraftModalOpen] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState<PreviewData | null>(null)

  useEffect(() => {
    const sync = () => {
      const open = Boolean(document.querySelector('[aria-label="Listing draft"]'))
      setDraftModalOpen(open)
      if (!open) setShowPreview(false)
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const html = useMemo(() => {
    if (!previewData) return ''
    const vehicle = splitVehicle(previewData.vehicle)
    return buildTexasOemEbayDescription({
      title: previewData.title,
      partName: previewData.partName,
      partNumber: previewData.partNumber,
      interchangeNumber: previewData.interchangeNumber,
      sku: previewData.sku,
      condition: previewData.condition,
      notes: previewData.notes,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      primaryPhotoUrl: previewData.photoUrls[0],
      photoUrls: previewData.photoUrls,
    })
  }, [previewData])

  const openPreview = () => {
    const draftModal = document.querySelector('[aria-label="Listing draft"]')
    if (!draftModal) return
    const partDetails = document.querySelector('[aria-label="Part details"]')
    const photos = partDetails
      ? Array.from(partDetails.querySelectorAll('.photoTile img')).map((image) => (image as HTMLImageElement).src).filter(Boolean)
      : []

    setPreviewData({
      title: readFieldValue(draftModal, 'Title'),
      partName: partDetails?.querySelector('.modalHeader h2')?.textContent?.trim() || readFieldValue(draftModal, 'Title') || 'OEM Auto Part',
      partNumber: readDetailValue('Part Number'),
      interchangeNumber: readDetailValue('Interchange'),
      sku: readDetailValue('SKU'),
      condition: readDetailValue('Condition') || 'Used OEM',
      vehicle: readDetailValue('Vehicle'),
      notes: readFieldValue(draftModal, 'Description'),
      photoUrls: photos,
    })
    setShowPreview(true)
  }

  if (!draftModalOpen) return null

  return (
    <>
      <button type="button" onClick={openPreview} style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 10050, border: 0, borderRadius: 10, padding: '13px 18px', background: '#d71920', color: '#fff', fontWeight: 900, fontSize: 14, boxShadow: '0 12px 30px rgba(0,0,0,.25)', cursor: 'pointer' }}>
        Preview Texas OEM Template
      </button>

      {showPreview ? (
        <div role="dialog" aria-modal="true" aria-label="Texas OEM eBay listing preview" onClick={() => setShowPreview(false)} style={{ position: 'fixed', inset: 0, zIndex: 10100, background: 'rgba(4,8,15,.82)', padding: 18, overflow: 'auto' }}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: 'min(1100px, 100%)', margin: '0 auto', background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#0a0f17', color: '#fff', padding: '14px 18px', borderBottom: '4px solid #d71920' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Texas OEM Parts</div>
                <div style={{ opacity: .72, fontSize: 12, marginTop: 2 }}>eBay listing preview — nothing is being published</div>
              </div>
              <button type="button" onClick={() => setShowPreview(false)} style={{ border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, background: 'transparent', color: '#fff', padding: '8px 12px', fontWeight: 800, cursor: 'pointer' }}>
                Close
              </button>
            </div>
            <iframe title="Texas OEM eBay description preview" srcDoc={html} style={{ width: '100%', minHeight: '1350px', border: 0, display: 'block', background: '#f4f5f7' }} />
          </div>
        </div>
      ) : null}
    </>
  )
}
