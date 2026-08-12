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
    throw new Error("The eBay listing has no picture URLs.")
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

      image.quality = 95
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

  const maxDimensionImageUrl = String(data.maxDimensionImageUrl ?? "")
  const imageUrlReturned = String(data.imageUrl ?? "")
  const epsUrl = maxDimensionImageUrl || imageUrlReturned

  if (!epsUrl) {
    throw new Error(`Media API did not return an EPS image URL: ${text}`)
  }

  return {
    epsUrl,
    maxDimensionImageUrl,
    imageUrl: imageUrlReturned,
  }
}

async function reviseListingPictures(
  accessToken: string,
  itemId: string,
  pictureUrls: string[],
) {
  const pictureXml = pictureUrls
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

  return ack
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const itemId = String(body.itemId ?? "").trim()
    const photoIndex = Number(body.photoIndex ?? -1)
    const explicitSourceUrl = String(body.sourceUrl ?? "").trim()

    if (!itemId) {
      return Response.json(
        { success: false, error: "itemId is required" },
        { status: 400, headers: corsHeaders },
      )
    }

    if (!Number.isInteger(photoIndex) || photoIndex < 0) {
      return Response.json(
        { success: false, error: "photoIndex must be 0 or greater" },
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
    const pictureUrls = await getListingPictures(accessToken, itemId)

    if (photoIndex >= pictureUrls.length) {
      return Response.json(
        {
          success: false,
          error: `photoIndex ${photoIndex} is out of range for ${pictureUrls.length} photos`,
        },
        { status: 400, headers: corsHeaders },
      )
    }

    let sourceUrl = explicitSourceUrl
    let sourceKind = explicitSourceUrl ? "explicit" : "current-ebay"

    if (!sourceUrl) {
      const { data: listingRow } = await supabase
        .from("ebay_listings")
        .select("matched_part_id")
        .eq("ebay_item_id", itemId)
        .maybeSingle()

      const matchedPartId = String(listingRow?.matched_part_id ?? "")

      if (matchedPartId) {
        const originalStoragePath = `ebay/${itemId}/${photoIndex + 1}`
        const { data: originalPhotoRow } = await supabase
          .from("part_photos")
          .select("public_url")
          .eq("part_id", matchedPartId)
          .eq("storage_path", originalStoragePath)
          .maybeSingle()

        const originalUrl = String(originalPhotoRow?.public_url ?? "").trim()
        if (originalUrl) {
          sourceUrl = originalUrl
          sourceKind = "imported-original"
        }
      }
    }

    if (!sourceUrl) {
      sourceUrl = pictureUrls[photoIndex]
      sourceKind = "current-ebay"
    }

    const watermarkUrl =
      Deno.env.get("TEXAS_OEM_WATERMARK_URL") ??
      "https://texas-oem-os.vercel.app/texas-oem-watermark.png"

    const [watermarkResponse, sourceResponse] = await Promise.all([
      fetch(watermarkUrl),
      fetch(sourceUrl),
    ])

    if (!watermarkResponse.ok) {
      throw new Error(
        `Unable to download watermark HTTP ${watermarkResponse.status}`,
      )
    }

    if (!sourceResponse.ok) {
      throw new Error(
        `Unable to download source photo ${photoIndex + 1} HTTP ${sourceResponse.status}`,
      )
    }

    const watermarkBytes = new Uint8Array(
      await watermarkResponse.arrayBuffer(),
    )
    const sourceBytes = new Uint8Array(
      await sourceResponse.arrayBuffer(),
    )

    const resultBytes = await watermarkJpeg(sourceBytes, watermarkBytes)
    const storagePath =
      `ebay-watermarked-hq/${itemId}/${Date.now()}-${photoIndex + 1}.jpg`

    const { error: uploadError } = await supabase.storage
      .from("part-photos")
      .upload(storagePath, resultBytes, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: false,
      })

    if (uploadError) {
      throw new Error(
        `Supabase upload failed: ${uploadError.message}`,
      )
    }

    const storageUrl = supabase.storage
      .from("part-photos")
      .getPublicUrl(storagePath).data.publicUrl

    const eps = await createEpsImageFromUrl(accessToken, storageUrl)

    const revisedUrls = [...pictureUrls]
    revisedUrls[photoIndex] = eps.epsUrl

    const ebayAck = await reviseListingPictures(
      accessToken,
      itemId,
      revisedUrls,
    )

    return Response.json(
      {
        success: true,
        itemId,
        photoIndex,
        photoNumber: photoIndex + 1,
        totalPhotos: pictureUrls.length,
        sourceKind,
        sourceUrl,
        storageUrl,
        imageUrl: eps.imageUrl,
        maxDimensionImageUrl: eps.maxDimensionImageUrl,
        watermarkedUrl: eps.epsUrl,
        jpegQuality: 95,
        ebayAck,
        message:
          `Photo ${photoIndex + 1} of ${pictureUrls.length} was rebuilt from the best available source at JPEG quality 95 and revised using eBay's maximum-dimension EPS URL when available.`,
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
