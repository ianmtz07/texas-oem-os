create table if not exists public.finance_settings (
  id text primary key default 'default'
    check (id = 'default'),

  tax_percent numeric(5,2) not null default 0
    check (tax_percent >= 0 and tax_percent <= 100),

  donor_percent numeric(5,2) not null default 0
    check (donor_percent >= 0 and donor_percent <= 100),

  operating_percent numeric(5,2) not null default 0
    check (operating_percent >= 0 and operating_percent <= 100),

  reserve_percent numeric(5,2) not null default 0
    check (reserve_percent >= 0 and reserve_percent <= 100),

  owner_draw_percent numeric(5,2) not null default 0
    check (owner_draw_percent >= 0 and owner_draw_percent <= 100),

  updated_at timestamptz not null default now()
);

alter table public.finance_settings enable row level security;

drop policy if exists "Allow finance settings reads"
  on public.finance_settings;

drop policy if exists "Allow finance settings inserts"
  on public.finance_settings;

drop policy if exists "Allow finance settings updates"
  on public.finance_settings;

create policy "Allow finance settings reads"
  on public.finance_settings
  for select
  to anon, authenticated
  using (true);

create policy "Allow finance settings inserts"
  on public.finance_settings
  for insert
  to anon, authenticated
  with check (true);

create policy "Allow finance settings updates"
  on public.finance_settings
  for update
  to anon, authenticated
  using (true)
  with check (true);

insert into public.finance_settings (id)
values ('default')
on conflict (id) do nothing;
