alter table public.parts
  add column if not exists notes text;
alter table public.parts
  add column if not exists sku_code text;
