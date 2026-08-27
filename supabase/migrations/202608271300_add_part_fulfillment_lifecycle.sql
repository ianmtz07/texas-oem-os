alter table public.parts
  add column if not exists picked_at timestamptz,
  add column if not exists shipped_at timestamptz,
  add column if not exists ebay_order_id text;

create index if not exists parts_picked_at_idx
  on public.parts (picked_at);

create index if not exists parts_shipped_at_idx
  on public.parts (shipped_at);

create index if not exists parts_ebay_order_id_idx
  on public.parts (ebay_order_id);
