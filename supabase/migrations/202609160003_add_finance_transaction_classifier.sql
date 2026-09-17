-- Texas OEM Finance V2
-- Bank transaction classification engine.
--
-- Rules:
--   1. Never overwrite APPROVED or IGNORED transactions.
--   2. Highest-priority matching rule wins.
--   3. Merchant rules check merchant_name.
--   4. Description rules check description.
--   5. Rule match = RULE assignment with 100% confidence.
--   6. No match = REVIEW queue.
--   7. Function is provider-independent.

create or replace function public.classify_finance_bank_transaction(
  p_transaction_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.finance_bank_transactions%rowtype;
  v_rule public.finance_transaction_rules%rowtype;
begin

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


  -- Once a human approves or ignores a transaction,
  -- automatic classification cannot silently change it.
  if v_transaction.review_status in ('APPROVED', 'IGNORED') then
    return;
  end if;


  select r.*
  into v_rule
  from public.finance_transaction_rules r
  where
    r.is_active = true
    and (
      (
        r.match_type = 'MERCHANT_CONTAINS'
        and coalesce(v_transaction.merchant_name, '')
          ilike '%' || r.match_value || '%'
      )
      or
      (
        r.match_type = 'DESCRIPTION_CONTAINS'
        and coalesce(v_transaction.description, '')
          ilike '%' || r.match_value || '%'
      )
    )
  order by
    r.priority desc,
    r.id asc
  limit 1;


  if found then

    update public.finance_bank_transactions
    set
      bucket_code = v_rule.bucket_code,
      assignment_source = 'RULE',
      assignment_confidence = 1.0000,
      review_status = 'APPROVED',
      updated_at = now()
    where id = p_transaction_id;

  else

    update public.finance_bank_transactions
    set
      bucket_code = null,
      assignment_source = null,
      assignment_confidence = null,
      review_status = 'REVIEW',
      updated_at = now()
    where id = p_transaction_id;

  end if;

end;
$$;


comment on function public.classify_finance_bank_transaction(bigint) is
  'Classifies one Texas OEM bank transaction using active merchant/description rules. Unmatched transactions are sent to Needs Review.';

