export type TexasOemEbayTemplateInput={title?:string|null;partName?:string|null;partNumber?:string|null;interchangeNumber?:string|null;sku?:string|null;condition?:string|null;notes?:string|null;year?:string|null;make?:string|null;model?:string|null;trim?:string|null;mileage?:string|number|null;vin?:string|null;engine?:string|null;transmission?:string|null;position?:string|null;category?:string|null;compatibility?:Array<{year?:string|null;make?:string|null;model?:string|null;trim?:string|null;engine?:string|null;notes?:string|null;verified?:boolean}>;shippingText?:string|null;warrantyText?:string|null;primaryPhotoUrl?:string|null;photoUrls?:Array<string|null|undefined>}
const esc=(v:unknown)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')
const val=(v:unknown,f='—')=>esc(String(v??'').trim()||f)
const svg=(body:string,w=42,h=42)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const chat=svg('<path d="M8 10h32v23H21l-9 7v-7H8z"/><circle cx="18" cy="22" r="1.5" fill="currentColor" stroke="none"/><circle cx="24" cy="22" r="1.5" fill="currentColor" stroke="none"/><circle cx="30" cy="22" r="1.5" fill="currentColor" stroke="none"/>')
const texas=`<img src="data:image/png;base64,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" width="92" height="86" alt="Texas OEM Parts" style="display:block;width:92px;height:86px;object-fit:contain">`
export function buildTexasOemEbayDescription(i:TexasOemEbayTemplateInput){
  const clean=(v:unknown)=>String(v??'').trim()

  const name=clean(i.partName)||'OEM Auto Part'
  let title=clean(i.title)||name
  title=title.replace(/\s+for\s+vehicle\s*$/i,'').trim()||name

  const pn=clean(i.partNumber)
  const interchange=clean(i.interchangeNumber)
  const sku=clean(i.sku)
  const condition=clean(i.condition)||'Used'
  const notes=clean(i.notes)||'Please review all photos and verify fitment before purchase.'

  const year=clean(i.year)
  const make=clean(i.make)
  const model=clean(i.model)
  const trim=clean(i.trim)
  const vin=clean(i.vin)
  const engine=clean(i.engine)
  const transmission=clean(i.transmission)
  const mileage=clean(i.mileage)
  const position=clean(i.position)
  const category=clean(i.category)

  const donorVehicle=[year,make,model,trim]
    .filter(Boolean)
    .join(' ')
    .trim()

  const conditionLower=condition.toLowerCase()

  const isUntested=
    conditionLower.includes('untested') ||
    conditionLower.includes('unknown')

  const isTested=
    conditionLower.includes('tested') ||
    conditionLower.includes('good') ||
    conditionLower.includes('working')

  const inspectionHeadline=
    isUntested
      ? 'VISUALLY INSPECTED'
      : isTested
        ? 'TESTED & INSPECTED'
        : 'OEM QUALITY REVIEW'

  const inspectionSubline=
    isUntested
      ? 'Sold as untested unless otherwise noted'
      : isTested
        ? 'Function checked prior to listing'
        : 'Condition represented as shown and described'

  const shippingText=
    clean(i.shippingText) ||
    'Shipping details are shown in the listing. Large or heavy parts may ship by freight and can require terminal or commercial delivery arrangements.'

  const warrantyText=
    clean(i.warrantyText) ||
    'Please verify the OEM part number, photos, and vehicle application before purchasing. Message us before ordering if you are unsure about fitment.'

  const photos=[i.primaryPhotoUrl,...(i.photoUrls??[])]
    .map(x=>clean(x))
    .filter(Boolean)
    .filter((x,n,a)=>a.indexOf(x)===n)
    .slice(0,8)

  const hero=photos[0]

  const secondaryPhotos=photos.slice(1,5)

  const specRow=(label:string,value:unknown,highlight=false)=>{
    const text=clean(value)||'—'

    return `
      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid #e1e6eb;font-size:12px;font-weight:800;color:#68788a;width:38%;vertical-align:top;text-transform:uppercase;letter-spacing:.5px">
          ${esc(label)}
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid #e1e6eb;font-size:14px;line-height:1.45;vertical-align:top;word-break:break-word;${highlight?'font-weight:900;color:#052c56':'font-weight:600;color:#17283a'}">
          ${val(text)}
        </td>
      </tr>`
  }

  const vehicleRow=(label:string,value:unknown)=>{
    const text=clean(value)

    if(!text) return ''

    return `
      <tr>
        <td style="padding:9px 0;color:#708092;font-size:12px;font-weight:800;width:36%;vertical-align:top">
          ${esc(label)}
        </td>
        <td style="padding:9px 0;color:#17283a;font-size:13px;font-weight:700;vertical-align:top;word-break:break-word">
          ${val(text)}
        </td>
      </tr>`
  }

  const itemRows=[
    specRow('Condition',condition,true),
    pn ? specRow('OEM Part Number',pn,true) : '',
    interchange ? specRow('Interchange',interchange) : '',
    sku ? specRow('Inventory SKU',sku) : '',
    position ? specRow('Position / Location',position) : '',
    category ? specRow('Part Category',category) : '',
  ].join('')

  const donorRows=[
    vehicleRow('Vehicle',donorVehicle),
    vehicleRow('VIN',vin),
    vehicleRow('Engine',engine),
    vehicleRow('Transmission',transmission),
    vehicleRow('Mileage',mileage),
  ].join('')

  const verifiedCompatibility=(i.compatibility??[])
    .filter(row=>row?.verified===true)

  const compatibilityRows=verifiedCompatibility
    .map((row,index)=>{
      const vehicle=[
        clean(row.year),
        clean(row.make),
        clean(row.model),
        clean(row.trim),
      ].filter(Boolean).join(' ')

      const application=vehicle||'Verified application'
      const engineText=clean(row.engine)||'—'
      const noteText=clean(row.notes)||'Verified compatibility record'

      return `
        <tr>
          <td style="padding:12px 12px;border-top:${index===0?'0':'1px solid #e3e8ed'};font-size:13px;font-weight:800;color:#17283a">
            ${val(application)}
          </td>
          <td style="padding:12px 12px;border-top:${index===0?'0':'1px solid #e3e8ed'};font-size:13px;color:#41556a">
            ${val(engineText)}
          </td>
          <td style="padding:12px 12px;border-top:${index===0?'0':'1px solid #e3e8ed'};font-size:12px;color:#667789">
            ${val(noteText)}
          </td>
        </tr>`
    })
    .join('')

  const compatibilitySection=
    verifiedCompatibility.length>0
      ? `
        <div style="border:1px solid #d9e0e6;border-radius:12px;overflow:hidden;background:#fff">
          <div style="background:#052c56;color:#fff;padding:14px 18px">
            <div style="font-size:11px;font-weight:800;letter-spacing:1.6px;color:#b9cce0">FITMENT INFORMATION</div>
            <div style="font-size:20px;font-weight:900;margin-top:3px">Verified Compatibility</div>
          </div>

          <table style="width:100%;border-collapse:collapse">
            <tr style="background:#f3f6f8">
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#536679;letter-spacing:.7px">APPLICATION</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#536679;letter-spacing:.7px">ENGINE</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#536679;letter-spacing:.7px">NOTES</th>
            </tr>
            ${compatibilityRows}
          </table>

          <div style="padding:12px 16px;background:#f8fafb;font-size:11px;line-height:1.55;color:#667789">
            Always compare the OEM part number, connectors, options, and photos with your original part before purchase.
          </div>
        </div>`
      : `
        <div style="border:1px solid #d9e0e6;border-radius:12px;overflow:hidden;background:#fff">
          <div style="background:#052c56;color:#fff;padding:14px 18px">
            <div style="font-size:11px;font-weight:800;letter-spacing:1.6px;color:#b9cce0">FITMENT INFORMATION</div>
            <div style="font-size:20px;font-weight:900;margin-top:3px">Compatibility & Fitment</div>
          </div>

          <div style="padding:20px 20px 18px">
            <div style="font-size:14px;font-weight:900;color:#17283a;margin-bottom:7px">
              Match the OEM part number before purchasing.
            </div>

            <div style="font-size:13px;line-height:1.65;color:#536679">
              Additional vehicle compatibility has not been verified in this listing.
              ${donorVehicle?` This part was removed from a ${val(donorVehicle)}.`:''}
              Vehicle production options can vary even within the same year, make, and model.
            </div>

            ${pn?`
              <div style="margin-top:14px;padding:12px 14px;background:#f2f6f9;border-left:4px solid #052c56">
                <span style="font-size:11px;font-weight:800;color:#6b7a89;letter-spacing:.6px">PRIMARY FITMENT CHECK</span>
                <div style="font-size:17px;font-weight:900;color:#052c56;margin-top:4px">
                  OEM # ${val(pn)}
                </div>
              </div>
            `:''}
          </div>
        </div>`

  const secondaryPhotoHtml=secondaryPhotos.length
    ? `
      <div style="margin-top:12px;text-align:center">
        ${secondaryPhotos.map((url)=>`
          <span style="display:inline-block;width:104px;height:78px;margin:4px;padding:4px;border:1px solid #d5dce2;border-radius:8px;background:#fff;box-sizing:border-box;vertical-align:top">
            <img src="${esc(url)}" alt="Part photo" style="display:block;width:100%;height:100%;object-fit:cover;border-radius:5px">
          </span>
        `).join('')}
      </div>`
    : ''

  return `
  <div style="margin:0;background:#eef2f5;font-family:Arial,Helvetica,sans-serif;color:#17283a">
    <div style="width:100%;max-width:1180px;margin:0 auto;background:#fff;box-shadow:0 0 28px rgba(17,40,63,.08)">

      <!-- HEADER -->
      <div style="background:#021f40;color:#fff;padding:22px 34px;border-bottom:5px solid #c7d1db">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="width:112px;vertical-align:middle;color:#fff">
              ${texas}
            </td>

            <td style="vertical-align:middle">
              <div style="font-size:30px;font-weight:900;letter-spacing:.7px">
                TEXAS OEM PARTS
              </div>
              <div style="font-size:12px;letter-spacing:2px;margin-top:6px;color:#c9d7e5">
                GENUINE OEM • PROFESSIONAL AUTOMOTIVE RECYCLING
              </div>
            </td>

            <td style="text-align:right;vertical-align:middle">
              <div style="display:inline-block;text-align:left;border-left:1px solid #45617d;padding-left:24px">
                <div style="font-size:11px;letter-spacing:1.4px;color:#9fb5ca;font-weight:800">
                  PART CONDITION
                </div>
                <div style="font-size:17px;font-weight:900;margin-top:4px">
                  ${val(condition)}
                </div>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- TRUST BAR -->
      <div style="background:#f5f7f9;padding:10px 22px;border-bottom:1px solid #dde3e8;text-align:center">
        <span style="font-size:11px;font-weight:900;color:#29445f;letter-spacing:.7px">
          GENUINE OEM INVENTORY
        </span>
        <span style="margin:0 16px;color:#a5b1bc">•</span>
        <span style="font-size:11px;font-weight:900;color:#29445f;letter-spacing:.7px">
          PROFESSIONAL PACKAGING
        </span>
        <span style="margin:0 16px;color:#a5b1bc">•</span>
        <span style="font-size:11px;font-weight:900;color:#29445f;letter-spacing:.7px">
          RESPONSIVE SUPPORT
        </span>
      </div>

      <!-- TITLE -->
      <div style="padding:30px 38px 20px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="vertical-align:middle">
              <div style="font-size:11px;font-weight:900;color:#81909e;letter-spacing:1.5px">
                TEXAS OEM INVENTORY
              </div>

              <div style="font-size:32px;font-weight:900;color:#052c56;line-height:1.08;margin-top:6px">
                ${val(title)}
              </div>

              <div style="font-size:13px;color:#667789;margin-top:10px">
                ${val(condition)}
                ${position?` &nbsp; • &nbsp; ${val(position)}`:''}
                ${donorVehicle?` &nbsp; • &nbsp; Removed from ${val(donorVehicle)}`:''}
              </div>
            </td>

            ${pn?`
            <td style="width:300px;text-align:right;vertical-align:middle">
              <div style="display:inline-block;width:265px;border:1px solid #cbd5de;border-radius:10px;overflow:hidden;text-align:center;box-shadow:0 5px 16px rgba(5,44,86,.10)">
                <div style="background:#052c56;color:#fff;padding:7px;font-size:10px;font-weight:900;letter-spacing:1.3px">
                  OEM PART NUMBER
                </div>
                <div style="padding:13px 10px;background:#fff;font-size:22px;font-weight:900;color:#052c56;word-break:break-word">
                  ${val(pn)}
                </div>
              </div>
            </td>
            `:''}
          </tr>
        </table>
      </div>

      <!-- PRODUCT -->
      <div style="padding:4px 38px 26px">
        <table style="width:100%;border-collapse:separate;border-spacing:20px 0;margin-left:-20px;width:calc(100% + 20px)">
          <tr>
            <td style="width:58%;vertical-align:top">
              <div style="border:1px solid #d7dee4;border-radius:12px;background:#fff;padding:18px;box-shadow:0 4px 15px rgba(17,40,63,.05)">
                ${
                  hero
                    ? `<img src="${esc(hero)}" alt="${esc(name)}" style="display:block;width:100%;max-height:480px;object-fit:contain;margin:0 auto;border-radius:7px">`
                    : `<div style="height:280px;display:table;width:100%;background:#f4f6f8;border-radius:7px;text-align:center"><div style="display:table-cell;vertical-align:middle;color:#8795a2;font-weight:800">PHOTO NOT AVAILABLE</div></div>`
                }

                ${secondaryPhotoHtml}
              </div>
            </td>

            <td style="width:42%;vertical-align:top">
              <div style="border:1px solid #d7dee4;border-radius:12px;background:#fff;overflow:hidden;box-shadow:0 4px 15px rgba(17,40,63,.05)">
                <div style="background:#f3f6f8;padding:13px 16px;border-bottom:1px solid #dce3e8">
                  <div style="font-size:11px;letter-spacing:1.3px;color:#708092;font-weight:900">
                    PRODUCT SPECIFICATIONS
                  </div>
                </div>

                <table style="width:100%;border-collapse:collapse">
                  ${itemRows}
                </table>
              </div>

              <div style="margin-top:15px;border-radius:10px;background:#052c56;color:#fff;padding:17px 18px">
                <div style="font-size:10px;font-weight:900;letter-spacing:1.2px;color:#b7c9da">
                  INSPECTION STATUS
                </div>

                <div style="font-size:18px;font-weight:900;margin-top:4px">
                  ${inspectionHeadline}
                </div>

                <div style="font-size:12px;line-height:1.5;margin-top:6px;color:#d8e2eb">
                  ${inspectionSubline}
                </div>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- DONOR VEHICLE -->
      <div style="padding:0 38px 24px">
        <div style="border:1px solid #d9e0e6;border-radius:12px;background:#fff;overflow:hidden">
          <div style="padding:15px 19px;background:#f3f6f8;border-bottom:1px solid #d9e0e6">
            <div style="font-size:10px;color:#788897;font-weight:900;letter-spacing:1.5px">
              SOURCE VEHICLE
            </div>
            <div style="font-size:20px;color:#052c56;font-weight:900;margin-top:3px">
              Original Donor Application
            </div>
          </div>

          <div style="padding:9px 20px">
            ${
              donorRows
                ? `<table style="width:100%;border-collapse:collapse">${donorRows}</table>`
                : `<div style="padding:16px 0;font-size:13px;color:#667789">Donor vehicle information is not available for this inventory item.</div>`
            }
          </div>

          <div style="padding:11px 20px;background:#fafbfc;border-top:1px solid #e3e8ed;font-size:11px;color:#708092;line-height:1.55">
            Donor vehicle information identifies the vehicle this component was removed from. It does not by itself guarantee compatibility with every vehicle of the same year, make, or model.
          </div>
        </div>
      </div>

      <!-- COMPATIBILITY -->
      <div style="padding:0 38px 24px">
        ${compatibilitySection}
      </div>

      <!-- CONDITION -->
      <div style="padding:0 38px 24px">
        <table style="width:100%;border-collapse:separate;border-spacing:18px 0;margin-left:-18px;width:calc(100% + 18px)">
          <tr>
            <td style="width:50%;vertical-align:top">
              <div style="border:1px solid #d9e0e6;border-radius:12px;background:#fff;padding:19px 20px;min-height:150px;box-sizing:border-box">
                <div style="font-size:10px;color:#788897;font-weight:900;letter-spacing:1.4px">
                  CONDITION REPORT
                </div>

                <div style="font-size:19px;color:#052c56;font-weight:900;margin-top:5px">
                  ${val(condition)}
                </div>

                <div style="font-size:13px;color:#536679;line-height:1.65;margin-top:11px">
                  ${val(notes)}
                </div>

                <div style="font-size:11px;color:#83909c;line-height:1.55;margin-top:11px">
                  Photos are part of the item description. Normal cosmetic wear may be present on used OEM components.
                </div>
              </div>
            </td>

            <td style="width:50%;vertical-align:top">
              <div style="border:1px solid #d9e0e6;border-radius:12px;background:#fff;padding:19px 20px;min-height:150px;box-sizing:border-box">
                <div style="font-size:10px;color:#788897;font-weight:900;letter-spacing:1.4px">
                  SHIPPING & FULFILLMENT
                </div>

                <div style="font-size:19px;color:#052c56;font-weight:900;margin-top:5px">
                  Professionally Prepared
                </div>

                <div style="font-size:13px;color:#536679;line-height:1.65;margin-top:11px">
                  ${val(shippingText)}
                </div>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- BUYER ASSURANCE -->
      <div style="margin:0 38px 28px;border-radius:12px;background:#eef4f8;border-left:5px solid #052c56;padding:18px 20px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="width:48px;color:#052c56;vertical-align:middle">
              ${chat}
            </td>

            <td style="vertical-align:middle">
              <div style="font-size:11px;font-weight:900;letter-spacing:1.2px;color:#687b8d">
                BUYER ASSURANCE
              </div>

              <div style="font-size:14px;font-weight:800;color:#17283a;margin-top:4px;line-height:1.55">
                ${val(warrantyText)}
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- FOOTER -->
      <div style="background:#021f40;color:#fff;padding:24px 38px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="width:106px;vertical-align:middle;color:#fff">
              ${texas}
            </td>

            <td style="vertical-align:middle">
              <div style="font-size:21px;font-weight:900;letter-spacing:.5px">
                TEXAS OEM PARTS
              </div>

              <div style="font-size:10px;color:#b9c9d8;letter-spacing:1.2px;margin-top:6px">
                GENUINE OEM PARTS • PROFESSIONAL SERVICE • CAREFUL FULFILLMENT
              </div>

              <div style="font-size:11px;color:#d6e0e8;margin-top:9px">
                Thank you for choosing Texas OEM Parts.
              </div>
            </td>

            <td style="width:260px;text-align:right;vertical-align:middle">
              <div style="font-size:10px;letter-spacing:1.2px;color:#9fb5ca;font-weight:900">
                SERVING CUSTOMERS
              </div>
              <div style="font-size:14px;font-weight:900;margin-top:5px">
                ACROSS THE UNITED STATES
              </div>
            </td>
          </tr>
        </table>
      </div>

    </div>
  </div>
  `.trim()
}

