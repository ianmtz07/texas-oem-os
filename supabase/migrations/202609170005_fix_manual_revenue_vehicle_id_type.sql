-- Texas OEM Finance V2
-- Correct manual revenue snapshot donor linkage.
--
-- revenue_streams.vehicle_id is UUID, so the permanent Finance snapshot
-- must use the same type.

alter table public.finance_distribution_manual_revenue
  alter column vehicle_id type uuid
  using vehicle_id::text::uuid;

alter table public.finance_distribution_manual_revenue
  add constraint finance_distribution_manual_revenue_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles(id)
  on delete restrict;

create index if not exists
  finance_distribution_manual_revenue_vehicle_idx
on public.finance_distribution_manual_revenue (
  vehicle_id
);

comment on column public.finance_distribution_manual_revenue.vehicle_id is
  'Donor vehicle linked to the original manual revenue entry at distribution close time.';
