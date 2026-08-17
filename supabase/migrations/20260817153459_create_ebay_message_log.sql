create table if not exists public.ebay_buyer_messages (
  id uuid primary key default gen_random_uuid(),

  ebay_order_id text not null,
  ebay_item_id text not null,
  buyer_username text not null,

  message_type text not null,
  subject text,
  message_body text not null,

  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),

  is_freight boolean not null default false,
  freight_confirmation_status text
    check (
      freight_confirmation_status is null
      or freight_confirmation_status in (
        'not_required',
        'awaiting_confirmation',
        'commercial_confirmed',
        'terminal_confirmed'
      )
    ),

  ebay_ack text,
  error_message text,

  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists ebay_buyer_messages_order_type_unique
  on public.ebay_buyer_messages (ebay_order_id, message_type);

create index if not exists ebay_buyer_messages_status_idx
  on public.ebay_buyer_messages (status);

create index if not exists ebay_buyer_messages_buyer_idx
  on public.ebay_buyer_messages (buyer_username);

alter table public.ebay_buyer_messages enable row level security;

drop policy if exists "Allow authenticated read ebay buyer messages"
  on public.ebay_buyer_messages;

create policy "Allow authenticated read ebay buyer messages"
  on public.ebay_buyer_messages
  for select
  to authenticated
  using (true);
