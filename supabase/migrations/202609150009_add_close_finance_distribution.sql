-- Texas OEM Finance V2
-- Atomically closes a distribution period.
--
-- Rules:
--   1. Only previously undistributed eBay orders are eligible.
--   2. Order financials are permanently snapshotted.
--   3. Tithe = 10% of gross revenue FIRST.
--   4. eBay fees + actual seller-paid shipping are deducted.
--   5. Remaining distributable net is allocated:
--        Donor / Inventory Fund 35%
--        Operating             15%
--        Business Reserve      15%
--        Tax Reserve           10%
--        Tools & Equipment      5%
--        Owner Draw            20%
--   6. An eBay order can never be distributed twice.

create or replace function public.close_finance_distribution(
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_id bigint;

  v_gross numeric(14,2);
  v_ebay_fees numeric(14,2);
  v_seller_shipping numeric(14,2);

  v_tithe numeric(14,2);
  v_distributable numeric(14,2);

  v_order_count integer;
begin

  if p_period_end < p_period_start then
    raise exception 'period_end cannot be before period_start';
  end if;


  -- Create the period first as DRAFT.
  insert into public.finance_distribution_periods (
    period_start,
    period_end,
    status
  )
  values (
    p_period_start,
    p_period_end,
    'DRAFT'
  )
  returning id into v_period_id;


  -- Snapshot every eligible order.
  --
  -- The UNIQUE(order_id) constraint on finance_distribution_orders
  -- is the final database-level protection against double allocation.
  insert into public.finance_distribution_orders (
    distribution_period_id,
    order_id,
    gross_revenue,
    ebay_fees,
    ebay_shipping,
    manual_shipping,
    seller_shipping,
    actual_net
  )
  select
    v_period_id,
    f.order_id,
    f.gross_revenue,
    f.ebay_fees,
    f.ebay_shipping,
    f.manual_shipping,
    f.seller_shipping,
    f.actual_net
  from public.ebay_order_financials f
  where
    f.creation_date >= p_period_start
    and f.creation_date <= p_period_end

    -- Only paid orders.
    and upper(coalesce(f.payment_status, '')) = 'PAID'

    -- Do not allocate cancelled orders.
    and upper(coalesce(f.cancel_state, '')) not in (
      'CANCELLED',
      'CANCELED'
    )

    -- Never distribute the same order twice.
    and not exists (
      select 1
      from public.finance_distribution_orders d
      where d.order_id = f.order_id
    );


  get diagnostics v_order_count = row_count;

  if v_order_count = 0 then
    raise exception
      'No undistributed paid eBay orders found for this period';
  end if;


  -- Calculate totals from the SNAPSHOT, not the live eBay view.
  --
  -- This is critical: once closed, historical distributions must
  -- never move because eBay data later changes.
  select
    round(coalesce(sum(gross_revenue), 0), 2),
    round(coalesce(sum(ebay_fees), 0), 2),
    round(coalesce(sum(seller_shipping), 0), 2)
  into
    v_gross,
    v_ebay_fees,
    v_seller_shipping
  from public.finance_distribution_orders
  where distribution_period_id = v_period_id;


  -- Texas OEM rule:
  -- Tithe comes FIRST from gross revenue.
  v_tithe := round(v_gross * 0.10, 2);


  -- Everything else is allocated from actual distributable cash.
  v_distributable := round(
    v_gross
    - v_tithe
    - v_ebay_fees
    - v_seller_shipping,
    2
  );


  if v_distributable < 0 then
    raise exception
      'Distribution produced negative distributable net: %',
      v_distributable;
  end if;


  -- Permanent allocation snapshots.
  insert into public.finance_distribution_allocations (
    distribution_period_id,
    bucket_code,
    bucket_name,
    allocation_percent,
    allocated_amount
  )
  values
    (
      v_period_id,
      'DONOR_INVENTORY',
      'Donor / Inventory Fund',
      35,
      round(v_distributable * 0.35, 2)
    ),
    (
      v_period_id,
      'OPERATING',
      'Operating',
      15,
      round(v_distributable * 0.15, 2)
    ),
    (
      v_period_id,
      'BUSINESS_RESERVE',
      'Business Reserve',
      15,
      round(v_distributable * 0.15, 2)
    ),
    (
      v_period_id,
      'TAX_RESERVE',
      'Tax Reserve',
      10,
      round(v_distributable * 0.10, 2)
    ),
    (
      v_period_id,
      'TOOLS_EQUIPMENT',
      'Tools & Equipment',
      5,
      round(v_distributable * 0.05, 2)
    ),
    (
      v_period_id,
      'OWNER_DRAW',
      'Owner Draw',
      20,
      round(v_distributable * 0.20, 2)
    );


  -- Close only after every snapshot/allocation succeeds.
  update public.finance_distribution_periods
  set
    gross_revenue = v_gross,
    tithe_amount = v_tithe,
    ebay_fees = v_ebay_fees,
    seller_shipping = v_seller_shipping,
    distributable_net = v_distributable,
    status = 'CLOSED',
    closed_at = now(),
    updated_at = now()
  where id = v_period_id;


  return v_period_id;

end;
$$;
