create table if not exists public.interchange_candidates (
  id uuid primary key default gen_random_uuid(),
  source_part_number text not null,
  candidate_part_number text not null,
  source_type text not null default 'market',
  source_name text,
  source_reference text,
  confidence numeric(5,2) not null default 0,
  evidence_count integer not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint interchange_candidates_no_self_match
    check (source_part_number <> candidate_part_number),

  constraint interchange_candidates_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists interchange_candidates_source_part_number_idx
  on public.interchange_candidates (source_part_number);

create index if not exists interchange_candidates_candidate_part_number_idx
  on public.interchange_candidates (candidate_part_number);

create index if not exists interchange_candidates_status_idx
  on public.interchange_candidates (status);


create table if not exists public.verified_interchanges (
  id uuid primary key default gen_random_uuid(),
  part_number_a text not null,
  part_number_b text not null,
  approved_by text not null default 'owner',
  approved_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),

  constraint verified_interchanges_no_self_match
    check (part_number_a <> part_number_b)
);

create unique index if not exists verified_interchanges_unique_pair_idx
  on public.verified_interchanges (
    least(part_number_a, part_number_b),
    greatest(part_number_a, part_number_b)
  );

create index if not exists verified_interchanges_part_number_a_idx
  on public.verified_interchanges (part_number_a);

create index if not exists verified_interchanges_part_number_b_idx
  on public.verified_interchanges (part_number_b);


alter table public.interchange_candidates enable row level security;
alter table public.verified_interchanges enable row level security;

drop policy if exists "Allow all interchange candidate access" on public.interchange_candidates;
create policy "Allow all interchange candidate access"
  on public.interchange_candidates
  for all
  using (true)
  with check (true);

drop policy if exists "Allow all verified interchange access" on public.verified_interchanges;
create policy "Allow all verified interchange access"
  on public.verified_interchanges
  for all
  using (true)
  with check (true);
