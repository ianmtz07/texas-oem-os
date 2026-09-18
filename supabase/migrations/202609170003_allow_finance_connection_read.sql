-- Allow Texas OEM OS frontend to read connection STATUS.
-- Sensitive Plaid credentials remain protected by column-level UI queries;
-- frontend should never request access_token.

create policy "Allow authenticated users to read finance bank connections"
on public.finance_bank_connections
for select
to authenticated
using (true);
