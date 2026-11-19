-- Service enquiries: the SERVICE block on the right of each monthly tab.
--
-- They are reported separately from sales prospects: one flat list per month,
-- no reporting region, no WhatsApp handover. The reporting month is decided the
-- same way as for a lead, so late entries land in their own month.

create table public.service_entries (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique,
  dealer_id uuid not null references public.dealers (id) on delete restrict,
  name text not null check (length(btrim(name)) between 2 and 160),
  location text not null check (length(btrim(location)) between 2 and 160),
  unit text not null check (length(btrim(unit)) between 2 and 80),
  source text not null check (source in ('META', 'GOOGLE', 'TIKTOK')),
  -- Free-text outcome, the FINAL column of the sheet.
  final_note text check (final_note is null or length(btrim(final_note)) between 1 and 500),
  entry_date date,
  report_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index service_entries_report_date_idx on public.service_entries (report_date, created_at);
create index service_entries_created_at_idx on public.service_entries (created_at desc);
create index service_entries_dealer_idx on public.service_entries (dealer_id);

create or replace function public.service_entries_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := new.created_at;
  else
    new.created_at := old.created_at;
    new.submission_id := old.submission_id;
    new.updated_at := now();
  end if;
  new.report_date := coalesce(new.entry_date, (new.created_at at time zone 'Asia/Jakarta')::date);
  return new;
end;
$$;

create trigger service_entries_before_write
  before insert or update on public.service_entries
  for each row execute function public.service_entries_before_write();

-- ---------------------------------------------------------------------------
-- Sync bookkeeping: one log row per lead OR per service entry
-- ---------------------------------------------------------------------------

alter table public.spreadsheet_sync_logs
  add column service_id uuid references public.service_entries (id) on delete cascade,
  alter column lead_id drop not null,
  add constraint spreadsheet_sync_logs_one_target check (num_nonnulls(lead_id, service_id) = 1);

create unique index spreadsheet_sync_logs_service_unique
  on public.spreadsheet_sync_logs (service_id)
  where service_id is not null;

create or replace function public.service_entries_after_write()
returns trigger
language plpgsql
as $$
declare
  new_month text;
  old_month text;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    new_month := public.report_month_key(new.report_date);
    perform public.bump_sheet_month(new_month);
    insert into public.spreadsheet_sync_logs (service_id, spreadsheet_month, sync_status, retry_count, error_message, synced_at)
    values (new.id, new_month, 'pending', 0, null, null)
    on conflict (service_id) where service_id is not null do update set
      spreadsheet_month = excluded.spreadsheet_month,
      sync_status = 'pending',
      retry_count = 0,
      error_message = null,
      synced_at = null,
      change_seq = nextval('public.spreadsheet_sync_change_seq');
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    old_month := public.report_month_key(old.report_date);
    if tg_op = 'DELETE' or old_month is distinct from new_month then
      perform public.bump_sheet_month(old_month);
    end if;
  end if;

  return null;
end;
$$;

create trigger service_entries_after_write
  after insert or update or delete on public.service_entries
  for each row execute function public.service_entries_after_write();

-- ---------------------------------------------------------------------------
-- Row-level security & privileges, matching every other table
-- ---------------------------------------------------------------------------

alter table public.service_entries enable row level security;

revoke all on public.service_entries from anon, authenticated;
grant all on public.service_entries to service_role;
