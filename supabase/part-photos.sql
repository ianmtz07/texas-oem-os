create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('part-photos', 'part-photos', true)
on conflict (id) do update set public = excluded.public;

create table if not exists public.part_photos (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts(id) on delete cascade,
  storage_path text not null,
  public_url text,
  is_primary boolean default false,
  sort_order integer default 0,
  created_at timestamptz default now()
);

alter table public.part_photos enable row level security;

create policy if not exists "Allow all operations for single-operator app"
  on public.part_photos
  for all
  using (true)
  with check (true);

create policy if not exists "Allow public read access to part photos"
  on storage.objects
  for select
  using (bucket_id = 'part-photos');

create policy if not exists "Allow public uploads to part photos"
  on storage.objects
  for insert
  with check (bucket_id = 'part-photos');

create policy if not exists "Allow public updates to part photos"
  on storage.objects
  for update
  using (bucket_id = 'part-photos')
  with check (bucket_id = 'part-photos');

create policy if not exists "Allow public deletes to part photos"
  on storage.objects
  for delete
  using (bucket_id = 'part-photos');
