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

    const baseUrl =
      plaidEnv === 'sandbox'
        ? 'https://sandbox.plaid.com'
        : 'https://production.plaid.com'

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

    const { data: connections, error: connectionError } =
      await supabase
        .from('finance_bank_connections')
        .select(
          'id, provider_item_id, institution_name, access_token, sync_cursor',
        )
        .eq('provider', 'PLAID')
        .eq('is_active', true)

    if (connectionError) throw connectionError

    if (!connections?.length) {
      throw new Error('No active Plaid bank connection found')
    }

    let totalAdded = 0
    let totalModified = 0
    let totalRemoved = 0
    let totalAccounts = 0

    for (const connection of connections) {
      const accountsResponse = await fetch(
        `${baseUrl}/accounts/balance/get`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            secret,
            access_token: connection.access_token,
          }),
        },
      )

      const accountsData = await accountsResponse.json()

      if (!accountsResponse.ok) {
        throw new Error(
          accountsData?.error_message ??
            'Unable to load Plaid accounts',
        )
      }

      const accountIdMap = new Map<string, number>()

      for (const account of accountsData.accounts ?? []) {
        const { data: savedAccount, error: accountError } =
          await supabase
            .from('finance_bank_accounts')
            .upsert(
              {
                provider: 'PLAID',
                provider_account_id: account.account_id,
                institution_name:
                  connection.institution_name || 'Relay',
                account_name: account.name ?? null,
                account_type: account.type ?? null,
                account_subtype: account.subtype ?? null,
                mask: account.mask ?? null,
                current_balance:
                  account.balances?.current ?? null,
                available_balance:
                  account.balances?.available ?? null,
                currency_code:
                  account.balances?.iso_currency_code ??
                  'USD',
                is_active: true,
                last_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              {
                onConflict: 'provider,provider_account_id',
              },
            )
            .select('id')
            .single()

        if (accountError) throw accountError

        accountIdMap.set(
          account.account_id,
          Number(savedAccount.id),
        )
      }

      totalAccounts += accountIdMap.size

      let cursor = connection.sync_cursor ?? null
      let hasMore = true

      while (hasMore) {
        const syncResponse = await fetch(
          `${baseUrl}/transactions/sync`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: clientId,
              secret,
              access_token: connection.access_token,
              ...(cursor ? { cursor } : {}),
              count: 500,
            }),
          },
        )

        const syncData = await syncResponse.json()

        if (!syncResponse.ok) {
          throw new Error(
            syncData?.error_message ??
              'Unable to sync Plaid transactions',
          )
        }

        const changedTransactions = [
          ...(syncData.added ?? []),
          ...(syncData.modified ?? []),
        ]

        for (const transaction of changedTransactions) {
          const bankAccountId =
            accountIdMap.get(transaction.account_id)

          if (!bankAccountId) continue

          // Plaid positive amounts are money OUT.
          // Finance V2 stores expenses as negative amounts.
          const financeAmount =
            Number(transaction.amount ?? 0) * -1

          const category =
            transaction.personal_finance_category

          const { data: savedTransaction, error: transactionError } =
            await supabase
              .from('finance_bank_transactions')
              .upsert(
                {
                  bank_account_id: bankAccountId,
                  provider: 'PLAID',
                  provider_transaction_id:
                    transaction.transaction_id,
                  transaction_date: transaction.date,
                  authorized_date:
                    transaction.authorized_date ?? null,
                  merchant_name:
                    transaction.merchant_name ?? null,
                  description:
                    transaction.name ??
                    transaction.merchant_name ??
                    'Bank transaction',
                  amount: financeAmount,
                  currency_code:
                    transaction.iso_currency_code ?? 'USD',
                  pending: Boolean(transaction.pending),
                  provider_category:
                    category?.primary ?? null,
                  provider_subcategory:
                    category?.detailed ?? null,
                  raw_data: transaction,
                  updated_at: new Date().toISOString(),
                },
                {
                  onConflict:
                    'provider,provider_transaction_id',
                },
              )
              .select('id')
              .single()

          if (transactionError) throw transactionError

          const { error: classifyError } =
            await supabase.rpc(
              'classify_finance_bank_transaction',
              {
                p_transaction_id:
                  Number(savedTransaction.id),
              },
            )

          if (classifyError) throw classifyError
        }

        for (const removed of syncData.removed ?? []) {
          const { error: removeError } = await supabase
            .from('finance_bank_transactions')
            .delete()
            .eq('provider', 'PLAID')
            .eq(
              'provider_transaction_id',
              removed.transaction_id,
            )

          if (removeError) throw removeError
        }

        totalAdded += (syncData.added ?? []).length
        totalModified += (syncData.modified ?? []).length
        totalRemoved += (syncData.removed ?? []).length

        cursor = syncData.next_cursor
        hasMore = Boolean(syncData.has_more)
      }

      const { error: cursorError } = await supabase
        .from('finance_bank_connections')
        .update({
          sync_cursor: cursor,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)

      if (cursorError) throw cursorError
    }

    return new Response(
      JSON.stringify({
        success: true,
        accounts: totalAccounts,
        added: totalAdded,
        modified: totalModified,
        removed: totalRemoved,
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
        : 'Unable to sync Plaid transactions'

    console.error('Plaid transaction sync failed:', message)

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
