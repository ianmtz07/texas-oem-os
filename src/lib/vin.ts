export type VinDecodeResult = {
  vin: string
  modelYear?: string | null
  make?: string | null
  model?: string | null
  trim?: string | null
  bodyClass?: string | null
  driveType?: string | null
  engineDisplacement?: string | null
  engineCylinders?: string | null
  fuelType?: string | null
  transmissionStyle?: string | null
  plant?: string | null
  gvwr?: string | null
  rawDecode?: Record<string, unknown> | null
}

export function normalizeVin(value: string) {
  return (value || '').trim().toUpperCase()
}

export function isValidVin(value: string) {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(normalizeVin(value))
}

export function buildVehicleDecodeSummary(result: VinDecodeResult) {
  return {
    vin: result.vin,
    modelYear: result.modelYear ?? '',
    make: result.make ?? '',
    model: result.model ?? '',
    trim: result.trim ?? '',
    bodyClass: result.bodyClass ?? '',
    driveType: result.driveType ?? '',
    engineDisplacement: result.engineDisplacement ?? '',
    engineCylinders: result.engineCylinders ?? '',
    fuelType: result.fuelType ?? '',
    transmissionStyle: result.transmissionStyle ?? '',
    plant: result.plant ?? '',
    gvwr: result.gvwr ?? '',
  }
}
