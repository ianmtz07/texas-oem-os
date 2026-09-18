-- Texas OEM Finance V2
-- Separate transaction meaning from cash-bucket assignment.
--
-- A bank transaction can represent real cash movement without being
-- operating revenue or an operating expense.
--
-- Examples:
--   REVENUE          = customer/sales money
--   EXPENSE          = business spending
--   OPENING_CAPITAL  = existing business money deposited into the new account
--   INTERNAL_TRANSFER = money moved between Texas OEM accounts
--   ASSET_SALE       = proceeds from selling a business asset
--   OWNER_CONTRIBUTION = new owner money contributed to the business
--   OTHER            = legitimate activity requiring special treatment
--
-- revenue_eligible controls whether a transaction may ever be treated
-- as revenue by Finance calculations.
--
-- tithe_eligible controls whether Finance may ever calculate tithe from it.
--
-- The $4,000 initial Relay funding should be OPENING_CAPITAL with both false.

alter table public.finance_bank_transactions
  add column if not exists transaction_type text;

alter table public.finance_bank_transactions
  add column if not exists revenue_eligible boolean not null default false;

alter table public.finance_bank_transactions
  add column if not exists tithe_eligible boolean not null default false;


alter table public.finance_bank_transactions
  drop constraint if exists finance_bank_transactions_transaction_type;

alter table public.finance_bank_transactions
  add constraint finance_bank_transactions_transaction_type
  check (
    transaction_type is null
    or transaction_type in (
      'REVENUE',
      'EXPENSE',
      'OPENING_CAPITAL',
      'INTERNAL_TRANSFER',
      'ASSET_SALE',
      'OWNER_CONTRIBUTION',
      'OTHER'
    )
  );


create index if not exists
  finance_bank_transactions_type_idx
on public.finance_bank_transactions (
  transaction_type,
  transaction_date desc
);


comment on column public.finance_bank_transactions.transaction_type is
  'Economic meaning of the bank transaction, separate from Texas OEM cash bucket assignment.';

comment on column public.finance_bank_transactions.revenue_eligible is
  'True only when this bank transaction is eligible to be counted as Texas OEM revenue.';

comment on column public.finance_bank_transactions.tithe_eligible is
  'True only when this bank transaction is eligible for Texas OEM tithe calculations.';


create or replace function public.mark_finance_bank_transaction_nonrevenue(
  p_transaction_id bigint,
  p_transaction_type text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin

  if p_transaction_type not in (
    'OPENING_CAPITAL',
    'INTERNAL_TRANSFER',
    'ASSET_SALE',
    'OWNER_CONTRIBUTION',
    'OTHER'
  ) then
    raise exception
      'Invalid non-revenue transaction type: %',
      p_transaction_type;
  end if;


  if not exists (
    select 1
    from public.finance_bank_transactions
    where id = p_transaction_id
  ) then
    raise exception
      'Finance bank transaction % not found',
      p_transaction_id;
  end if;


  update public.finance_bank_transactions
  set
    transaction_type = p_transaction_type,
    revenue_eligible = false,
    tithe_eligible = false,
    bucket_code = null,
    assignment_source = 'MANUAL',
    assignment_confidence = 1.0000,
    review_status = 'APPROVED',
    notes = case
      when p_notes is not null and trim(p_notes) <> ''
        then p_notes
      else notes
    end,
    updated_at = now()
  where id = p_transaction_id;

end;
$$;


comment on function public.mark_finance_bank_transaction_nonrevenue(
  bigint,
  text,
  text
) is
  'Marks legitimate Texas OEM cash movement as non-revenue and non-titheable while preserving it in the bank ledger.';
