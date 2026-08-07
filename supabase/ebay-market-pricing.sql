create table if not exists public.ebay_market_comps (
  id uuid primary key default gen_random_uuid(),
  part_id uuid references public.parts(id) on delete cascade,
  query text,
  source text,
  listing_type text,
  ebay_item_id text,
  title text,
  condition text,
  price numeric,
  shipping numeric,
  total_price numeric,
  sold_date timestamptz,
  seller_feedback_percentage numeric,
  item_url text,
  match_score numeric,
  created_at timestamptz default now()
);

create table if not exists public.part_price_recommendations (
  id uuid primary key default gen_random_uuid(),
  part_id uuid references public.parts(id) on delete cascade,
  sample_size integer,
  low_price numeric,
  median_price numeric,
  average_price numeric,
  high_price numeric,
  recommended_price numeric,
  quick_sale_price numeric,
  maximum_margin_price numeric,
  confidence_score numeric,
  pricing_strategy text,
  search_query text,
  generated_at timestamptz default now()
);
