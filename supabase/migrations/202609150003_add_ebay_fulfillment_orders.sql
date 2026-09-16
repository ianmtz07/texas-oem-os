create table if not exists public.ebay_fulfillment_orders (
  order_id text primary key,

  legacy_order_id text,
  sales_record_reference text,

  creation_date timestamptz,
  last_modified_date timestamptz,

  payment_status text,
  fulfillment_status text,
  cancel_state text,

  price_subtotal numeric(14,2),
  delivery_cost numeric(14,2),
  order_total numeric(14,2),

  total_due_seller numeric(14,2),
  total_fee_basis_amount numeric(14,2),
  total_marketplace_fee numeric(14,2),

  currency text not null default 'USD',

  raw_order jsonb not null default '{}'::jsonb,

  first_synced_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now()
);

create index if not exists ebay_fulfillment_orders_creation_date_idx
  on public.ebay_fulfillment_orders (creation_date desc);

create index if not exists ebay_fulfillment_orders_payment_status_idx
  on public.ebay_fulfillment_orders (payment_status);

create index if not exists ebay_fulfillment_orders_fulfillment_status_idx
  on public.ebay_fulfillment_orders (fulfillment_status);

alter table public.ebay_fulfillment_orders
  enable row level security;

drop policy if exists "Allow eBay fulfillment order reads"
  on public.ebay_fulfillment_orders;

create policy "Allow eBay fulfillment order reads"
  on public.ebay_fulfillment_orders
  for select
  to anon, authenticated
  using (true);
