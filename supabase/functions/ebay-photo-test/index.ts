async function getAccessToken() {
  const clientId = Deno.env.get("EBAY_CLIENT_ID") ?? ""
  const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET") ?? ""
  const refreshToken = Deno.env.get("EBAY_REFRESH_TOKEN") ?? ""

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
    throw new Error(await response.text())
  }

  const data = await response.json()
  return data.access_token
}

Deno.serve(async () => {
  try {
    const accessToken = await getAccessToken()

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>188627882321</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`

    const response = await fetch("https://api.ebay.com/ws/api.dll", {
      method: "POST",
      headers: {
        "X-EBAY-API-CALL-NAME": "GetItem",
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "967",
        "X-EBAY-API-IAF-TOKEN": accessToken,
        "Content-Type": "text/xml",
      },
      body: xml,
    })

    const text = await response.text()

    const ack =
      text.match(/<Ack>(.*?)<\/Ack>/)?.[1] ?? "NONE"

    const pictures =
      Array.from(
        text.matchAll(/<PictureURL>(.*?)<\/PictureURL>/g),
      ).map((m) => m[1])

    return Response.json({
      http: response.status,
      ack,
      pictureCount: pictures.length,
      firstPictures: pictures.slice(0, 3),
    })
  } catch (error) {
    return Response.json({
      error: String(error),
    }, { status: 500 })
  }
})
