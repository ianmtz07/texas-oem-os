export default async function handler(
  req: any,
  res: any,
) {
  const clientId =
    process.env.EBAY_CLIENT_ID ?? ""

  const clientSecret =
    process.env.EBAY_CLIENT_SECRET ?? ""

  const runame =
    process.env.EBAY_RUNAME ?? ""

  const expectedState =
    process.env.EBAY_OAUTH_STATE ?? ""

  const code =
    String(req.query?.code ?? "")

  const state =
    String(req.query?.state ?? "")

  const error =
    String(req.query?.error ?? "")

  res.setHeader(
    "Cache-Control",
    "no-store, max-age=0",
  )

  res.setHeader(
    "Content-Type",
    "text/html; charset=utf-8",
  )

  if (error) {
    res.status(400).send(`
      <!doctype html>
      <html>
        <body style="font-family:Arial;padding:40px">
          <h1>eBay authorization failed</h1>
          <p>${error}</p>
        </body>
      </html>
    `)
    return
  }

  if (
    !clientId ||
    !clientSecret ||
    !runame ||
    !expectedState
  ) {
    res.status(500).send(
      "Missing eBay OAuth configuration.",
    )
    return
  }

  if (!code) {
    res.status(400).send(
      "No authorization code received.",
    )
    return
  }

  if (
    !state ||
    state !== expectedState
  ) {
    res.status(400).send(
      "OAuth state verification failed.",
    )
    return
  }

  const credentials =
    Buffer.from(
      `${clientId}:${clientSecret}`,
    ).toString("base64")

  const body =
    new URLSearchParams()

  body.set(
    "grant_type",
    "authorization_code",
  )

  body.set(
    "code",
    code,
  )

  body.set(
    "redirect_uri",
    runame,
  )

  const tokenResponse =
    await fetch(
      "https://api.ebay.com/identity/v1/oauth2/token",
      {
        method: "POST",
        headers: {
          Authorization:
            `Basic ${credentials}`,
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body,
      },
    )

  const tokenText =
    await tokenResponse.text()

  if (!tokenResponse.ok) {
    res.status(500).send(`
      <!doctype html>
      <html>
        <body style="font-family:Arial;padding:40px">
          <h1>eBay token exchange failed</h1>
          <pre>${tokenText}</pre>
        </body>
      </html>
    `)
    return
  }

  const tokenData =
    JSON.parse(tokenText)

  const refreshToken =
    String(
      tokenData.refresh_token ?? "",
    )

  if (!refreshToken) {
    res.status(500).send(
      "No refresh token returned by eBay.",
    )
    return
  }

  const safeToken =
    refreshToken
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")

  res.status(200).send(`
    <!doctype html>
    <html>
      <head>
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1"
        >
        <title>Texas OEM OS</title>
      </head>

      <body style="
        font-family:Arial,sans-serif;
        max-width:700px;
        margin:50px auto;
        padding:24px;
      ">
        <h1>Texas OEM OS</h1>

        <h2>
          eBay Authorization Complete ✅
        </h2>

        <p>
          Your new refresh token includes the
          Fulfillment permission needed for
          automatic sold-order synchronization.
        </p>

        <textarea
          id="refreshToken"
          readonly
          style="
            width:100%;
            height:150px;
            box-sizing:border-box;
            padding:12px;
            font-family:monospace;
          "
        >${safeToken}</textarea>

        <br><br>

        <button
          id="copyButton"
          onclick="
            navigator.clipboard
              .writeText(
                document.getElementById(
                  'refreshToken'
                ).value
              )
              .then(() => {
                document.getElementById(
                  'copyButton'
                ).innerText =
                  'COPIED ✓'
              })
          "
          style="
            width:100%;
            padding:16px;
            font-size:18px;
            font-weight:700;
            background:#173a54;
            color:white;
            border:0;
            border-radius:10px;
          "
        >
          COPY REFRESH TOKEN
        </button>
      </body>
    </html>
  `)
}
