import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!clientId || !secret) {
      throw new Error('Plaid credentials are not configured')
    }

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase backend credentials are not configured')
    }

    const { public_token, institution_name } = await req.json()

    if (!public_token) {
      throw new Error('Missing Plaid public token')
    }

    const baseUrl =
      plaidEnv === 'sandbox'
        ? 'https://sandbox.plaid.com'
        : 'https://production.plaid.com'

    const response = await fetch(
      `${baseUrl}/item/public_token/exchange`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          secret,
          public_token,
        }),
      },
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('Plaid token exchange error:', data)

      throw new Error(
        data?.error_message ??
          'Unable to exchange Plaid public token',
      )
    }

    if (!data.access_token || !data.item_id) {
      throw new Error(
        'Plaid exchange succeeded but returned incomplete credentials',
      )
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    )

    const { error: saveError } = await supabase
      .from('finance_bank_connections')
      .upsert(
        {
          provider: 'PLAID',
          provider_item_id: data.item_id,
          institution_name:
            institution_name || 'Relay',
          access_token: data.access_token,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'provider,provider_item_id',
        },
      )

    if (saveError) {
      console.error(
        'Unable to save Plaid connection:',
        saveError,
      )

      throw new Error(
        `Plaid connected but Finance V2 could not save the connection: ${saveError.message}`,
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        item_id: data.item_id,
        institution_name:
          institution_name || 'Relay',
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
        : 'Unable to connect bank account'

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
