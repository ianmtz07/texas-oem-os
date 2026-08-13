create table if not exists public.vehicle_damage_profiles (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,

  damage_zones text[] not null default '{}',
  severity text not null default 'unknown',
  runs_and_drives boolean,
  drivetrain_tested boolean not null default false,

  owner_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vehicle_damage_profiles_severity_check
    check (severity in ('light', 'moderate', 'severe', 'unknown'))
);

create unique index if not exists vehicle_damage_profiles_vehicle_unique_idx
  on public.vehicle_damage_profiles(vehicle_id);


create table if not exists public.vehicle_recovery_reports (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,

  total_investment numeric(12,2) not null default 0,

  projected_30_day_recovery numeric(12,2) not null default 0,
  projected_total_recovery numeric(12,2) not null default 0,
  projected_30_day_recovery_percent numeric(8,2) not null default 0,

  priority_parts_count integer not null default 0,
  excluded_damage_parts_count integer not null default 0,

  recommendation text not null default 'INSUFFICIENT_DATA',
  confidence numeric(5,2) not null default 0,

  generated_at timestamptz not null default now(),

  constraint vehicle_recovery_reports_recommendation_check
    check (
      recommendation in (
        'BUY',
        'STRONG_BUY',
        'MARGINAL',
        'PASS',
        'INSUFFICIENT_DATA'
      )
    )
);

create index if not exists vehicle_recovery_reports_vehicle_idx
  on public.vehicle_recovery_reports(vehicle_id);


create table if not exists public.vehicle_recovery_parts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.vehicle_recovery_reports(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,

  part_name text not null,
  oem_part_number text,
  interchange_number text,

  damage_zone text,
  survival_probability numeric(5,2) not null default 100,
  excluded_by_damage boolean not null default false,
  exclusion_reason text,

  sold_90_day_count integer not null default 0,
  active_listing_count integer not null default 0,

  recommended_price numeric(12,2),
  projected_30_day_revenue numeric(12,2),

  estimated_days_to_sell integer,
  demand_score numeric(5,2) not null default 0,
  confidence numeric(5,2) not null default 0,

  recommendation text not null default 'REVIEW',

  created_at timestamptz not null default now(),

  constraint vehicle_recovery_parts_recommendation_check
    check (
      recommendation in (
        'PULL_FIRST',
        'PULL',
        'LOW_PRIORITY',
        'SKIP',
        'REVIEW'
      )
    )
);


alter table public.vehicle_damage_profiles enable row level security;
alter table public.vehicle_recovery_reports enable row level security;
alter table public.vehicle_recovery_parts enable row level security;

drop policy if exists "Allow all vehicle damage profile access"
  on public.vehicle_damage_profiles;

create policy "Allow all vehicle damage profile access"
  on public.vehicle_damage_profiles
  for all
  using (true)
  with check (true);


drop policy if exists "Allow all vehicle recovery report access"
  on public.vehicle_recovery_reports;

create policy "Allow all vehicle recovery report access"
  on public.vehicle_recovery_reports
  for all
  using (true)
  with check (true);


drop policy if exists "Allow all vehicle recovery part access"
  on public.vehicle_recovery_parts;

create policy "Allow all vehicle recovery part access"
  on public.vehicle_recovery_parts
  for all
  using (true)
  with check (true);
