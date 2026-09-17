import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const clientId = Deno.env.get('PLAID_CLIENT_ID')
    const secret = Deno.env.get('PLAID_SECRET')
    const plaidEnv = Deno.env.get('PLAID_ENV') ?? 'production'

    if (!clientId || !secret) {
      throw new Error('Plaid credentials are not configured')
    }

    const baseUrl =
      plaidEnv === 'sandbox'
        ? 'https://sandbox.plaid.com'
        : 'https://production.plaid.com'

    const response = await fetch(
      `${baseUrl}/link/token/create`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          secret,
          client_name: 'Texas OEM Parts',
          language: 'en',
          country_codes: ['US'],
          products: ['transactions'],
          user: {
            client_user_id: 'texas-oem-parts-owner',
          },
        }),
      },
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('Plaid link token error:', data)

      return new Response(
        JSON.stringify({
          success: false,
          error:
            data?.error_message ??
            'Unable to create Plaid Link token',
          plaid_error_code: data?.error_code ?? null,
        }),
        {
          status: response.status,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        link_token: data.link_token,
        expiration: data.expiration,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to create Plaid Link token'

    console.error(message)

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    )
  }
})
