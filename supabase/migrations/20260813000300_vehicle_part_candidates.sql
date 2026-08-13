create table if not exists public.vehicle_part_candidates (
  id uuid primary key default gen_random_uuid(),

  vehicle_id uuid
    references public.vehicles(id)
    on delete cascade,

  vin text,
  year integer,
  make text,
  model text,
  trim text,

  part_family_code text not null,
  part_name text not null,

  oem_part_number text,
  interchange_number text,

  source_type text not null default 'market',
  source_name text,
  source_reference text,

  evidence_count integer not null default 0,
  confidence numeric(5,2) not null default 0,

  status text not null default 'pending',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vehicle_part_candidates_status_check
    check (
      status in (
        'pending',
        'verified',
        'rejected',
        'unresolved'
      )
    )
);

create index if not exists vehicle_part_candidates_vehicle_idx
  on public.vehicle_part_candidates(vehicle_id);

create index if not exists vehicle_part_candidates_vin_idx
  on public.vehicle_part_candidates(vin);

create index if not exists vehicle_part_candidates_family_idx
  on public.vehicle_part_candidates(part_family_code);

create index if not exists vehicle_part_candidates_oem_idx
  on public.vehicle_part_candidates(oem_part_number);

alter table public.vehicle_part_candidates
  enable row level security;

drop policy if exists
  "Allow all vehicle part candidate access"
  on public.vehicle_part_candidates;

create policy
  "Allow all vehicle part candidate access"
  on public.vehicle_part_candidates
  for all
  using (true)
  with check (true);
