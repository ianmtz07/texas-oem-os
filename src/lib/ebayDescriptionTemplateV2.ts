export type TexasOemEbayTemplateInput = {
  title?: string | null
  partName?: string | null
  partNumber?: string | null
  interchangeNumber?: string | null
  sku?: string | null
  condition?: string | null
  notes?: string | null
  year?: string | null
  make?: string | null
  model?: string | null
  trim?: string | null
  mileage?: string | number | null
  position?: string | null
  category?: string | null
  shippingText?: string | null
  warrantyText?: string | null
  primaryPhotoUrl?: string | null
  photoUrls?: Array<string | null | undefined>
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function text(value: unknown, fallback = 'N/A') {
  const normalized = String(value ?? '').trim()
  return escapeHtml(normalized || fallback)
}

function useful(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return Boolean(normalized) && !['n/a', 'na', 'donor unavailable', 'vehicle', 'for vehicle'].includes(normalized)
}

function hasUsefulVehicleData(input: TexasOemEbayTemplateInput) {
  return [input.year, input.make, input.model, input.trim].some(useful)
}

function cleanDisplayTitle(input: TexasOemEbayTemplateInput, showVehicle: boolean) {
  const partName = String(input.partName ?? 'OEM Auto Part').trim() || 'OEM Auto Part'
  let title = String(input.title ?? '').trim()

  if (!showVehicle) {
    title = title
      .replace(/\s+for\s+vehicle\s*$/i, '')
      .replace(/\s+for\s+donor unavailable\s*$/i, '')
      .trim()
  }

  if (!title || /^for vehicle$/i.test(title)) return partName
  return title
}

export function buildTexasOemEbayDescription(input: TexasOemEbayTemplateInput) {
  const showVehicle = hasUsefulVehicleData(input)
  const vehicle = [input.year, input.make, input.model, input.trim]
    .map((value) => String(value ?? '').trim())
    .filter(useful)
    .join(' ')

  const partName = String(input.partName ?? 'OEM Auto Part').trim() || 'OEM Auto Part'
  const title = cleanDisplayTitle(input, showVehicle)
  const condition = String(input.condition ?? 'Used OEM').trim() || 'Used OEM'
  const shippingText = String(input.shippingText ?? 'FREE SHIPPING — Lower 48 States').trim()
  const warrantyText = String(input.warrantyText ?? '30 Day Warranty').trim()
  const notes = String(input.notes ?? '').trim() || 'Please review all photos and verify part number and fitment before purchase.'
  const partNumber = String(input.partNumber ?? '').trim()

  const photos = [input.primaryPhotoUrl, ...(input.photoUrls ?? [])]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 7)

  const heroPhoto = photos[0]
  const secondaryPhotos = photos.slice(1)

  const photoHtml = heroPhoto
    ? `<div style="background:#f3f5f7;border:1px solid #dde2e8;padding:14px;margin:0 0 12px 0;text-align:center;">
        <img src="${escapeHtml(heroPhoto)}" alt="${escapeHtml(`${partName} primary photo`)}" style="display:block;max-width:100%;width:auto;height:auto;max-height:485px;margin:0 auto;object-fit:contain;" />
      </div>
      ${secondaryPhotos.length ? `<div style="text-align:center;margin:0 -3px 20px -3px;">${secondaryPhotos.map((url, index) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(`${partName} photo ${index + 2}`)}" style="display:inline-block;width:29%;max-width:230px;height:125px;object-fit:cover;margin:3px;border:1px solid #d8dde3;background:#fff;vertical-align:top;" />`).join('')}</div>` : ''}`
    : ''

  const vehicleHtml = showVehicle
    ? `<td style="width:50%;vertical-align:top;padding-left:9px;">
        <div style="background:#111820;color:#fff;padding:11px 14px;font-size:15px;font-weight:900;border-left:5px solid #d71920;">VEHICLE / FITMENT</div>
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e1e5ea;border-top:0;">
          <tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;width:38%;">DONOR</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${text(vehicle)}</td></tr>
          <tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">POSITION</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${text(input.position, '—')}</td></tr>
          <tr><td style="padding:10px 12px;font-weight:800;">MILEAGE</td><td style="padding:10px 12px;">${text(input.mileage, '—')}</td></tr>
        </table>
      </td>`
    : ''

  return `<div style="margin:0;padding:0;background:#edf0f3;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:980px;margin:0 auto;background:#fff;border:1px solid #d8dde4;">

    <div style="background:#080d14;border-bottom:4px solid #d71920;padding:20px 28px;">
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle;">
            <div style="font-size:37px;font-weight:900;letter-spacing:-2px;color:#fff;line-height:.95;">TE★AS</div>
            <div style="margin-top:7px;font-size:17px;font-weight:900;letter-spacing:4px;color:#ef2028;">OEM PARTS</div>
          </td>
          <td style="vertical-align:middle;text-align:right;font-size:11px;font-weight:800;letter-spacing:1px;color:#c7ced8;line-height:1.7;">GENUINE OEM PARTS<br/>TESTED • INSPECTED • READY TO SHIP</td>
        </tr>
      </table>
    </div>

    <div style="padding:24px 28px 20px 28px;background:#fff;">
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle;padding-right:18px;">
            <div style="font-size:11px;font-weight:900;letter-spacing:1.6px;color:#d71920;text-transform:uppercase;margin-bottom:7px;">${showVehicle ? 'OEM REPLACEMENT PART' : 'READY TO SHIP'}</div>
            <div style="font-size:27px;line-height:1.18;font-weight:900;color:#111827;">${text(title)}</div>
            <div style="margin-top:9px;font-size:12px;font-weight:700;color:#66707d;">${text(condition)} • Professionally inspected • Buy with confidence</div>
          </td>
          ${partNumber ? `<td style="width:225px;vertical-align:middle;text-align:right;">
            <div style="display:inline-block;min-width:190px;background:#111820;border-radius:4px;overflow:hidden;text-align:center;">
              <div style="padding:7px 10px;color:#fff;font-size:10px;font-weight:900;letter-spacing:1.2px;">OEM PART NUMBER</div>
              <div style="padding:10px 12px;background:#d71920;color:#fff;font-size:22px;font-weight:900;letter-spacing:.5px;">${text(partNumber)}</div>
            </div>
          </td>` : ''}
        </tr>
      </table>
    </div>

    <div style="background:#111820;color:#fff;padding:9px 28px;font-size:11px;font-weight:800;letter-spacing:.9px;text-align:center;">100% OEM • TESTED &amp; INSPECTED • FAST SHIPPING • BUY WITH CONFIDENCE</div>

    <div style="padding:18px 28px 0 28px;">
      ${photoHtml}

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:22px;">
        <tr>
          <td style="width:${showVehicle ? '50%' : '100%'};vertical-align:top;${showVehicle ? 'padding-right:9px;' : ''}">
            <div style="background:#111820;color:#fff;padding:11px 14px;font-size:15px;font-weight:900;border-left:5px solid #d71920;">ITEM DETAILS</div>
            <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e1e5ea;border-top:0;">
              <tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;width:38%;">PART NAME</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${text(partName)}</td></tr>
              ${partNumber ? `<tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">OEM PART #</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#d71920;font-weight:900;">${text(partNumber)}</td></tr>` : ''}
              <tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">INTERCHANGE</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${text(input.interchangeNumber, '—')}</td></tr>
              <tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">CONDITION</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${text(condition)}</td></tr>
              <tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">SKU</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${text(input.sku)}</td></tr>
              <tr><td style="padding:10px 12px;font-weight:800;">CATEGORY</td><td style="padding:10px 12px;">${text(input.category, 'General OEM Parts')}</td></tr>
            </table>
          </td>
          ${vehicleHtml}
        </tr>
      </table>

      <div style="border:1px solid #e1e5ea;margin-bottom:22px;">
        <div style="background:#111820;color:#fff;padding:11px 14px;font-size:15px;font-weight:900;border-left:5px solid #d71920;">ITEM DESCRIPTION</div>
        <div style="font-size:14px;line-height:1.7;color:#29313d;padding:17px 18px 19px 18px;">${text(notes)}</div>
      </div>

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:22px;">
        <tr>
          <td style="width:25%;padding:15px 8px;text-align:center;border:1px solid #e1e5ea;"><div style="font-size:20px;">✓</div><div style="font-size:12px;font-weight:900;margin-top:6px;">OEM QUALITY</div><div style="font-size:10px;color:#66707d;margin-top:3px;">Inspected part</div></td>
          <td style="width:25%;padding:15px 8px;text-align:center;border:1px solid #e1e5ea;"><div style="font-size:20px;">⚙</div><div style="font-size:12px;font-weight:900;margin-top:6px;">PART VERIFIED</div><div style="font-size:10px;color:#66707d;margin-top:3px;">Details checked</div></td>
          <td style="width:25%;padding:15px 8px;text-align:center;border:1px solid #e1e5ea;"><div style="font-size:20px;">🚚</div><div style="font-size:12px;font-weight:900;margin-top:6px;">FAST SHIPPING</div><div style="font-size:10px;color:#66707d;margin-top:3px;">${text(shippingText)}</div></td>
          <td style="width:25%;padding:15px 8px;text-align:center;border:1px solid #e1e5ea;"><div style="font-size:20px;">★</div><div style="font-size:12px;font-weight:900;margin-top:6px;">${text(warrantyText)}</div><div style="font-size:10px;color:#66707d;margin-top:3px;">Buy with confidence</div></td>
        </tr>
      </table>

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:22px;">
        <tr>
          <td style="width:50%;vertical-align:top;padding-right:9px;">
            <div style="background:#111820;color:#fff;padding:11px 14px;font-size:14px;font-weight:900;border-left:5px solid #d71920;">WHY BUY FROM US?</div>
            <div style="border:1px solid #e1e5ea;border-top:0;padding:15px 18px;font-size:12px;line-height:1.85;color:#303744;">✓ Genuine OEM inventory<br/>✓ Tested and inspected<br/>✓ Carefully packaged<br/>✓ Fast professional shipping<br/>✓ Responsive customer service</div>
          </td>
          <td style="width:50%;vertical-align:top;padding-left:9px;">
            <div style="background:#d71920;color:#fff;padding:11px 14px;font-size:14px;font-weight:900;">NOTE TO BUYER</div>
            <div style="border:1px solid #e1e5ea;border-top:0;padding:15px 18px;font-size:12px;line-height:1.7;color:#374151;min-height:116px;">Please match the OEM part number and verify fitment before purchasing. If you are unsure, message us before ordering and we will be happy to help.</div>
          </td>
        </tr>
      </table>
    </div>

    <div style="background:#080d14;border-top:4px solid #d71920;padding:20px 28px;color:#fff;">
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        <tr><td><div style="font-size:22px;font-weight:900;">TEXAS <span style="color:#ef2028;">OEM PARTS</span></div><div style="margin-top:6px;font-size:10px;letter-spacing:1px;color:#c8ced7;">100% OEM • TESTED • PROFESSIONAL SERVICE • FAST SHIPPING</div></td><td style="text-align:right;font-size:11px;color:#c8ced7;">Thank you for supporting Texas OEM Parts.</td></tr>
      </table>
    </div>
  </div>
</div>`.trim()
}
