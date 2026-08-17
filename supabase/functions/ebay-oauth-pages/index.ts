const CLIENT_ID = Deno.env.get("EBAY_CLIENT_ID") ?? ""
const CLIENT_SECRET = Deno.env.get("EBAY_CLIENT_SECRET") ?? ""
const RUNAME = Deno.env.get("EBAY_RUNAME") ?? ""
const OAUTH_STATE = Deno.env.get("EBAY_OAUTH_STATE") ?? ""

const SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/commerce.message",
].join(" ")

function html(body: string, status = 200) {
  return new Response(
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Texas OEM OS</title>
</head>
<body style="font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:20px">
${body}
</body>
</html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  )
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const path = url.pathname

  if (path.endsWith("/privacy")) {
    return html(`
      <h1>Texas OEM OS Privacy Policy</h1>
      <p>Texas OEM OS uses authorized eBay account information solely to
      manage automotive parts inventory, listings, sales, orders, and
      related business operations.</p>
      <p>eBay credentials and authorization tokens are not sold or rented.</p>
      <p>Authorization may be revoked through eBay at any time.</p>
    `)
  }

  if (path.endsWith("/declined")) {
    return html(`
      <h1>eBay authorization declined</h1>
      <p>No access was granted.</p>
    `)
  }

  if (path.endsWith("/start")) {
    if (!CLIENT_ID || !CLIENT_SECRET || !RUNAME || !OAUTH_STATE) {
      return html("<h1>OAuth configuration missing.</h1>", 500)
    }

    const authUrl = new URL("https://auth.ebay.com/oauth2/authorize")
    authUrl.searchParams.set("client_id", CLIENT_ID)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("redirect_uri", RUNAME)
    authUrl.searchParams.set("scope", SCOPES)
    authUrl.searchParams.set("state", OAUTH_STATE)

    return Response.redirect(authUrl.toString(), 302)
  }

  if (path.endsWith("/accepted")) {
    const error = url.searchParams.get("error")
    if (error) {
      return html(`<h1>eBay authorization failed</h1><p>${escapeHtml(error)}</p>`, 400)
    }

    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")

    if (!code) {
      return html("<h1>No authorization code received.</h1>", 400)
    }

    if (!state || state !== OAUTH_STATE) {
      return html("<h1>OAuth state verification failed.</h1>", 400)
    }

    const credentials = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)

    const body = new URLSearchParams()
    body.set("grant_type", "authorization_code")
    body.set("code", code)
    body.set("redirect_uri", RUNAME)

    const tokenResponse = await fetch(
      "https://api.ebay.com/identity/v1/oauth2/token",
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    )

    const tokenText = await tokenResponse.text()

    if (!tokenResponse.ok) {
      return html(`
        <h1>eBay token exchange failed</h1>
        <pre>${escapeHtml(tokenText)}</pre>
      `, 500)
    }

    const tokenData = JSON.parse(tokenText)
    const refreshToken = tokenData.refresh_token ?? ""

    if (!refreshToken) {
      return html("<h1>No refresh token was returned by eBay.</h1>", 500)
    }

    return html(`
  <h1>Texas OEM OS eBay Authorization Complete</h1>

  <p style="font-size:18px">
    <strong>Your new refresh token is ready.</strong>
  </p>

  <p>Tap the button below. Do not manually select the token.</p>

  <textarea
    id="refreshToken"
    readonly
    style="
      width:100%;
      height:160px;
      box-sizing:border-box;
      font-family:monospace;
      font-size:12px;
      padding:12px;
    "
  >${escapeHtml(refreshToken)}</textarea>

  <br><br>

  <button
    id="copyButton"
    type="button"
    style="
      width:100%;
      font-size:20px;
      font-weight:700;
      padding:16px;
      background:#173a54;
      color:white;
      border:0;
      border-radius:10px;
    "
    onclick="
      navigator.clipboard.writeText(
        document.getElementById('refreshToken').value
      ).then(() => {
        document.getElementById('copyButton').innerText = 'COPIED ✓'
      })
    "
  >
    COPY REFRESH TOKEN
  </button>
`)
  }

  return html(`
    <h1>Texas OEM OS</h1>
    <p>eBay OAuth service is running.</p>
  `)
})
