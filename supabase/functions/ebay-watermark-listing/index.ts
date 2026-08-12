import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import {
  CompositeOperator,
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  Point,
} from "npm:@imagemagick/magick-wasm@0.0.40"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const wasmBytes = await Deno.readFile(
  new URL(
    "magick.wasm",
    import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.40"),
  ),
)
await initializeImageMagick(wasmBytes)

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '\"')
    .replace(/&#39;/g, "'")
    .trim()
}

function allPictureUrls(xml: string) {
  const pictureBlock =
    xml.match(/<PictureDetails(?:\s[^>]*)?>([\s\S]*?)<\/PictureDetails>/)?.[1] ?? ""

  return Array.from(
    pictureBlock.matchAll(/<PictureURL>(.*?)<\/PictureURL>/g),
  )
    .map((match) => decodeXml(match[1] ?? ""))
    .filter(Boolean)
}

function ebayErrorMessage(xml: string) {
  const long = xml.match(/<LongMessage>([\s\S]*?)<\/LongMessage>/)?.[1]
  const short = xml.match(/<ShortMessage>([\s\S]*?)<\/ShortMessage>/)?.[1]
  return decodeXml(long ?? short ?? xml)
}

async function getAccessToken() {
  const clientId = Deno.env.get("EBAY_CLIENT_ID") ?? ""
  const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET") ?? ""
  const refreshToken = Deno.env.get("EBAY_REFRESH_TOKEN") ?? ""

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing eBay OAuth configuration")
  }

  const basic = btoa(`${clientId}:${clientSecret}`)
  const body = new URLSearchParams()
  body.set("grant_type", "refresh_token")
  body.set("refresh_token", refreshToken)

  const response = await fetch(
    "https://api.ebay.com/identity/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  )

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${await response.text()}`)
  }

  const data = await response.json()
  return String(data.access_token ?? "")
}

async function tradingCall(
  accessToken: string,
  callName: string,
  body: string,
) {
  const response = await fetch("https://api.ebay.com/ws/api.dll", {
    method: "POST",
    headers: {
      "X-EBAY-API-CALL-NAME": callName,
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
      "X-EBAY-API-IAF-TOKEN": accessToken,
      "Content-Type": "text/xml",
    },
    body,
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${callName} HTTP ${response.status}: ${text}`)
  }

  return text
}

async function getListingPictures(accessToken: string, itemId: string) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${xmlEscape(itemId)}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`

  const text = await tradingCall(accessToken, "GetItem", xml)
  const ack = text.match(/<Ack>(.*?)<\/Ack>/)?.[1] ?? "Failure"

  if (ack !== "Success" && ack !== "Warning") {
    throw new Error(`GetItem failed: ${ebayErrorMessage(text)}`)
  }

  const pictures = allPictureUrls(text)
  if (!pictures.length) {
    throw new Error("The eBay listing has no picture URLs to watermark.")
  }

  return pictures
}

async function watermarkJpeg(
  sourceBytes: Uint8Array,
  watermarkBytes: Uint8Array,
) {
  return ImageMagick.read(sourceBytes, (image): Uint8Array => {
    return ImageMagick.read(watermarkBytes, (watermark): Uint8Array => {
      const targetWidth = Math.max(1, Math.round(image.width * 0.17))
      const targetHeight = Math.max(
        1,
        Math.round(targetWidth * (watermark.height / watermark.width)),
      )
      const margin = Math.max(1, Math.round(image.width * 0.02))

      watermark.resize(targetWidth, targetHeight)

      const x = Math.max(0, image.width - watermark.width - margin)
      const y = margin

      image.composite(
        watermark,
        CompositeOperator.Dissolve,
        new Point(x, y),
        "72",
      )

      return image.write(MagickFormat.Jpeg, (data) => data)
    })
  })
}

async function createEpsImageFromUrl(
  accessToken: string,
  imageUrl: string,
) {
  const response = await fetch(
    "https://apim.ebay.com/commerce/media/v1_beta/image/create_image_from_url",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageUrl }),
    },
  )

  const text = await response.text()
  let data: Record<string, unknown> = {}

  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = {}
  }

  if (!response.ok) {
    throw new Error(
      `Media API image upload failed HTTP ${response.status}: ${text}`,
    )
  }

  const epsUrl = String(data.imageUrl ?? "")
  if (!epsUrl) {
    throw new Error(`Media API did not return imageUrl: ${text}`)
  }

  return epsUrl
}

async function reviseListingPictures(
  accessToken: string,
  itemId: string,
  epsUrls: string[],
) {
  const pictureXml = epsUrls
    .map((url) => `      <PictureURL>${xmlEscape(url)}</PictureURL>`)
    .join("\n")

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item>
    <ItemID>${xmlEscape(itemId)}</ItemID>
    <PictureDetails>
${pictureXml}
    </PictureDetails>
  </Item>
</ReviseFixedPriceItemRequest>`

  const text = await tradingCall(
    accessToken,
    "ReviseFixedPriceItem",
    xml,
  )

  const ack = text.match(/<Ack>(.*?)<\/Ack>/)?.[1] ?? "Failure"
  if (ack !== "Success" && ack !== "Warning") {
    throw new Error(
      `ReviseFixedPriceItem failed: ${ebayErrorMessage(text)}`,
    )
  }

  return { ack, raw: text }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const itemId = String(body.itemId ?? "").trim()
    const mode = String(body.mode ?? "PREVIEW").trim().toUpperCase()

    if (!itemId) {
      return Response.json(
        { success: false, error: "itemId is required" },
        { status: 400, headers: corsHeaders },
      )
    }

    if (mode !== "PREVIEW" && mode !== "APPLY") {
      return Response.json(
        { success: false, error: "mode must be PREVIEW or APPLY" },
        { status: 400, headers: corsHeaders },
      )
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase service-role configuration")
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const accessToken = await getAccessToken()
    const originalUrls = await getListingPictures(accessToken, itemId)

    const watermarkUrl =
      Deno.env.get("TEXAS_OEM_WATERMARK_URL") ??
      "https://texas-oem-os.vercel.app/texas-oem-watermark.png"

    const watermarkResponse = await fetch(watermarkUrl)
    if (!watermarkResponse.ok) {
      throw new Error(
        `Unable to download watermark HTTP ${watermarkResponse.status}`,
      )
    }

    const watermarkBytes = new Uint8Array(
      await watermarkResponse.arrayBuffer(),
    )

    const urlsToProcess =
      mode === "PREVIEW" ? originalUrls.slice(0, 1) : originalUrls

    const processed: Array<{
      index: number
      originalUrl: string
      storageUrl: string
      epsUrl?: string
    }> = []

    const runId = Date.now()

    for (let index = 0; index < urlsToProcess.length; index++) {
      const originalUrl = urlsToProcess[index]
      const sourceResponse = await fetch(originalUrl)

      if (!sourceResponse.ok) {
        throw new Error(
          `Unable to download eBay photo ${index + 1} HTTP ${sourceResponse.status}`,
        )
      }

      const sourceBytes = new Uint8Array(
        await sourceResponse.arrayBuffer(),
      )
      const resultBytes = await watermarkJpeg(sourceBytes, watermarkBytes)
      const storagePath =
        `ebay-watermarked/${itemId}/${runId}-${index + 1}.jpg`

      const { error: uploadError } = await supabase.storage
        .from("part-photos")
        .upload(storagePath, resultBytes, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: false,
        })

      if (uploadError) {
        throw new Error(
          `Supabase upload failed for photo ${index + 1}: ${uploadError.message}`,
        )
      }

      const storageUrl = supabase.storage
        .from("part-photos")
        .getPublicUrl(storagePath).data.publicUrl

      if (mode === "PREVIEW") {
        processed.push({
          index,
          originalUrl,
          storageUrl,
        })
        continue
      }

      const epsUrl = await createEpsImageFromUrl(
        accessToken,
        storageUrl,
      )

      processed.push({
        index,
        originalUrl,
        storageUrl,
        epsUrl,
      })
    }

    if (mode === "PREVIEW") {
      return Response.json(
        {
          success: true,
          mode,
          itemId,
          originalPhotoCount: originalUrls.length,
          previewUrl: processed[0]?.storageUrl ?? "",
          message:
            "Preview generated only. The live eBay listing was NOT changed.",
        },
        { headers: corsHeaders },
      )
    }

    const epsUrls = processed
      .map((item) => item.epsUrl ?? "")
      .filter(Boolean)

    if (epsUrls.length !== originalUrls.length) {
      throw new Error(
        `Safety stop: expected ${originalUrls.length} EPS URLs but created ${epsUrls.length}. Listing was NOT revised.`,
      )
    }

    const revise = await reviseListingPictures(
      accessToken,
      itemId,
      epsUrls,
    )

    return Response.json(
      {
        success: true,
        mode,
        itemId,
        originalPhotoCount: originalUrls.length,
        watermarkedPhotoCount: epsUrls.length,
        firstWatermarkedUrl: epsUrls[0] ?? "",
        ebayAck: revise.ack,
        message:
          "Live eBay listing photos were replaced with watermarked EPS images in the original order.",
      },
      { headers: corsHeaders },
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: corsHeaders },
    )
  }
})
