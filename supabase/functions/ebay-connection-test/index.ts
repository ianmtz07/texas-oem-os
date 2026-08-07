Deno.serve(async () => {
  try {
    const clientId = Deno.env.get("EBAY_CLIENT_ID") ?? ""
    const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET") ?? ""
    const refreshToken = Deno.env.get("EBAY_REFRESH_TOKEN") ?? ""

    if (!clientId || !clientSecret || !refreshToken) {
      return Response.json({
        success: false,
        error: "Missing eBay secret(s)"
      }, { status: 500 })
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
          "Authorization": `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    )

    const data = await response.json()

    if (!response.ok) {
      return Response.json({
        success: false,
        ebayHttp: response.status,
        error: data.error ?? "token_refresh_failed",
        description: data.error_description ?? ""
      }, { status: 500 })
    }

    return Response.json({
      success: true,
      message: "PERMANENT EBAY CONNECTION WORKING",
      tokenType: data.token_type,
      expiresIn: data.expires_in
    })
  } catch (error) {
    return Response.json({
      success: false,
      error: String(error)
    }, { status: 500 })
  }
})
