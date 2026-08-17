export default function handler(
  req: any,
  res: any,
) {
  const clientId =
    process.env.EBAY_CLIENT_ID ?? ""

  const runame =
    process.env.EBAY_RUNAME ?? ""

  const state =
    process.env.EBAY_OAUTH_STATE ?? ""

  const scopes = [
    "https://api.ebay.com/oauth/api_scope",
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account",
    "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
    "https://api.ebay.com/oauth/api_scope/commerce.message",
  ].join(" ")

  if (
    !clientId ||
    !runame ||
    !state
  ) {
    res
      .status(500)
      .send(
        "Missing eBay OAuth configuration.",
      )
    return
  }

  const authUrl =
    new URL(
      "https://auth.ebay.com/oauth2/authorize",
    )

  authUrl.searchParams.set(
    "client_id",
    clientId,
  )

  authUrl.searchParams.set(
    "response_type",
    "code",
  )

  authUrl.searchParams.set(
    "redirect_uri",
    runame,
  )

  authUrl.searchParams.set(
    "scope",
    scopes,
  )

  authUrl.searchParams.set(
    "state",
    state,
  )

  res.redirect(
    302,
    authUrl.toString(),
  )
}
