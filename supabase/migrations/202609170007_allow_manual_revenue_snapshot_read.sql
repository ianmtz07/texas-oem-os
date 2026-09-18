-- Texas OEM Finance V2
-- Frontend needs read-only access to manual revenue distribution snapshots
-- so it can identify which Revenue Center entries have already been
-- permanently distributed.
--
-- Writes remain controlled by close_finance_distribution().

create policy "Allow authenticated users to read manual revenue distribution snapshots"
on public.finance_distribution_manual_revenue
for select
to authenticated
using (true);
