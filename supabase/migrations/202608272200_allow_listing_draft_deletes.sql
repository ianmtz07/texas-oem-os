drop policy if exists "Allow listing draft deletes"
  on public.listing_drafts;

create policy "Allow listing draft deletes"
  on public.listing_drafts
  for delete
  to anon, authenticated
  using (true);
