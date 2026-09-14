alter table public.part_photos
  add column if not exists original_storage_path text,
  add column if not exists original_public_url text,
  add column if not exists enhancement_applied boolean,
  add column if not exists processing_version text;
