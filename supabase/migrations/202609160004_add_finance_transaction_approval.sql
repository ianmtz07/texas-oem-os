-- Texas OEM Finance V2
-- Manual transaction approval + merchant learning.
--
-- Allows the Finance review screen to:
--   1. Assign a Needs Review transaction to a bucket.
--   2. Mark that transaction APPROVED.
--   3. Optionally remember the merchant for future transactions.
--
-- Everything happens atomically.

create or replace function public.approve_finance_bank_transaction(
  p_transaction_id bigint,
  p_bucket_code text,
  p_remember_merchant boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.finance_bank_transactions%rowtype;
  v_merchant text;
begin

  -- Validate the Texas OEM bucket.
  if p_bucket_code not in (
    'DONOR_INVENTORY',
    'OPERATING',
    'BUSINESS_RESERVE',
    'TAX_RESERVE',
    'TOOLS_EQUIPMENT',
    'OWNER_DRAW'
  ) then
    raise exception
      'Invalid Texas OEM finance bucket: %',
      p_bucket_code;
  end if;


  select *
  into v_transaction
  from public.finance_bank_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception
      'Finance bank transaction % not found',
      p_transaction_id;
  end if;


  if v_transaction.review_status = 'IGNORED' then
    raise exception
      'Ignored transaction % cannot be approved',
      p_transaction_id;
  end if;


  -- Human decision wins.
  update public.finance_bank_transactions
  set
    bucket_code = p_bucket_code,
    assignment_source = 'MANUAL',
    assignment_confidence = 1.0000,
    review_status = 'APPROVED',
    updated_at = now()
  where id = p_transaction_id;


  -- Optionally teach Texas OEM OS this merchant.
  if p_remember_merchant then

    v_merchant :=
      upper(trim(coalesce(v_transaction.merchant_name, '')));

    if v_merchant = '' then
      raise exception
        'Cannot remember merchant because transaction % has no merchant name',
        p_transaction_id;
    end if;


    insert into public.finance_transaction_rules (
      rule_name,
      match_type,
      match_value,
      bucket_code,
      priority,
      is_active
    )
    values (
      v_merchant || ' learned rule',
      'MERCHANT_CONTAINS',
      v_merchant,
      p_bucket_code,
      175,
      true
    )
    on conflict (match_type, match_value)
    do update
    set
      bucket_code = excluded.bucket_code,
      priority = excluded.priority,
      is_active = true,
      updated_at = now();

  end if;

end;
$$;


comment on function public.approve_finance_bank_transaction(
  bigint,
  text,
  boolean
) is
  'Approves a Texas OEM bank transaction and optionally remembers its merchant for automatic future categorization.';

