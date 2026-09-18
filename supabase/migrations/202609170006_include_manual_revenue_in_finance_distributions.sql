-- Texas OEM Finance V2
-- Include Revenue Center manual/local revenue in permanent cash distributions.
--
-- Rules:
--   1. Eligible paid eBay orders are snapshotted exactly as before.
--   2. Eligible positive manual revenue is snapshotted separately.
--   3. Neither an eBay order nor manual revenue entry may be distributed twice.
--   4. Tithe is 10% of COMBINED gross revenue, first.
--   5. eBay fees and seller shipping are deducted from distributable cash.
--   6. Manual revenue currently has no separate fee/shipping fields, so its
--      recorded amount enters gross with no additional direct-cost deduction.
--   7. A distribution may close with eBay revenue, manual revenue, or both.

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

  v_ebay_gross numeric(14,2) := 0;
  v_manual_gross numeric(14,2) := 0;
  v_gross numeric(14,2) := 0;

  v_ebay_fees numeric(14,2) := 0;
  v_seller_shipping numeric(14,2) := 0;

  v_tithe numeric(14,2) := 0;
  v_distributable numeric(14,2) := 0;

  v_order_count integer := 0;
  v_manual_count integer := 0;
begin

  if p_period_end < p_period_start then
    raise exception 'period_end cannot be before period_start';
  end if;


  -- Create the distribution period first as DRAFT.
  -- If anything below fails, the entire function transaction rolls back.
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


  -- ============================================================
  -- EBAY REVENUE SNAPSHOT
  -- ============================================================

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

    and upper(coalesce(f.payment_status, '')) = 'PAID'

    and upper(coalesce(f.cancel_state, '')) not in (
      'CANCELLED',
      'CANCELED'
    )

    and not exists (
      select 1
      from public.finance_distribution_orders d
      where d.order_id = f.order_id
    );


  get diagnostics v_order_count = row_count;


  -- ============================================================
  -- MANUAL / LOCAL REVENUE SNAPSHOT
  -- ============================================================
  --
  -- UNIQUE(revenue_stream_id) on finance_distribution_manual_revenue
  -- is the final database-level protection against distributing the
  -- same local/manual revenue entry twice.

  insert into public.finance_distribution_manual_revenue (
    distribution_period_id,
    revenue_stream_id,
    vehicle_id,
    source,
    amount,
    notes,
    revenue_created_at
  )
  select
    v_period_id,
    r.id,
    r.vehicle_id,
    r.source,
    round(r.amount, 2),
    r.notes,
    r.created_at
  from public.revenue_streams r
  where
    r.created_at >= p_period_start
    and r.created_at <= p_period_end

    -- Only positive revenue belongs in a cash distribution.
    and coalesce(r.amount, 0) > 0

    -- Never distribute the same manual revenue entry twice.
    and not exists (
      select 1
      from public.finance_distribution_manual_revenue d
      where d.revenue_stream_id = r.id
    );


  get diagnostics v_manual_count = row_count;


  -- A period is valid if EITHER source produced undistributed revenue.
  if v_order_count = 0 and v_manual_count = 0 then
    raise exception
      'No undistributed eBay or manual revenue found for this period';
  end if;


  -- ============================================================
  -- CALCULATE FROM PERMANENT SNAPSHOTS
  -- ============================================================

  select
    round(coalesce(sum(gross_revenue), 0), 2),
    round(coalesce(sum(ebay_fees), 0), 2),
    round(coalesce(sum(seller_shipping), 0), 2)
  into
    v_ebay_gross,
    v_ebay_fees,
    v_seller_shipping
  from public.finance_distribution_orders
  where distribution_period_id = v_period_id;


  select
    round(coalesce(sum(amount), 0), 2)
  into
    v_manual_gross
  from public.finance_distribution_manual_revenue
  where distribution_period_id = v_period_id;


  v_gross := round(
    coalesce(v_ebay_gross, 0)
    + coalesce(v_manual_gross, 0),
    2
  );


  -- Texas OEM rule:
  -- Tithe comes FIRST from all eligible gross business revenue.
  v_tithe := round(v_gross * 0.10, 2);


  -- Manual/local revenue has no separate direct-cost fields today.
  -- eBay direct transaction costs remain deducted exactly as before.
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


  -- ============================================================
  -- PERMANENT CASH BUCKET ALLOCATIONS
  -- ============================================================

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
      v_distributable
        - round(v_distributable * 0.35, 2)
        - round(v_distributable * 0.15, 2)
        - round(v_distributable * 0.15, 2)
        - round(v_distributable * 0.10, 2)
        - round(v_distributable * 0.05, 2)
    );


  -- Close only after BOTH source snapshots and all allocations succeed.
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


comment on function public.close_finance_distribution(
  timestamptz,
  timestamptz
) is
  'Closes a permanent Texas OEM cash distribution using undistributed paid eBay orders plus undistributed positive manual Revenue Center entries. Tithe is calculated first from combined gross revenue.';
