const verificationToken =
  Deno.env.get('EBAY_DELETION_VERIFICATION_TOKEN') ?? ''

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const endpoint = 'https://gtbgqwtyjeqkgmzhggdp.supabase.co/functions/v1/ebay-account-deletion'

  if (req.method === 'GET') {
    const challengeCode = url.searchParams.get('challenge_code')

    if (!challengeCode || !verificationToken) {
      return new Response(
        JSON.stringify({ error: 'Missing verification information' }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      )
    }

    const challengeResponse = await sha256Hex(
      `${challengeCode}${verificationToken}${endpoint}`,
    )

    return new Response(
      JSON.stringify({ challengeResponse }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )
  }

  if (req.method === 'POST') {
    return new Response(null, { status: 204 })
  }

  return new Response('Method not allowed', {
    status: 405,
    headers: { Allow: 'GET, POST' },
  })
})
