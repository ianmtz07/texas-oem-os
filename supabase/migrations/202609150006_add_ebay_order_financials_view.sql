create or replace view public.ebay_order_financials as

with ebay_shipping as (
  select
    order_id,
    sum(
      case
        when booking_entry = 'DEBIT' then amount
        when booking_entry = 'CREDIT' then -amount
        else 0
      end
    ) as ebay_shipping_cost
  from public.ebay_finance_transactions
  where transaction_type = 'SHIPPING_LABEL'
  group by order_id
),

manual_shipping as (
  select
    order_id,
    sum(amount) as manual_shipping_cost
  from public.ebay_manual_shipping_costs
  group by order_id
)

select
  o.order_id,
  o.creation_date,
  o.last_modified_date,
  o.payment_status,
  o.fulfillment_status,
  o.cancel_state,

  o.price_subtotal as merchandise,

  o.delivery_cost as buyer_paid_shipping,

  (
    coalesce(o.price_subtotal, 0)
    + coalesce(o.delivery_cost, 0)
  )::numeric(14,2) as gross_revenue,

  coalesce(
    o.total_marketplace_fee,
    0
  )::numeric(14,2) as ebay_fees,

  coalesce(
    es.ebay_shipping_cost,
    0
  )::numeric(14,2) as ebay_shipping,

  coalesce(
    ms.manual_shipping_cost,
    0
  )::numeric(14,2) as manual_shipping,

  (
    coalesce(es.ebay_shipping_cost, 0)
    + coalesce(ms.manual_shipping_cost, 0)
  )::numeric(14,2) as seller_shipping,

  (
    coalesce(o.price_subtotal, 0)
    + coalesce(o.delivery_cost, 0)
    - coalesce(o.total_marketplace_fee, 0)
    - coalesce(es.ebay_shipping_cost, 0)
    - coalesce(ms.manual_shipping_cost, 0)
  )::numeric(14,2) as actual_net,

  o.total_due_seller,
  o.currency

from public.ebay_fulfillment_orders o

left join ebay_shipping es
  on es.order_id = o.order_id

left join manual_shipping ms
  on ms.order_id = o.order_id;
