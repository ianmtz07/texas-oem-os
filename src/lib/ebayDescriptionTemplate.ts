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

export function buildTexasOemEbayDescription(input: TexasOemEbayTemplateInput) {
  const vehicle = [input.year, input.make, input.model, input.trim]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ')

  const partName = String(input.partName ?? 'OEM Auto Part').trim() || 'OEM Auto Part'
  const title = String(input.title ?? '').trim() || `${vehicle ? `${vehicle} ` : ''}${partName}`
  const condition = String(input.condition ?? 'Used OEM').trim() || 'Used OEM'
  const shippingText = String(input.shippingText ?? 'FREE SHIPPING — Lower 48 States').trim()
  const warrantyText = String(input.warrantyText ?? '30 Day Warranty').trim()
  const notes = String(input.notes ?? '').trim() || 'Please review all photos and verify part number and fitment before purchase.'

  const photos = [input.primaryPhotoUrl, ...(input.photoUrls ?? [])]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 6)

  const photoHtml = photos.length
    ? `<div style="margin:0 0 22px 0;text-align:center;">${photos
        .map((url, index) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(`${partName} photo ${index + 1}`)}" style="display:inline-block;width:${index === 0 ? '100%' : '31.5%'};max-width:${index === 0 ? '900px' : '285px'};height:auto;margin:${index === 0 ? '0 0 10px 0' : '4px'};border:1px solid #d9dde3;border-radius:8px;vertical-align:top;" />`)
        .join('')}</div>`
    : ''

  return `
<div style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:980px;margin:0 auto;background:#ffffff;border:1px solid #dfe3e8;">
    <div style="background:#090d14;padding:22px 28px;border-bottom:4px solid #d71920;">
      <div style="font-size:31px;font-weight:900;letter-spacing:-1px;color:#ffffff;line-height:1;">TE★AS</div>
      <div style="margin-top:5px;font-size:18px;font-weight:800;letter-spacing:3px;color:#ef2028;">OEM PARTS</div>
      <div style="margin-top:12px;font-size:12px;font-weight:700;letter-spacing:1.4px;color:#d8dde6;">PROFESSIONAL • ACCURATE • FAST SHIPPING</div>
    </div>

    <div style="padding:26px 28px 10px 28px;">
      <div style="font-size:28px;line-height:1.2;font-weight:900;text-transform:uppercase;color:#111827;">${text(title)}</div>
      <div style="margin-top:10px;font-size:13px;font-weight:800;letter-spacing:1px;color:#4b5563;">TESTED • OEM QUALITY • BUY WITH CONFIDENCE</div>
    </div>

    <div style="padding:8px 28px 0 28px;">
      ${photoHtml}
      <div style="background:#111820;border-left:5px solid #d71920;padding:14px 16px;margin-bottom:22px;color:#ffffff;font-size:14px;font-weight:800;letter-spacing:.5px;">
        100% OEM PART • TESTED &amp; INSPECTED • GUARANTEED TO MATCH OUR DESCRIPTION
      </div>

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="width:50%;vertical-align:top;padding:0 10px 0 0;">
            <div style="background:#111820;color:#ffffff;padding:11px 14px;font-size:16px;font-weight:900;border-left:5px solid #d71920;">ITEM DETAILS</div>
            <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e1e5ea;border-top:0;">
              <tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;width:40%;">PART NAME</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${text(partName)}</td></tr>
              <tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">OEM PART #</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#d71920;font-weight:900;">${text(input.partNumber)}</td></tr>
              <tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">INTERCHANGE</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${text(input.interchangeNumber)}</td></tr>
              <tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">CONDITION</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${text(condition)}</td></tr>
              <tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">SKU</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${text(input.sku)}</td></tr>
              <tr><td style="padding:10px 12px;font-weight:800;">CATEGORY</td><td style="padding:10px 12px;">${text(input.category)}</td></tr>
            </table>
          </td>
          <td style="width:50%;vertical-align:top;padding:0 0 0 10px;">
            <div style="background:#111820;color:#ffffff;padding:11px 14px;font-size:16px;font-weight:900;border-left:5px solid #d71920;">VEHICLE / FITMENT</div>
            <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e1e5ea;border-top:0;">
              <tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;width:40%;">DONOR VEHICLE</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${text(vehicle)}</td></tr>
              <tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">YEAR</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${text(input.year)}</td></tr>
              <tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">MAKE / MODEL</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${text([input.make, input.model].filter(Boolean).join(' '))}</td></tr>
              <tr><td style="padding:10px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">POSITION</td><td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${text(input.position)}</td></tr>
              <tr><td style="padding:10px 12px;font-weight:800;">MILEAGE</td><td style="padding:10px 12px;">${text(input.mileage)}</td></tr>
            </table>
          </td>
        </tr>
      </table>

      <div style="font-size:18px;font-weight:900;color:#d71920;margin:0 0 9px 0;">ITEM DESCRIPTION</div>
      <div style="font-size:15px;line-height:1.65;color:#202733;margin-bottom:24px;">${text(notes)}</div>

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="width:33.33%;padding:16px;text-align:center;border:1px solid #e1e5ea;"><div style="font-weight:900;font-size:15px;">QUALITY OEM PARTS</div><div style="font-size:12px;color:#596273;margin-top:5px;">Tested &amp; inspected</div></td>
          <td style="width:33.33%;padding:16px;text-align:center;border:1px solid #e1e5ea;"><div style="font-weight:900;font-size:15px;">FAST SHIPPING</div><div style="font-size:12px;color:#596273;margin-top:5px;">${text(shippingText)}</div></td>
          <td style="width:33.33%;padding:16px;text-align:center;border:1px solid #e1e5ea;"><div style="font-weight:900;font-size:15px;">${text(warrantyText)}</div><div style="font-size:12px;color:#596273;margin-top:5px;">Buy with confidence</div></td>
        </tr>
      </table>

      <div style="background:#f7f8fa;border:1px solid #e1e5ea;border-left:5px solid #d71920;padding:16px 18px;margin-bottom:24px;">
        <div style="font-size:16px;font-weight:900;margin-bottom:7px;">NOTE TO BUYER</div>
        <div style="font-size:13px;line-height:1.55;color:#374151;">Please match the OEM part number and verify fitment before purchasing. If you are unsure about fitment, message us before ordering.</div>
      </div>
    </div>

    <div style="background:#090d14;padding:22px 28px;color:#ffffff;border-top:4px solid #d71920;">
      <div style="font-size:21px;font-weight:900;">TEXAS <span style="color:#ef2028;">OEM PARTS</span></div>
      <div style="margin-top:8px;font-size:12px;letter-spacing:1px;color:#d8dde6;">100% OEM • TESTED • PROFESSIONAL SERVICE • FAST SHIPPING</div>
      <div style="margin-top:12px;font-size:13px;color:#ffffff;">Thank you for supporting Texas OEM Parts.</div>
    </div>
  </div>
</div>`.trim()
}
