create table if not exists public.listing_drafts (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts(id) on delete cascade,
  title text,
  condition_description text,
  description text,
  category_suggestion text,
  item_specifics jsonb,
  compatibility_notes text,
  pricing_status text default 'Pending eBay sold-data access',
  draft_status text default 'Draft',
  generated_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.listing_draft_history (
  id uuid primary key default gen_random_uuid(),
  listing_draft_id uuid references public.listing_drafts(id) on delete cascade,
  title text,
  condition_description text,
  description text,
  item_specifics jsonb,
  changed_at timestamptz default now(),
  change_reason text
);
