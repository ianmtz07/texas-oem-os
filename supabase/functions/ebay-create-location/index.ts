Deno.serve(async () => {
  try {
    const clientId = Deno.env.get("EBAY_CLIENT_ID") ?? ""
    const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET") ?? ""
    const refreshToken = Deno.env.get("EBAY_REFRESH_TOKEN") ?? ""

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error("Missing eBay OAuth configuration")
    }

    const basic = btoa(`${clientId}:${clientSecret}`)

    const tokenBody = new URLSearchParams()
    tokenBody.set("grant_type", "refresh_token")
    tokenBody.set("refresh_token", refreshToken)

    const tokenResponse = await fetch(
      "https://api.ebay.com/identity/v1/oauth2/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenBody,
      },
    )

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(`Token refresh failed: ${JSON.stringify(tokenData)}`)
    }

    const locationResponse = await fetch(
      "https://api.ebay.com/sell/inventory/v1/location/texas-oem-main",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
          "Content-Language": "en-US",
        },
        body: JSON.stringify({
          location: {
            address: {
              postalCode: "78516",
              country: "US",
            },
          },
          locationTypes: ["WAREHOUSE"],
          name: "Texas OEM Parts",
        }),
      },
    )

    const responseText = await locationResponse.text()

    return Response.json({
      success: locationResponse.ok,
      ebayHttp: locationResponse.status,
      merchantLocationKey: "texas-oem-main",
      ebayResponse: responseText || null,
    })
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
})
