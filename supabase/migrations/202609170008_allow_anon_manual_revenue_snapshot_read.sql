-- Texas OEM Finance V2
-- Texas OEM OS currently accesses Supabase through the anon role.
-- Allow the frontend to READ permanent manual revenue snapshots so
-- already-distributed Revenue Center entries are excluded.
--
-- No insert/update/delete access is granted here.

create policy "Allow anon users to read manual revenue distribution snapshots"
on public.finance_distribution_manual_revenue
for select
to anon
using (true);
