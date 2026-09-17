-- Texas OEM Finance V2
-- Browser read access for Finance bank data.
--
-- RLS remains ENABLED.
-- The OS may read bank accounts, transactions, and classification rules.
-- Transaction approval remains controlled through Finance RPC functions.

create policy "Finance bank accounts readable"
on public.finance_bank_accounts
for select
to anon, authenticated
using (true);


create policy "Finance bank transactions readable"
on public.finance_bank_transactions
for select
to anon, authenticated
using (true);


create policy "Finance transaction rules readable"
on public.finance_transaction_rules
for select
to anon, authenticated
using (true);


-- Remove direct browser mutations.
-- Finance writes should occur through controlled backend/RPC paths.

revoke insert, update, delete, truncate
on public.finance_bank_accounts
from anon, authenticated;

revoke insert, update, delete, truncate
on public.finance_bank_transactions
from anon, authenticated;

revoke insert, update, delete, truncate
on public.finance_transaction_rules
from anon, authenticated;


comment on policy "Finance bank transactions readable"
on public.finance_bank_transactions is
  'Allows Texas OEM OS browser clients to read imported bank transactions while RLS remains enabled.';
