create table if not exists public.part_pieces (
  id uuid primary key default gen_random_uuid(),

  part_id uuid not null
    references public.parts(id)
    on delete cascade,

  piece_number integer not null
    check (piece_number >= 1),

  piece_name text,

  scan_code text not null unique,

  picked_at timestamptz,

  created_at timestamptz not null default now(),

  unique (part_id, piece_number)
);

create index if not exists part_pieces_part_id_idx
  on public.part_pieces(part_id);

create index if not exists part_pieces_scan_code_idx
  on public.part_pieces(scan_code);

alter table public.part_pieces enable row level security;

drop policy if exists "Allow authenticated users to read part pieces"
  on public.part_pieces;

create policy "Allow authenticated users to read part pieces"
  on public.part_pieces
  for select
  to authenticated
  using (true);

drop policy if exists "Allow authenticated users to insert part pieces"
  on public.part_pieces;

create policy "Allow authenticated users to insert part pieces"
  on public.part_pieces
  for insert
  to authenticated
  with check (true);

drop policy if exists "Allow authenticated users to update part pieces"
  on public.part_pieces;

create policy "Allow authenticated users to update part pieces"
  on public.part_pieces
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated users to delete part pieces"
  on public.part_pieces;

create policy "Allow authenticated users to delete part pieces"
  on public.part_pieces
  for delete
  to authenticated
  using (true);
