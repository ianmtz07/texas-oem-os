drop policy if exists "Allow authenticated users to read part pieces"
  on public.part_pieces;

drop policy if exists "Allow authenticated users to insert part pieces"
  on public.part_pieces;

drop policy if exists "Allow authenticated users to update part pieces"
  on public.part_pieces;

drop policy if exists "Allow authenticated users to delete part pieces"
  on public.part_pieces;

drop policy if exists "Allow app access to part pieces"
  on public.part_pieces;

create policy "Allow app access to part pieces"
  on public.part_pieces
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant select, insert, update, delete
  on public.part_pieces
  to anon, authenticated;
