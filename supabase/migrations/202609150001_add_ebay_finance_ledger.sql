create table if not exists public.ebay_finance_transactions (
  transaction_id text primary key,

  order_id text,
  payout_id text,
  sales_record_reference text,

  transaction_type text not null,
  booking_entry text not null,

  amount numeric(14,2) not null,
  currency text not null default 'USD',

  transaction_date timestamptz,
  transaction_status text,
  transaction_memo text,
  fee_type text,

  total_fee_basis_amount numeric(14,2),
  total_fee_amount numeric(14,2),
  ebay_collected_tax_amount numeric(14,2),

  raw_transaction jsonb not null default '{}'::jsonb,

  first_synced_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now()
);

create index if not exists ebay_finance_transactions_order_id_idx
  on public.ebay_finance_transactions (order_id);

create index if not exists ebay_finance_transactions_payout_id_idx
  on public.ebay_finance_transactions (payout_id);

create index if not exists ebay_finance_transactions_type_idx
  on public.ebay_finance_transactions (transaction_type);

create index if not exists ebay_finance_transactions_date_idx
  on public.ebay_finance_transactions (transaction_date desc);

alter table public.ebay_finance_transactions enable row level security;

drop policy if exists "Allow eBay finance ledger reads"
  on public.ebay_finance_transactions;

create policy "Allow eBay finance ledger reads"
  on public.ebay_finance_transactions
  for select
  to anon, authenticated
  using (true);
