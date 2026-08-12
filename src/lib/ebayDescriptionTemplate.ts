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

function hasUsefulVehicleData(input: TexasOemEbayTemplateInput) {
  return [input.year, input.make, input.model, input.trim]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .some((value) => Boolean(value) && !['n/a', 'na', 'donor unavailable', 'vehicle'].includes(value))
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
  const showVehicle = hasUsefulVehicleData(input)

  const photos = [input.primaryPhotoUrl, ...(input.photoUrls ?? [])]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 7)

  const heroPhoto = photos[0]
  const secondaryPhotos = photos.slice(1)

  const photoHtml = heroPhoto
    ? `
      <div style="background:#f5f6f8;border:1px solid #e1e5ea;padding:18px;margin-bottom:14px;text-align:center;">
        <img src="${escapeHtml(heroPhoto)}" alt="${escapeHtml(`${partName} primary photo`)}" style="display:block;max-width:100%;width:auto;height:auto;max-height:560px;margin:0 auto;object-fit:contain;" />
      </div>
      ${secondaryPhotos.length ? `<div style="display:block;text-align:center;margin:0 -4px 22px -4px;">${secondaryPhotos
        .map((url, index) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(`${partName} photo ${index + 2}`)}" style="display:inline-block;width:30.5%;max-width:255px;height:150px;object-fit:cover;margin:4px;border:1px solid #d9dde3;background:#fff;vertical-align:top;" />`)
        .join('')}</div>` : ''}
    `
    : ''

  const itemDetailsWidth = showVehicle ? '50%' : '100%'

  const vehicleHtml = showVehicle
    ? `<td style="width:50%;vertical-align:top;padding:0 0 0 10px;">
        <div style="background:#111820;color:#ffffff;padding:12px 15px;font-size:16px;font-weight:900;border-left:5px solid #d71920;letter-spacing:.3px;">VEHICLE / FITMENT</div>
        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e1e5ea;border-top:0;">
          <tr><td style="padding:11px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;width:40%;">DONOR VEHICLE</td><td style="padding:11px 12px;border-bottom:1px solid #e5e7eb;">${text(vehicle)}</td></tr>
          <tr><td style="padding:11px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">YEAR</td><td style="padding:11px 12px;border-bottom:1px solid #e5e7eb;">${text(input.year)}</td></tr>
          <tr><td style="padding:11px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">MAKE / MODEL</td><td style="padding:11px 12px;border-bottom:1px solid #e5e7eb;">${text([input.make, input.model].filter(Boolean).join(' '))}</td></tr>
          <tr><td style="padding:11px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">POSITION</td><td style="padding:11px 12px;border-bottom:1px solid #e5e7eb;">${text(input.position)}</td></tr>
          <tr><td style="padding:11px 12px;font-weight:800;">MILEAGE</td><td style="padding:11px 12px;">${text(input.mileage)}</td></tr>
        </table>
      </td>`
    : ''

  return `
<div style="margin:0;padding:0;background:#eceff3;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="max-width:980px;margin:0 auto;background:#ffffff;border:1px solid #d9dde3;box-shadow:0 8px 28px rgba(0,0,0,.08);">
    <div style="background:#090d14;padding:22px 28px 18px 28px;border-bottom:4px solid #d71920;">
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle;">
            <div style="font-size:38px;font-weight:900;letter-spacing:-2px;color:#ffffff;line-height:.95;">TE★AS</div>
            <div style="margin-top:7px;font-size:18px;font-weight:900;letter-spacing:4px;color:#ef2028;">OEM PARTS</div>
          </td>
          <td style="vertical-align:middle;text-align:right;">
            <div style="font-size:12px;font-weight:900;letter-spacing:1.3px;color:#ffffff;">QUALITY OEM PARTS</div>
            <div style="margin-top:4px;font-size:11px;color:#aeb7c4;">TESTED • INSPECTED • SHIPPED FAST</div>
          </td>
        </tr>
      </table>
    </div>

    <div style="background:#111820;color:#ffffff;padding:10px 28px;border-bottom:1px solid #242c37;font-size:11px;font-weight:800;letter-spacing:1px;text-align:center;">
      100% OEM • PROFESSIONAL SERVICE • FAST SHIPPING • BUY WITH CONFIDENCE
    </div>

    <div style="padding:24px 28px 8px 28px;">
      <div style="font-size:30px;line-height:1.18;font-weight:900;text-transform:uppercase;color:#111827;">${text(title)}</div>
      <div style="margin-top:11px;height:3px;width:86px;background:#d71920;"></div>
      <div style="margin-top:10px;font-size:13px;font-weight:800;letter-spacing:1px;color:#4b5563;">TESTED • OEM QUALITY • BUY WITH CONFIDENCE</div>
    </div>

    <div style="padding:10px 28px 0 28px;">
      ${photoHtml}

      <div style="background:#111820;border-left:5px solid #d71920;padding:14px 16px;margin-bottom:22px;color:#ffffff;font-size:14px;font-weight:900;letter-spacing:.5px;">
        100% OEM PART • TESTED &amp; INSPECTED • GUARANTEED TO MATCH OUR DESCRIPTION
      </div>

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="width:${itemDetailsWidth};vertical-align:top;padding:${showVehicle ? '0 10px 0 0' : '0'};">
            <div style="background:#111820;color:#ffffff;padding:12px 15px;font-size:16px;font-weight:900;border-left:5px solid #d71920;letter-spacing:.3px;">ITEM DETAILS</div>
            <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #e1e5ea;border-top:0;">
              <tr><td style="padding:11px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;width:40%;">PART NAME</td><td style="padding:11px 12px;border-bottom:1px solid #e5e7eb;">${text(partName)}</td></tr>
              <tr><td style="padding:11px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">OEM PART #</td><td style="padding:11px 12px;border-bottom:1px solid #e5e7eb;color:#d71920;font-weight:900;font-size:17px;">${text(input.partNumber)}</td></tr>
              <tr><td style="padding:11px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">INTERCHANGE</td><td style="padding:11px 12px;border-bottom:1px solid #e5e7eb;">${text(input.interchangeNumber, '—')}</td></tr>
              <tr><td style="padding:11px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">CONDITION</td><td style="padding:11px 12px;border-bottom:1px solid #e5e7eb;">${text(condition)}</td></tr>
              <tr><td style="padding:11px 12px;font-weight:800;border-bottom:1px solid #e5e7eb;">SKU</td><td style="padding:11px 12px;border-bottom:1px solid #e5e7eb;">${text(input.sku)}</td></tr>
              <tr><td style="padding:11px 12px;font-weight:800;">CATEGORY</td><td style="padding:11px 12px;">${text(input.category, 'General OEM Parts')}</td></tr>
            </table>
          </td>
          ${vehicleHtml}
        </tr>
      </table>

      <div style="background:#f7f8fa;border:1px solid #e1e5ea;padding:0;margin-bottom:24px;">
        <div style="background:#111820;color:#ffffff;padding:12px 15px;font-size:16px;font-weight:900;border-left:5px solid #d71920;">ITEM DESCRIPTION</div>
        <div style="font-size:15px;line-height:1.7;color:#202733;padding:18px 18px 20px 18px;">${text(notes)}</div>
      </div>

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="width:25%;padding:16px 10px;text-align:center;border:1px solid #e1e5ea;background:#fff;"><div style="font-size:22px;line-height:1;">✓</div><div style="font-weight:900;font-size:13px;margin-top:7px;">QUALITY OEM</div><div style="font-size:11px;color:#596273;margin-top:4px;">Tested &amp; inspected</div></td>
          <td style="width:25%;padding:16px 10px;text-align:center;border:1px solid #e1e5ea;background:#fff;"><div style="font-size:22px;line-height:1;">⚙</div><div style="font-weight:900;font-size:13px;margin-top:7px;">PART VERIFIED</div><div style="font-size:11px;color:#596273;margin-top:4px;">OEM number checked</div></td>
          <td style="width:25%;padding:16px 10px;text-align:center;border:1px solid #e1e5ea;background:#fff;"><div style="font-size:22px;line-height:1;">🚚</div><div style="font-weight:900;font-size:13px;margin-top:7px;">FAST SHIPPING</div><div style="font-size:11px;color:#596273;margin-top:4px;">${text(shippingText)}</div></td>
          <td style="width:25%;padding:16px 10px;text-align:center;border:1px solid #e1e5ea;background:#fff;"><div style="font-size:22px;line-height:1;">★</div><div style="font-weight:900;font-size:13px;margin-top:7px;">${text(warrantyText)}</div><div style="font-size:11px;color:#596273;margin-top:4px;">Buy with confidence</div></td>
        </tr>
      </table>

      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="width:50%;vertical-align:top;padding:0 10px 0 0;">
            <div style="background:#111820;color:#ffffff;padding:12px 15px;font-size:15px;font-weight:900;border-left:5px solid #d71920;">WHY BUY FROM US?</div>
            <div style="border:1px solid #e1e5ea;border-top:0;padding:16px 18px;font-size:13px;line-height:1.8;color:#303744;">
              ✓ Genuine OEM parts<br/>
              ✓ Tested and inspected<br/>
              ✓ Fast professional shipping<br/>
              ✓ Carefully packaged<br/>
              ✓ Responsive customer service
            </div>
          </td>
          <td style="width:50%;vertical-align:top;padding:0 0 0 10px;">
            <div style="background:#d71920;color:#ffffff;padding:12px 15px;font-size:15px;font-weight:900;">NOTE TO BUYER</div>
            <div style="border:1px solid #e1e5ea;border-top:0;padding:16px 18px;font-size:13px;line-height:1.65;color:#374151;min-height:120px;">
              Please match the OEM part number and verify fitment before purchasing. If you are unsure about fitment, message us before ordering and we will be happy to help.
            </div>
          </td>
        </tr>
      </table>
    </div>

    <div style="background:#090d14;padding:22px 28px;color:#ffffff;border-top:4px solid #d71920;">
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle;">
            <div style="font-size:24px;font-weight:900;">TEXAS <span style="color:#ef2028;">OEM PARTS</span></div>
            <div style="margin-top:7px;font-size:11px;letter-spacing:1.1px;color:#d8dde6;">100% OEM • TESTED • PROFESSIONAL SERVICE • FAST SHIPPING</div>
          </td>
          <td style="vertical-align:middle;text-align:right;font-size:12px;color:#d8dde6;">Thank you for supporting Texas OEM Parts.</td>
        </tr>
      </table>
    </div>
  </div>
</div>`.trim()
}
