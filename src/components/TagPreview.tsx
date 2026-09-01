import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { buildCode128SvgDataUri } from '../lib/sku'
import './TagPreview.css'

export type TagMode = 'full' | 'compact'

export type TagPreviewData = {
  id: string
  sku: string
  partName: string
  oemPartNumber: string
  donorYear: string
  donorMake: string
  donorModel: string
  vin: string
  stockNumber: string
  condition: string
  shelfLocation: string
  dateInventoried: string
  listPrice: number
  notes: string
  cleaned: boolean
  photographed: boolean
  listed: boolean
  sold: boolean
  internalUrl: string
}

type TagPreviewProps = {
  data: TagPreviewData
  mode: TagMode
  className?: string
  pieceLabel?: string
  barcodeValue?: string
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDisplayDate(value: string) {
  if (!value) return '____________'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-US')
}

function formatChecklistMark(value: boolean) {
  return value ? '■' : '□'
}

export function TagPreview({
  data,
  mode,
  className = '',
  pieceLabel = '',
  barcodeValue = '',
}: TagPreviewProps) {
  const [qrDataUri, setQrDataUri] = useState('')

  useEffect(() => {
    let canceled = false

    void QRCode.toDataURL(data.internalUrl || data.id, {
      margin: 1,
      width: mode === 'compact' ? 96 : 136,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    }).then((uri: string) => {
      if (!canceled) {
        setQrDataUri(uri)
      }
    }).catch(() => {
      if (!canceled) {
        setQrDataUri('')
      }
    })

    return () => {
      canceled = true
    }
  }, [data.id, data.internalUrl, mode])

  const barcodeDataUri = useMemo(
    () =>
      buildCode128SvgDataUri(
        barcodeValue || data.sku,
      ),
    [barcodeValue, data.sku],
  )

  if (mode === 'compact') {
    return (
      <section className={`tagPreview tagPreviewCompact ${className}`}>
        <header className="tagHeader tagHeaderCompactBranded">
          <div className="tagLogoSlot">
            <img
              className="tagLogo"
              src="/branding/texas-oem-parts-tag-logo.png"
              alt="Texas OEM Parts"
            />
          </div>
        </header>

        <div className="tagCompactTop">
          <div className="tagCompactDetails">
            <p className="tagKey">SKU</p>
            <p className="tagSku">{data.sku || 'N/A'}</p>
            {pieceLabel ? (
              <p
                style={{
                  fontSize: '22px',
                  fontWeight: 900,
                  margin: '4px 0',
                }}
              >
                {pieceLabel}
              </p>
            ) : null}
            <p className="tagPartName">{data.partName || 'Unnamed Part'}</p>
            <p className="tagPartNumber">OEM #{data.oemPartNumber || 'N/A'}</p>

            {data.donorYear || data.donorMake || data.donorModel ? (
              <p className="tagMiniMeta">
                {[data.donorYear, data.donorMake, data.donorModel].filter(Boolean).join(' ')}
              </p>
            ) : (
              <p className="tagMiniMeta">Standalone Part</p>
            )}

            <p className="tagMiniMeta">
              Shelf: {data.shelfLocation || 'Unassigned'} • {formatCurrency(data.listPrice)}
            </p>
          </div>

          {qrDataUri ? (
            <div
              style={{
                marginLeft: 'auto',
                paddingLeft: '12px',
                flexShrink: 0,
              }}
            >
              <img
                src={qrDataUri}
                alt="Internal record QR"
                style={{
                  width: '96px',
                  height: '96px',
                  display: 'block',
                }}
              />
            </div>
          ) : null}
        </div>

        {barcodeDataUri ? (
          <img className="tagBarcode tagBarcodeCompact" src={barcodeDataUri} alt="SKU barcode" />
        ) : null}
      </section>
    )
  }

  const donorLine = [data.donorYear, data.donorMake, data.donorModel].filter(Boolean).join(' ')

  return (
    <section className={`tagPreview tagPreviewFull ${className}`}>
      <header className="tagHeader tagHeaderFull tagHeaderBranded">
        <div className="tagLogoSlot">
          <img
            className="tagLogo"
            src="/branding/texas-oem-parts-tag-logo.png"
            alt="Texas OEM Parts"
          />
        </div>
      </header>

      <div className="tagPrimaryBlock">
        <p className="tagPartNameXL">{data.partName || 'UNNAMED PART'}</p>
      </div>

      <div className="tagPrimaryMetaGrid">
        <div className="tagMetaCell">
          <p className="tagKey">SKU</p>
          <p className="tagSkuXL">{data.sku || 'N/A'}</p>
          {pieceLabel ? (
            <p
              style={{
                fontSize: '24px',
                fontWeight: 900,
                margin: '6px 0 0',
              }}
            >
              {pieceLabel}
            </p>
          ) : null}
        </div>
        <div className="tagMetaCell">
          <p className="tagKey">OEM #</p>
          <p className="tagOemXL">{data.oemPartNumber || 'N/A'}</p>
        </div>
      </div>

      <div className="tagBarcodeBlock">
        {barcodeDataUri ? <img className="tagBarcodeXL" src={barcodeDataUri} alt="SKU barcode" /> : <p>N/A</p>}
      </div>

      <div className="tagMainGrid">
        <div className="tagSectionBox">
          <p className="tagSectionTitle">Donor Vehicle</p>
          <p className="tagDonorLine">{donorLine || 'N/A'}</p>
          <p className="tagMetaLine">Stock #: {data.stockNumber || 'N/A'}</p>
          <p className="tagMetaLine">VIN: {data.vin || 'N/A'}</p>
        </div>

        <div className="tagSectionBox tagStorageBox">
          <p className="tagSectionTitle">Storage</p>
          <p className="tagStorageValue">{data.shelfLocation || 'UNASSIGNED'}</p>
          <p className="tagMetaLine">Condition: {data.condition || 'N/A'}</p>
          <p className="tagMetaLine">Inventoried: {formatDisplayDate(data.dateInventoried)}</p>
        </div>
      </div>

      <div className="tagBottomGrid" aria-label="Bottom tag section">
        <div className="tagSectionBox tagBottomColumn tagQrColumn">
          <p className="tagSectionTitle">Internal Record</p>
          {qrDataUri ? <img className="tagQr" src={qrDataUri} alt="Part QR" /> : <div className="tagQrPlaceholder">QR</div>}
          <p className="tagMetaLine">ID: {data.id || 'N/A'}</p>
        </div>

        <div className="tagSectionBox tagBottomColumn tagQcColumn">
          <p className="tagSectionTitle">Quality Control</p>
          <div className="tagQcGrid" aria-label="Quality control checklist">
            <span>{formatChecklistMark(data.condition.toLowerCase().includes('tested'))} TESTED</span>
            <span>{formatChecklistMark(data.cleaned)} CLEANED</span>
            <span>{formatChecklistMark(data.photographed)} PHOTO</span>
            <span>{formatChecklistMark(data.listed)} LISTED</span>
          </div>
        </div>
      </div>
    </section>
  )
}
