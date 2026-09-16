create table if not exists public.ebay_fulfillment_order_items (
  line_item_id text primary key,

  order_id text not null
    references public.ebay_fulfillment_orders(order_id)
    on delete cascade,

  ebay_item_id text,
  sku text,
  title text,

  quantity integer not null default 1,

  line_item_cost numeric(14,2),
  line_total numeric(14,2),
  shipping_cost numeric(14,2),
  ebay_collected_tax numeric(14,2),

  currency text not null default 'USD',

  fulfillment_status text,

  raw_line_item jsonb not null default '{}'::jsonb,

  first_synced_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now()
);

create index if not exists ebay_fulfillment_order_items_order_id_idx
  on public.ebay_fulfillment_order_items (order_id);

create index if not exists ebay_fulfillment_order_items_sku_idx
  on public.ebay_fulfillment_order_items (sku);

create index if not exists ebay_fulfillment_order_items_ebay_item_id_idx
  on public.ebay_fulfillment_order_items (ebay_item_id);

alter table public.ebay_fulfillment_order_items
  enable row level security;

drop policy if exists "Allow eBay fulfillment order item reads"
  on public.ebay_fulfillment_order_items;

create policy "Allow eBay fulfillment order item reads"
  on public.ebay_fulfillment_order_items
  for select
  to anon, authenticated
  using (true);
