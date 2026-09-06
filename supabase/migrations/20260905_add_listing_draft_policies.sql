alter table public.listing_drafts
  add column if not exists returns_policy text,
  add column if not exists shipping_policy text,
  add column if not exists shipping_amount numeric(10,2),
  add column if not exists immediate_payment boolean;

alter table public.listing_drafts
  drop constraint if exists listing_drafts_returns_policy_check;

alter table public.listing_drafts
  add constraint listing_drafts_returns_policy_check
  check (
    returns_policy is null
    or returns_policy in ('RETURNS', 'NO_RETURNS')
  );

alter table public.listing_drafts
  drop constraint if exists listing_drafts_shipping_policy_check;

alter table public.listing_drafts
  add constraint listing_drafts_shipping_policy_check
  check (
    shipping_policy is null
    or shipping_policy in ('FREE', 'FLAT_RATE', 'FREIGHT')
  );

alter table public.listing_drafts
  drop constraint if exists listing_drafts_shipping_amount_check;

alter table public.listing_drafts
  add constraint listing_drafts_shipping_amount_check
  check (
    shipping_amount is null
    or shipping_amount >= 0
  );
