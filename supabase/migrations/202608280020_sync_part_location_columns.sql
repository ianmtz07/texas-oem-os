update public.parts
set bin = shelf_location
where
  (bin is null or btrim(bin) = '')
  and shelf_location is not null
  and btrim(shelf_location) <> '';

update public.parts
set shelf_location = bin
where
  (shelf_location is null or btrim(shelf_location) = '')
  and bin is not null
  and btrim(bin) <> '';
