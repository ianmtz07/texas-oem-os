create extension if not exists pgcrypto;

create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id),
  sku text unique not null,
  part_name text,
  part_number text,
  interchange text,
  category text,
  condition text,
  shelf_location text,
  quantity integer default 1,
  cost numeric default 0,
  list_price numeric default 0,
  sold_price numeric default 0,
  ebay_item_id text,
  listed boolean default false,
  sold boolean default false,
  photo_count integer default 0,
  barcode text,
  notes text,
  created_at timestamptz default now()
);

alter table public.parts add column if not exists vehicle_id uuid;
alter table public.parts add column if not exists sku text;
alter table public.parts add column if not exists part_name text;
alter table public.parts add column if not exists part_number text;
alter table public.parts add column if not exists interchange text;
alter table public.parts add column if not exists category text;
alter table public.parts add column if not exists condition text;
alter table public.parts add column if not exists shelf_location text;
alter table public.parts add column if not exists quantity integer default 1;
alter table public.parts add column if not exists cost numeric default 0;
alter table public.parts add column if not exists list_price numeric default 0;
alter table public.parts add column if not exists sold_price numeric default 0;
alter table public.parts add column if not exists ebay_item_id text;
alter table public.parts add column if not exists listed boolean default false;
alter table public.parts add column if not exists sold boolean default false;
alter table public.parts add column if not exists photo_count integer default 0;
alter table public.parts add column if not exists barcode text;
alter table public.parts add column if not exists notes text;
alter table public.parts add column if not exists created_at timestamptz default now();

alter table public.parts enable row level security;
