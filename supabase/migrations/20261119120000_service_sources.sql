-- Service enquiries only come from GOOGLE or META, which is what the SERVICE
-- half of the daily summary has columns for. Narrowing the constraint keeps a
-- TIKTOK row from existing and being left out of that count.
alter table public.service_entries drop constraint if exists service_entries_source_check;
alter table public.service_entries
  add constraint service_entries_source_check check (source in ('GOOGLE', 'META'));
