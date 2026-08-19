export type EbayPartPolicyType =
  | 'electronics'
  | 'engine'
  | 'transmission'
  | 'lighting'
  | 'body_paint'
  | 'interior'
  | 'mechanical'
  | 'wheel_tire'
  | 'general'

export type EbayListingPolicyNotice = {
  title: string
  text: string
  important?: boolean
}

export type EbayListingPolicyResult = {
  type: EbayPartPolicyType
  label: string
  notices: EbayListingPolicyNotice[]
}

type PolicyInput = {
  partName?: string | null
  category?: string | null
  condition?: string | null
}

const normalize = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()

const includesAny = (
  value: string,
  terms: string[],
) => terms.some((term) => value.includes(term))

export function classifyEbayPartPolicy(
  input: PolicyInput,
): EbayPartPolicyType {
  const partName = normalize(input.partName)
  const category = normalize(input.category)

  const searchable = `${partName} ${category}`

  /*
   * ELECTRONICS / MODULES
   */
  if (
    includesAny(searchable, [
      'module',
      'computer',
      'ecu',
      'ecm',
      'pcm',
      'bcm',
      'tcm',
      'ebcm',
      'abs module',
      'abs pump',
      'radio',
      'receiver',
      'amplifier',
      'amp ',
      'navigation',
      'display',
      'screen',
      'cluster',
      'speedometer',
      'control unit',
      'control module',
      'sensor',
      'camera',
      'radar',
      'gateway',
      'immobilizer',
      'telematics',
      'infotainment',
      'electronic',
      'electrical',
    ])
  ) {
    return 'electronics'
  }

  /*
   * ENGINE
   */
  if (
    includesAny(searchable, [
      'engine',
      'motor assembly',
      'long block',
      'short block',
      'cylinder head',
    ])
  ) {
    return 'engine'
  }

  /*
   * TRANSMISSION / TRANSFER CASE
   */
  if (
    includesAny(searchable, [
      'transmission',
      'transaxle',
      'transfer case',
      'gearbox',
    ])
  ) {
    return 'transmission'
  }

  /*
   * LIGHTING
   */
  if (
    includesAny(searchable, [
      'headlight',
      'headlamp',
      'tail light',
      'taillight',
      'tail lamp',
      'taillamp',
      'fog light',
      'fog lamp',
      'third brake light',
      'marker light',
      'turn signal',
      'lamp assembly',
      'lighting',
    ])
  ) {
    return 'lighting'
  }

  /*
   * BODY / PAINTED EXTERIOR
   */
  if (
    includesAny(searchable, [
      'door',
      'fender',
      'hood',
      'bumper',
      'tailgate',
      'liftgate',
      'trunk lid',
      'quarter panel',
      'bedside',
      'body panel',
      'mirror',
      'spoiler',
      'grille',
      'grill',
      'painted',
      'exterior',
      'body',
    ])
  ) {
    return 'body_paint'
  }

  /*
   * INTERIOR
   */
  if (
    includesAny(searchable, [
      'seat',
      'console',
      'dashboard',
      'dash ',
      'door panel',
      'trim panel',
      'carpet',
      'headliner',
      'sun visor',
      'steering wheel',
      'interior',
    ])
  ) {
    return 'interior'
  }

  /*
   * WHEELS / TIRES
   */
  if (
    includesAny(searchable, [
      'wheel',
      'rim',
      'tire',
      'tyre',
    ])
  ) {
    return 'wheel_tire'
  }

  /*
   * MECHANICAL
   */
  if (
    includesAny(searchable, [
      'axle',
      'differential',
      'driveshaft',
      'drive shaft',
      'spindle',
      'knuckle',
      'control arm',
      'strut',
      'shock',
      'spring',
      'rack and pinion',
      'steering rack',
      'steering gear',
      'caliper',
      'brake',
      'hub',
      'bearing',
      'compressor',
      'alternator',
      'starter',
      'pump',
      'pulley',
      'manifold',
      'mechanical',
      'suspension',
      'drivetrain',
    ])
  ) {
    return 'mechanical'
  }

  return 'general'
}

export function getEbayListingPolicy(
  input: PolicyInput,
): EbayListingPolicyResult {
  const type = classifyEbayPartPolicy(input)

  switch (type) {
    case 'electronics':
      return {
        type,
        label: 'Electronic Component Notice',
        notices: [
          {
            title: 'PROGRAMMING / CALIBRATION NOTICE',
            important: true,
            text:
              'This is a used OEM electronic component. Programming, calibration, relearn procedures, VIN configuration, anti-theft setup, or dealer-level initialization may be required depending on the vehicle and application. Please verify requirements with a qualified technician or dealer before purchasing. Programming services are not included unless specifically stated in the listing.',
          },
          {
            title: 'FITMENT VERIFICATION',
            text:
              'Matching the OEM part number is strongly recommended. Connectors, software, vehicle options, production dates, and programming requirements may vary even between vehicles of the same year, make, and model.',
          },
        ],
      }

    case 'engine':
      return {
        type,
        label: 'Engine Installation Notice',
        notices: [
          {
            title: 'ENGINE INSTALLATION NOTICE',
            important: true,
            text:
              'This is a used OEM engine assembly. Professional installation is strongly recommended. Replace normal service items, fluids, filters, seals, and gaskets as appropriate before installation. Cooling-system condition and proper lubrication should be verified before startup.',
          },
          {
            title: 'ACCESSORIES & COMPONENTS',
            text:
              'Unless specifically stated otherwise in the listing, attached accessories and external components should not be assumed to be included as guaranteed serviceable items. Verify exactly what is included by reviewing the listing photos and description.',
          },
        ],
      }

    case 'transmission':
      return {
        type,
        label: 'Transmission Installation Notice',
        notices: [
          {
            title: 'TRANSMISSION INSTALLATION NOTICE',
            important: true,
            text:
              'This is a used OEM transmission or drivetrain component. Professional installation is strongly recommended. Fluid, filter, seals, cooler lines, and related service items should be inspected or replaced as appropriate before installation.',
          },
          {
            title: 'PROGRAMMING / ADAPTIVE RELEARN',
            text:
              'Some vehicles may require programming, module setup, adaptive relearn procedures, or dealer-level initialization after installation. Verify vehicle-specific requirements before purchasing.',
          },
          {
            title: 'COOLER SYSTEM',
            text:
              'Transmission cooler and cooler lines should be properly flushed or replaced when required. Contamination from a failed previous transmission can damage a replacement unit.',
          },
        ],
      }

    case 'lighting':
      return {
        type,
        label: 'Lighting Component Notice',
        notices: [
          {
            title: 'LIGHTING COMPONENT NOTICE',
            text:
              'Review all photos carefully for lens condition, mounting tabs, brackets, connectors, and cosmetic wear. Used lighting assemblies may show normal surface wear consistent with age and use.',
          },
          {
            title: 'MODULES / BULBS / BALLASTS',
            text:
              'Bulbs, LED drivers, ballasts, control modules, and other removable electronic accessories are included only when shown or specifically stated in the listing. Some lighting components may require programming or initialization.',
          },
        ],
      }

    case 'body_paint':
      return {
        type,
        label: 'Body & Color Notice',
        notices: [
          {
            title: 'COLOR DISCLAIMER',
            important: true,
            text:
              'Paint color and shade can vary because of lighting, camera settings, age, sun exposure, previous refinishing, and normal fading. Photos are provided as a reference only. Buyer should expect that paint correction, refinishing, or color matching may be necessary.',
          },
          {
            title: 'USED BODY PANEL CONDITION',
            text:
              'Used exterior parts may have normal scratches, scuffs, chips, small dents, surface imperfections, or other cosmetic wear. Review all listing photos carefully before purchasing.',
          },
        ],
      }

    case 'interior':
      return {
        type,
        label: 'Interior Component Notice',
        notices: [
          {
            title: 'INTERIOR COLOR & CONDITION',
            text:
              'Interior colors and shades may vary because of lighting, camera settings, production variations, age, and normal wear. Review all photos carefully and compare the part with your original component before purchasing.',
          },
          {
            title: 'NORMAL USED WEAR',
            text:
              'Used interior components may show normal wear, scratches, scuffs, fading, impressions, stains, or other cosmetic imperfections consistent with age and use.',
          },
        ],
      }

    case 'wheel_tire':
      return {
        type,
        label: 'Wheel & Tire Notice',
        notices: [
          {
            title: 'WHEEL CONDITION',
            text:
              'Used wheels may show normal cosmetic wear including scratches, curb marks, oxidation, staining, or finish imperfections. Review all photos carefully for the actual condition of the item.',
          },
          {
            title: 'FITMENT',
            text:
              'Verify wheel diameter, width, bolt pattern, offset, hub bore, and vehicle application before purchasing. Tire fitment should also be independently verified when applicable.',
          },
        ],
      }

    case 'mechanical':
      return {
        type,
        label: 'Mechanical Component Notice',
        notices: [
          {
            title: 'INSTALLATION NOTICE',
            text:
              'This is a used OEM mechanical component. Professional installation is recommended. Inspect and replace normal wear items, seals, fluids, hardware, and related service components as appropriate during installation.',
          },
          {
            title: 'FITMENT VERIFICATION',
            text:
              'Verify the OEM part number, mounting points, dimensions, connectors, drivetrain configuration, and vehicle options before purchasing.',
          },
        ],
      }

    default:
      return {
        type: 'general',
        label: 'Used OEM Part Notice',
        notices: [
          {
            title: 'USED OEM COMPONENT',
            text:
              'This is a used Original Equipment Manufacturer component. Normal wear, scratches, scuffs, surface imperfections, oxidation, staining, or other signs of previous use may be present. Review all listing photos carefully before purchasing.',
          },
          {
            title: 'FITMENT VERIFICATION',
            text:
              'Buyer should independently verify fitment using the OEM part number, photos, vehicle application, connectors, dimensions, and available donor information.',
          },
        ],
      }
  }
}
