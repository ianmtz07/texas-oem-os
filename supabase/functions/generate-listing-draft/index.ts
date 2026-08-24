import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function sanitizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildVisionPrompt(body: Record<string, unknown>) {
  const part = body.part && typeof body.part === 'object' ? body.part as Record<string, unknown> : {}
  const vehicle = body.vehicle && typeof body.vehicle === 'object' ? body.vehicle as Record<string, unknown> : {}
  const photoUrls = Array.isArray(body.photoUrls) ? body.photoUrls.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : []

  const soldCompTitles =
    Array.isArray(body.soldCompTitles)
      ? body.soldCompTitles
          .filter(
            (value): value is string =>
              typeof value === 'string' &&
              value.trim().length > 0,
          )
          .map((value) => value.trim())
          .slice(0, 15)
      : []

  const soldTitleEvidence =
    soldCompTitles.length > 0
      ? soldCompTitles
          .map(
            (title, index) =>
              `${index + 1}. ${title}`,
          )
          .join('\\n')
      : 'No sold-title evidence supplied.'

  return `You are an expert eBay parts listing analyst for a professional salvage and parts operation.

Task: Analyze all uploaded photos and produce a premium eBay listing draft.

Requirements:
- Create a polished eBay title that sounds like a Top Rated automotive OEM parts seller wrote it.
- eBay title MUST be 80 characters or fewer.
- Never use generic title structures such as "Part Name for Vehicle", "For Vehicle", or "Part Pulled From Vehicle."
- NEVER simply combine the entered Part Name with the donor vehicle to create the title.
- Treat generic intake names such as "Module", "Sensor", "Switch", "Bracket", "Control", "Unit", "Assembly", "Panel", "Motor", "Computer", "ECU", and similar vague names as PLACEHOLDERS, not verified part identities.
- When Part Name is generic, identify the actual component using the OEM Part Number, visible labels, OCR, photos, connector shape, placement, and vehicle context.
- The OEM Part Number is a high-value identity signal. If supplied, include it in the title when useful for buyer search.
- Prefer buyer search terminology and common automotive abbreviations when supported, such as BCM, ECM, TCM, HVAC, ABS, LH, RH, OEM, etc.
- NEVER invent a specific component identity or abbreviation that is not supported by the supplied evidence.
- If the exact component cannot be identified confidently, keep the title conservative rather than hallucinating.
- Do not claim compatibility with vehicles that are not verified by the supplied evidence.
- Use the donor vehicle as source context, not proof of universal fitment.
- Use the vehicle and part context to infer condition and presentation.
- If confidence is below 80%, flag that more photos are needed.

Context:
- Part Name: ${sanitizeText(part.partName) || 'Unknown'}
- Part Number: ${sanitizeText(part.partNumber) || 'Unknown'}
- Interchange Number: ${sanitizeText(part.interchangeNumber) || 'Unknown'}
- Condition: ${sanitizeText(part.condition) || 'Unknown'}
- Notes: ${sanitizeText(part.notes) || 'None'}
- Vehicle: ${sanitizeText(vehicle.year)} ${sanitizeText(vehicle.make)} ${sanitizeText(vehicle.model)} ${sanitizeText(vehicle.trim)}
- VIN: ${sanitizeText(vehicle.vin) || 'Unknown'}
- Engine: ${sanitizeText(part.engine) || 'Unknown'}
- Transmission: ${sanitizeText(part.transmission) || 'Unknown'}
- OEM Brand: ${sanitizeText(part.brand) || 'Unknown'}
- SKU: ${sanitizeText(part.sku) || 'Unknown'}
- Photos: ${photoUrls.length}

Verified eBay sold-title evidence:
${soldTitleEvidence}

SOLD-TITLE INTELLIGENCE RULES:
- Treat the sold titles above as market evidence, not text to blindly copy.
- When multiple sold titles containing this OEM number agree on the component identity, use that consensus to identify the part.
- Prefer terminology repeatedly used by multiple relevant sold listings.
- Cross-check that market identity against the supplied OEM number, donor vehicle, photos, labels, OCR, and connectors.
- A generic intake Part Name such as "Module" MUST NOT override stronger sold-market identity evidence.
- Do not adopt a specific identity from one questionable listing when the rest of the evidence disagrees.
- Do not claim fitment ranges merely because another seller used them.
- Build a NEW optimized title; do not copy one competitor title verbatim.
- Put high-value buyer search terms near the front of the title.
- Include the OEM number when supplied.
- Never return only the original generic intake Part Name as the title.

Analyze every image for:
- Part Name
- Side (LH/RH)
- Front/Rear
- Upper/Lower
- OEM Brand
- Condition
- Damage
- Missing tabs
- Missing connectors
- Color
- Finish
- Material
- Visible Part Numbers
- Stickers
- Labels
- Casting Numbers
- VIN labels
- Barcode labels
- OCR text from every image

Return the result as JSON with this schema:
{
  "title": "80 char max eBay title",
  "seoSubtitle": "short SEO subtitle",
  "conditionDescription": "professional condition description",
  "description": "full eBay description",
  "categorySuggestion": "best category suggestion",
  "itemSpecifics": { "Brand": "", "Condition": "", "Placement": "", "Color": "", "OEM Part Number": "", "Interchange Number": "", "Fitment": "" },
  "compatibilityNotes": "fitment note",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "shippingRecommendation": "shipping guidance",
  "estimatedWeight": "e.g. 8-12 lbs",
  "estimatedDimensions": "e.g. 18 x 12 x 6 in",
  "aiConfidence": 0,
  "needsMorePhotos": false,
  "ocrResults": "concatenated OCR text",
  "imageAnalysis": "summary of all image findings"
}

Ensure the title is strong and specific, not generic.`
}

async function callOpenAi(prompt: string, imageUrls: string[]) {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const payload = {
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'system',
        content: 'You are an expert eBay listing analyst and parts identification assistant.'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...imageUrls.slice(0, 8).map((url) => ({
            type: 'image_url',
            image_url: { url },
          }))
        ],
      },
    ],
    temperature: 0.2,
    max_tokens: 2200,
    response_format: {
      type: 'json_object',
    },
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenAI request failed: ${response.status} ${text}`)
  }

  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = json.choices?.[0]?.message?.content ?? ''

  try {
    return JSON.parse(content)
  } catch {
    return {
      title: 'Premium listing draft pending',
      seoSubtitle: 'AI analysis pending',
      conditionDescription: 'Professional condition description pending',
      description: content || 'AI analysis pending',
      categorySuggestion: 'Auto Parts',
      itemSpecifics: {},
      compatibilityNotes: 'Compatibility should be confirmed before sale.',
      keywords: [],
      shippingRecommendation: 'Insured shipping recommended.',
      estimatedWeight: 'TBD',
      estimatedDimensions: 'TBD',
      aiConfidence: 60,
      needsMorePhotos: true,
      ocrResults: '',
      imageAnalysis: content || 'Image analysis pending',
    }
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const prompt = buildVisionPrompt(body)
    const photoUrls = Array.isArray(body.photoUrls) ? body.photoUrls.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : []
    const result = await callOpenAi(prompt, photoUrls)

    return new Response(JSON.stringify({ success: true, draft: result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
