import { getEbayListingPolicy } from './ebayListingPolicies'
export type TexasOemEbayTemplateInput={title?:string|null;description?:string|null;partName?:string|null;partNumber?:string|null;interchangeNumber?:string|null;sku?:string|null;condition?:string|null;notes?:string|null;year?:string|null;make?:string|null;model?:string|null;trim?:string|null;mileage?:string|number|null;vin?:string|null;engine?:string|null;transmission?:string|null;position?:string|null;category?:string|null;compatibility?:Array<{year?:string|null;make?:string|null;model?:string|null;trim?:string|null;engine?:string|null;notes?:string|null;verified?:boolean}>;shippingText?:string|null;warrantyText?:string|null;primaryPhotoUrl?:string|null;photoUrls?:Array<string|null|undefined>}
const esc=(v:unknown)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')
const val=(v:unknown,f='—')=>esc(String(v??'').trim()||f)
const svg=(body:string,w=42,h=42)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const chat=svg('<path d="M8 10h32v23H21l-9 7v-7H8z"/><circle cx="18" cy="22" r="1.5" fill="currentColor" stroke="none"/><circle cx="24" cy="22" r="1.5" fill="currentColor" stroke="none"/><circle cx="30" cy="22" r="1.5" fill="currentColor" stroke="none"/>')
const texas=`
<div style="display:inline-block;min-width:280px;text-align:left;line-height:1">
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:900;letter-spacing:1px;color:#ffffff;white-space:nowrap">
    TEXAS OEM
  </div>
  <div style="display:flex;align-items:center;gap:10px;margin-top:4px">
    <span style="display:inline-block;width:44px;height:3px;background:#d71920"></span>
    <span style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:900;letter-spacing:6px;color:#ffffff">
      PARTS
    </span>
    <span style="display:inline-block;width:44px;height:3px;background:#d71920"></span>
  </div>
</div>`
export function buildTexasOemEbayDescription(i:TexasOemEbayTemplateInput){
  const clean=(v:unknown)=>String(v??'').trim()

  const name=clean(i.partName)||'OEM Auto Part'
  let title=clean(i.title)||name
  title=title.replace(/\s+for\s+vehicle\s*$/i,'').trim()||name

  const pn=clean(i.partNumber)
  const interchange=clean(i.interchangeNumber)
  const sku=clean(i.sku)
  const condition=clean(i.condition)||'Used'

  const conditionLower=condition.toLowerCase()

  const displayCondition=
    conditionLower === 'good'
      ? 'Good Used Condition'
      : conditionLower === 'used'
        ? 'Used OEM'
        : conditionLower === 'excellent'
          ? 'Excellent Used Condition'
          : conditionLower === 'untested'
            ? 'Used • Untested'
            : conditionLower === 'unknown'
              ? 'Condition Unknown'
              : condition

  const notes=clean(i.notes)||'Please review all photos and verify fitment before purchase.'
  const description=clean(i.description)

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

  const listingPolicy = getEbayListingPolicy({
    partName: name,
    category,
    condition,
  })

  const policyNoticesHtml = listingPolicy.notices
    .map((notice) => `
      <div style="
        margin-top:12px;
        padding:14px 16px;
        border-radius:8px;
        background:${notice.important ? '#fff3f3' : '#f7f7f7'};
        border:1px solid ${notice.important ? '#efb5b5' : '#dddddd'};
        border-left:4px solid ${notice.important ? '#d71920' : '#333333'};
      ">
        <div style="
          font-size:11px;
          font-weight:900;
          letter-spacing:1px;
          color:${notice.important ? '#d71920' : '#222222'};
        ">
          ${esc(notice.title)}
        </div>

        <div style="
          font-size:12px;
          line-height:1.6;
          color:#536679;
          margin-top:6px;
        ">
          ${esc(notice.text)}
        </div>
      </div>
    `)
    .join('')

  const donorVehicle=[year,make,model,trim]
    .filter(Boolean)
    .join(' ')
    .trim()

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

  const photoGalleryHtml=photos.length
    ? `
      <div style="padding:0 38px 24px">
        <div style="border:1px solid #d9e0e6;border-radius:12px;background:#fff;overflow:hidden">
          <div style="background:#080808;color:#fff;padding:12px 18px;border-bottom:3px solid #d71920">
            <div style="font-size:10px;color:#c8c8c8;font-weight:900;letter-spacing:1.4px">
              ITEM PHOTOS
            </div>
            <div style="font-size:20px;font-weight:900;color:#ff2525;margin-top:3px">
              Photo Gallery
            </div>
          </div>

          <div style="padding:18px">
            ${photos.map((url,index)=>`
              <div style="
                margin:${index===0?'0':'22px'} 0 0;
                padding:14px;
                border:1px solid #d7dee4;
                border-radius:10px;
                background:#ffffff;
                box-shadow:0 3px 12px rgba(0,0,0,.06);
              ">
                <div style="
                  margin-bottom:10px;
                  font-size:11px;
                  font-weight:900;
                  letter-spacing:1px;
                  color:#68788a;
                ">
                  PHOTO ${index + 1} OF ${photos.length}
                </div>

                <img
                  src="${esc(url)}"
                  alt="${esc(name)} photo ${index + 1}"
                  style="
                    display:block;
                    width:100%;
                    height:auto;
                    max-height:900px;
                    object-fit:contain;
                    margin:0 auto;
                    border-radius:7px;
                    background:#ffffff;
                  "
                >
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `
    : ''

  const specRow=(label:string,value:unknown,highlight=false)=>{
    const text=clean(value)||'—'

    return `
      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid #e1e6eb;font-size:12px;font-weight:800;color:#68788a;width:38%;vertical-align:top;text-transform:uppercase;letter-spacing:.5px">
          ${esc(label)}
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid #e1e6eb;font-size:14px;line-height:1.45;vertical-align:top;word-break:break-word;${highlight?'font-weight:900;color:#d71920':'font-weight:800;color:#d71920'}">
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
    specRow('Condition',displayCondition,true),
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
          <div style="background:#080808;color:#fff;padding:14px 18px;border-bottom:3px solid #d71920">
            <div style="font-size:11px;font-weight:800;letter-spacing:1.6px;color:#c8c8c8">FITMENT INFORMATION</div>
            <div style="font-size:20px;font-weight:900;margin-top:3px;color:#ff2525;text-transform:uppercase">Verified Compatibility</div>
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
          <div style="background:#080808;color:#fff;padding:14px 18px;border-bottom:3px solid #d71920">
            <div style="font-size:11px;font-weight:800;letter-spacing:1.6px;color:#c8c8c8">FITMENT INFORMATION</div>
            <div style="font-size:20px;font-weight:900;margin-top:3px;color:#ff2525;text-transform:uppercase">Compatibility & Fitment</div>
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
              <div style="margin-top:14px;padding:12px 14px;background:#f2f6f9;border-left:4px solid #d71920">
                <span style="font-size:11px;font-weight:800;color:#6b7a89;letter-spacing:.6px">PRIMARY FITMENT CHECK</span>
                <div style="font-size:17px;font-weight:900;color:#d71920;margin-top:4px">
                  OEM # ${val(pn)}
                </div>
              </div>
            `:''}
          </div>
        </div>`



  return `
  <div style="margin:0;background:#f2f2f2;font-family:Arial,Helvetica,sans-serif;color:#17283a">
    <div style="width:100%;max-width:1180px;margin:0 auto;background:#fff;box-shadow:0 0 28px rgba(0,0,0,.10)">

      <!-- HEADER -->
      <div style="background:#080808;color:#fff;padding:22px 34px;border-bottom:4px solid #d71920">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="width:340px;vertical-align:middle;color:#fff">
              ${texas}
            </td>

            <td style="vertical-align:middle">
              <div style="font-size:11px;letter-spacing:2px;color:#d4d4d4;font-weight:800">
                GENUINE OEM • PROFESSIONAL AUTOMOTIVE RECYCLING
              </div>
            </td>

            <td style="text-align:right;vertical-align:middle">
              <div style="display:inline-block;text-align:left;border-left:1px solid #555;padding-left:24px">
                <div style="font-size:11px;letter-spacing:1.4px;color:#bdbdbd;font-weight:800">
                  PART CONDITION
                </div>
                <div style="font-size:20px;font-weight:900;margin-top:4px;color:#ff2a2a;text-transform:uppercase">
                  ${val(displayCondition)}
                </div>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- TRUST BAR -->
      <div style="background:#fff;padding:11px 22px;border-bottom:1px solid #cfcfcf;text-align:center">
        <span style="font-size:11px;font-weight:900;color:#151515;letter-spacing:.7px">
          GENUINE OEM INVENTORY
        </span>
        <span style="margin:0 16px;color:#d71920">•</span>
        <span style="font-size:11px;font-weight:900;color:#151515;letter-spacing:.7px">
          PROFESSIONAL PACKAGING
        </span>
        <span style="margin:0 16px;color:#d71920">•</span>
        <span style="font-size:11px;font-weight:900;color:#151515;letter-spacing:.7px">
          RESPONSIVE SUPPORT
        </span>
      </div>

      <!-- TITLE -->
      <div style="padding:30px 38px 20px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="vertical-align:middle">
              <div style="font-size:11px;font-weight:900;color:#d71920;letter-spacing:1.5px">
                TEXAS OEM INVENTORY
              </div>

              <div style="font-size:34px;font-weight:900;color:#d71920;line-height:1.08;margin-top:6px">
                ${val(title)}
              </div>

              <div style="font-size:13px;color:#667789;margin-top:10px">
                ${val(displayCondition)}
                ${position?` &nbsp; • &nbsp; ${val(position)}`:''}
                ${donorVehicle?` &nbsp; • &nbsp; Removed from ${val(donorVehicle)}`:''}
              </div>
            </td>

            ${pn?`
            <td style="width:300px;text-align:right;vertical-align:middle">
              <div style="display:inline-block;width:265px;border:1px solid #cbd5de;border-radius:10px;overflow:hidden;text-align:center;box-shadow:0 5px 16px rgba(0,0,0,.12)">
                <div style="background:#b70f16;color:#fff;padding:7px;font-size:10px;font-weight:900;letter-spacing:1.3px">
                  OEM PART NUMBER
                </div>
                <div style="padding:13px 10px;background:#fff;font-size:22px;font-weight:900;color:#d71920;word-break:break-word">
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
              <div style="border:1px solid #d7dee4;border-radius:12px;background:#fff;padding:18px;box-shadow:0 4px 15px rgba(0,0,0,.07)">
                ${
                  hero
                    ? `<img src="${esc(hero)}" alt="${esc(name)}" style="display:block;width:100%;max-height:480px;object-fit:contain;margin:0 auto;border-radius:7px">`
                    : `<div style="height:280px;display:table;width:100%;background:#f4f6f8;border-radius:7px;text-align:center"><div style="display:table-cell;vertical-align:middle;color:#8795a2;font-weight:800">PHOTO NOT AVAILABLE</div></div>`
                }

              </div>
            </td>

            <td style="width:42%;vertical-align:top">
              <div style="border:1px solid #d7dee4;border-radius:12px;background:#fff;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,.07)">
                <div style="background:#090909;padding:13px 16px;border-bottom:3px solid #d71920">
                  <div style="font-size:11px;letter-spacing:1.3px;color:#fff;font-weight:900">
                    PRODUCT SPECIFICATIONS
                  </div>
                </div>

                <table style="width:100%;border-collapse:collapse">
                  ${itemRows}
                </table>
              </div>

              <div style="margin-top:15px;border-radius:10px;background:#080808;color:#fff;padding:17px 18px">
                <div style="font-size:10px;font-weight:900;letter-spacing:1.2px;color:#bcbcbc">
                  INSPECTION STATUS
                </div>

                <div style="font-size:20px;font-weight:900;margin-top:4px;color:#ff2525">
                  ${inspectionHeadline}
                </div>

                <div style="font-size:12px;line-height:1.5;margin-top:6px;color:#e0e0e0">
                  ${inspectionSubline}
                </div>
              </div>
            </td>
          </tr>
        </table>
      </div>

      <!-- PHOTO GALLERY -->
      ${photoGalleryHtml}

      ${description ? `
      <!-- ITEM DESCRIPTION -->
      <div style="padding:0 38px 24px">
        <div style="border:1px solid #d9e0e6;border-radius:12px;background:#fff;overflow:hidden">
          <div style="background:#080808;color:#fff;padding:12px 18px;border-bottom:3px solid #d71920">
            <div style="font-size:10px;color:#c8c8c8;font-weight:900;letter-spacing:1.4px">
              ITEM DESCRIPTION
            </div>
            <div style="font-size:20px;font-weight:900;color:#ff2525;margin-top:3px">
              Texas OEM Parts
            </div>
          </div>

          <div style="padding:18px 20px;font-size:14px;line-height:1.7;color:#536679;white-space:pre-wrap">
            ${val(description)}
          </div>
        </div>
      </div>
      ` : ''}

      <!-- DONOR VEHICLE -->
      <div style="padding:0 38px 24px">
        <div style="border:1px solid #d9e0e6;border-radius:12px;background:#fff;overflow:hidden">
          <div style="padding:12px 19px;background:#080808;border-bottom:3px solid #d71920">
            <div style="font-size:10px;color:#c8c8c8;font-weight:900;letter-spacing:1.5px">
              SOURCE VEHICLE
            </div>
            <div style="font-size:20px;color:#ff2525;font-weight:900;margin-top:3px;text-transform:uppercase">
              Original Donor Application
            </div>
          </div>

          <div style="padding:16px 20px">
            ${
              donorRows
                ? `
                  <div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
                    <div style="flex:1;min-width:260px">
                      <div style="font-size:11px;font-weight:900;color:#7a8794;letter-spacing:1.1px;margin-bottom:6px">
                        SOURCE VEHICLE DETAILS
                      </div>
                      <table style="width:100%;border-collapse:collapse">${donorRows}</table>
                    </div>

                    ${
                      donorVehicle
                        ? `
                          <div style="width:250px;min-width:220px;background:#f5f5f5;border:1px solid #dedede;border-left:4px solid #d71920;border-radius:8px;padding:14px 16px;box-sizing:border-box">
                            <div style="font-size:10px;font-weight:900;color:#7c8791;letter-spacing:1px">
                              ORIGINAL APPLICATION
                            </div>
                            <div style="font-size:18px;font-weight:900;color:#171717;line-height:1.25;margin-top:5px">
                              ${val(donorVehicle)}
                            </div>
                            ${
                              vin
                                ? `<div style="font-size:11px;color:#687684;margin-top:9px;word-break:break-word">VIN ${val(vin)}</div>`
                                : ''
                            }
                          </div>
                        `
                        : ''
                    }
                  </div>
                `
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

                <div style="font-size:20px;color:#d71920;font-weight:900;margin-top:5px;text-transform:uppercase">
                  ${val(displayCondition)}
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

                <div style="font-size:20px;color:#d71920;font-weight:900;margin-top:5px;text-transform:uppercase">
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

      <!-- PART-TYPE POLICY -->
      <div style="padding:0 38px 24px">
        <div style="border:1px solid #d9e0e6;border-radius:12px;background:#fff;overflow:hidden">
          <div style="background:#080808;color:#fff;padding:12px 18px;border-bottom:3px solid #d71920">
            <div style="font-size:10px;color:#c8c8c8;font-weight:900;letter-spacing:1.4px">
              PART-SPECIFIC INFORMATION
            </div>
            <div style="font-size:20px;font-weight:900;color:#ff2525;margin-top:3px;text-transform:uppercase">
              ${esc(listingPolicy.label)}
            </div>
          </div>

          <div style="padding:10px 16px 16px">
            ${policyNoticesHtml}
          </div>
        </div>
      </div>

      <!-- BUYER ASSURANCE -->
      <div style="margin:0 38px 28px;border-radius:12px;background:#f5f5f5;border-left:5px solid #d71920;padding:18px 20px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="width:48px;color:#d71920;vertical-align:middle">
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
      <div style="background:#080808;color:#fff;padding:22px 38px;border-top:4px solid #d71920">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="width:340px;vertical-align:middle;color:#fff">
              ${texas}
            </td>

            <td style="vertical-align:middle">

              <div style="font-size:10px;color:#d0d0d0;letter-spacing:1.2px;margin-top:6px">
                GENUINE OEM PARTS • PROFESSIONAL SERVICE • CAREFUL FULFILLMENT
              </div>

              <div style="font-size:11px;color:#ff3030;margin-top:9px">
                Thank you for choosing Texas OEM Parts.
              </div>
            </td>

            <td style="width:260px;text-align:right;vertical-align:middle">
              <div style="font-size:10px;letter-spacing:1.2px;color:#bdbdbd;font-weight:900">
                SERVING CUSTOMERS
              </div>
              <div style="font-size:14px;font-weight:900;margin-top:5px;color:#ff2525">
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

