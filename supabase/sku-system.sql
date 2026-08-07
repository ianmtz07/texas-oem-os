create extension if not exists pgcrypto;

create table if not exists public.part_master (
  id uuid primary key default gen_random_uuid(),
  part_code text not null unique,
  part_name text not null,
  category text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.sku_history (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts(id) on delete cascade,
  old_sku text not null,
  new_sku text not null,
  changed_at timestamptz default now(),
  reason text not null
);

alter table public.parts add column if not exists sku_code text;
alter table public.parts add column if not exists barcode_data text;
alter table public.parts add column if not exists sku_preview text;

create or replace function public.next_part_sequence(p_vehicle_id uuid, p_part_code text)
returns integer
language plpgsql
as $$
declare
  v_sequence integer;
  v_vehicle_stock text;
begin
  select stock_number into v_vehicle_stock from public.vehicles where id = p_vehicle_id;

  select coalesce(max(cast(split_part(sku, '-', 3) as integer)), 0) + 1
  into v_sequence
  from public.parts
  where vehicle_id = p_vehicle_id
    and upper(coalesce(sku_code, '')) = upper(p_part_code);

  return v_sequence;
end;
$$;

create or replace function public.generate_part_sku(p_vehicle_id uuid, p_part_code text)
returns text
language plpgsql
as $$
declare
  v_vehicle_stock text;
  v_sequence integer;
  v_sku text;
begin
  select stock_number into v_vehicle_stock from public.vehicles where id = p_vehicle_id;
  select public.next_part_sequence(p_vehicle_id, p_part_code) into v_sequence;
  v_sku := format('%s-%s-%03s', upper(v_vehicle_stock), upper(p_part_code), v_sequence);
  return v_sku;
end;
$$;

create or replace function public.repair_sku(p_part_id uuid, p_new_sku text, p_reason text)
returns text
language plpgsql
as $$
declare
  v_old_sku text;
  v_exists integer;
begin
  select sku into v_old_sku from public.parts where id = p_part_id;
  select count(*) into v_exists from public.parts where sku = p_new_sku and id <> p_part_id;

  if v_exists > 0 then
    raise exception 'SKU already exists';
  end if;

  insert into public.sku_history (part_id, old_sku, new_sku, reason)
  values (p_part_id, v_old_sku, p_new_sku, p_reason);

  update public.parts
  set sku = p_new_sku,
      sku_code = upper(split_part(p_new_sku, '-', 2)),
      sku_preview = p_new_sku
  where id = p_part_id;

  return p_new_sku;
end;
$$;

alter table public.part_master enable row level security;
alter table public.sku_history enable row level security;

create policy if not exists "Allow all operations for part master" on public.part_master for all using (true) with check (true);
create policy if not exists "Allow all operations for sku history" on public.sku_history for all using (true) with check (true);
