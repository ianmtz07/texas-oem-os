create table if not exists public.listing_drafts (
  part_id uuid primary key references public.parts(id) on delete cascade,

  title text not null default '',
  condition_description text not null default '',
  description text not null default '',
  description_html text not null default '',

  category_suggestion text not null default '',
  item_specifics jsonb not null default '{}'::jsonb,
  compatibility_notes text not null default '',
  pricing_status text not null default 'Pending',
  draft_status text not null default 'Draft',

  ebay_offer_id text,
  ebay_category_id text,
  ebay_category_name text,
  ebay_draft_created_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_drafts_ebay_offer_id_idx
  on public.listing_drafts (ebay_offer_id);

create index if not exists listing_drafts_draft_status_idx
  on public.listing_drafts (draft_status);

alter table public.listing_drafts enable row level security;

drop policy if exists "Allow listing draft reads"
  on public.listing_drafts;

drop policy if exists "Allow listing draft inserts"
  on public.listing_drafts;

drop policy if exists "Allow listing draft updates"
  on public.listing_drafts;

create policy "Allow listing draft reads"
  on public.listing_drafts
  for select
  to anon, authenticated
  using (true);

create policy "Allow listing draft inserts"
  on public.listing_drafts
  for insert
  to anon, authenticated
  with check (true);

create policy "Allow listing draft updates"
  on public.listing_drafts
  for update
  to anon, authenticated
  using (true)
  with check (true);
