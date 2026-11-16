-- DIPO Lead Handover — initial schema.
--
-- Security model: every table has row-level security enabled and NO policies for
-- the `anon` / `authenticated` roles, so the public anon key cannot read or write
-- anything through PostgREST. All data access happens server-side (Next.js server
-- actions / route handlers) with the service-role key after the app has verified
-- the signed-in user against ALLOWED_EMAILS.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_reporting_region(value text)
returns boolean
language sql
immutable
as $$
  select value in ('JABODETABEK', 'JAWA BARAT', 'BANTEN', 'JAWA TIMUR', 'SUMATERA & KALIMANTAN')
$$;

-- Reporting month key ("YYYY-MM") of a report date.
create or replace function public.report_month_key(d date)
returns text
language sql
immutable
as $$
  select to_char(d, 'YYYY-MM')
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------------

create table public.dealers (
  id uuid primary key default gen_random_uuid(),
  dealer_name text not null check (length(btrim(dealer_name)) between 2 and 120),
  city text not null check (length(btrim(city)) between 2 and 120),
  province text check (province is null or length(btrim(province)) between 2 and 120),
  reporting_region text not null check (public.is_reporting_region(reporting_region)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index dealers_name_unique on public.dealers (lower(btrim(dealer_name)));
create index dealers_region_idx on public.dealers (reporting_region) where is_active;

create trigger dealers_set_updated_at
  before update on public.dealers
  for each row execute function public.set_updated_at();

create table public.whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  group_name text not null check (length(btrim(group_name)) between 2 and 120),
  dealer_id uuid references public.dealers (id) on delete restrict,
  reporting_region text not null check (public.is_reporting_region(reporting_region)),
  -- Official WhatsApp group invite links only. A group name is never a deep link.
  group_link text check (group_link is null or group_link ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]{10,40}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index whatsapp_groups_name_unique on public.whatsapp_groups (lower(btrim(group_name)));
create index whatsapp_groups_dealer_idx on public.whatsapp_groups (dealer_id);
create index whatsapp_groups_region_idx on public.whatsapp_groups (reporting_region) where is_active;

create trigger whatsapp_groups_set_updated_at
  before update on public.whatsapp_groups
  for each row execute function public.set_updated_at();

-- Learned location mappings: results resolved by Gemini (fallback) or confirmed
-- manually by the user. The built-in deterministic city/regency dataset lives in
-- the application code (src/lib/location/data.ts) and is always checked first.
create table public.region_mappings (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null unique check (length(normalized_name) between 1 and 200),
  city text,
  province text,
  -- NULL means the location is known but outside the five reporting regions.
  reporting_region text check (reporting_region is null or public.is_reporting_region(reporting_region)),
  source text not null check (source in ('ai', 'manual')),
  confidence text check (confidence is null or confidence in ('high', 'medium', 'low')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger region_mappings_set_updated_at
  before update on public.region_mappings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  -- Client-generated idempotency key: one form submission == at most one lead.
  submission_id uuid not null unique,
  name text not null check (length(btrim(name)) between 2 and 120),
  -- Normalised Indonesian number stored as text to keep the leading zero.
  phone text not null check (phone ~ '^0[1-9][0-9]{7,12}$'),
  domicile text not null check (length(btrim(domicile)) between 2 and 120),
  city text,
  province text,
  reporting_region text not null check (public.is_reporting_region(reporting_region)),
  classification_status text not null check (classification_status in ('mapped', 'ai', 'manual')),
  -- Prospect date entered manually (optional).
  lead_date date,
  -- Date that decides the reporting month: lead_date, else the submission date
  -- in Asia/Jakarta. Maintained by trigger, never written by the application.
  report_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dealer_id uuid not null references public.dealers (id) on delete restrict,
  unit text not null check (length(btrim(unit)) between 2 and 60),
  follow_up_date date,
  source text not null check (source in ('META', 'GOOGLE', 'TIKTOK'))
);

create index leads_report_date_idx on public.leads (report_date, created_at);
create index leads_created_at_idx on public.leads (created_at desc);
create index leads_phone_idx on public.leads (phone);
create index leads_region_report_date_idx on public.leads (reporting_region, report_date);
create index leads_dealer_idx on public.leads (dealer_id);
create index leads_source_report_date_idx on public.leads (source, report_date);

create or replace function public.leads_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := new.created_at;
  else
    -- created_at and the idempotency key are immutable.
    new.created_at := old.created_at;
    new.submission_id := old.submission_id;
    new.updated_at := now();
  end if;
  new.report_date := coalesce(new.lead_date, (new.created_at at time zone 'Asia/Jakarta')::date);
  return new;
end;
$$;

create trigger leads_before_write
  before insert or update on public.leads
  for each row execute function public.leads_before_write();

-- ---------------------------------------------------------------------------
-- Google Sheets synchronisation state
-- ---------------------------------------------------------------------------

-- One row per reporting month (= one spreadsheet tab). `revision` is bumped on
-- every lead change in that month; the tab is up to date when
-- synced_revision >= revision. lock_token/locked_until serialise rebuilds of a
-- month so concurrent submissions cannot overwrite each other with stale data.
create table public.sheet_months (
  month_key text primary key check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  sheet_id bigint,
  revision bigint not null default 0,
  synced_revision bigint not null default 0,
  last_attempt_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  lock_token uuid,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

-- Per-lead sync status. One row per lead (current state, not an append-only
-- history). change_seq increases on every lead change so a sync run only marks
-- a row successful if the row has not changed since the run read it.
create sequence public.spreadsheet_sync_change_seq;

create table public.spreadsheet_sync_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads (id) on delete cascade,
  spreadsheet_month text not null check (spreadsheet_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  sync_status text not null default 'pending' check (sync_status in ('pending', 'success', 'failed')),
  error_message text,
  retry_count integer not null default 0 check (retry_count >= 0),
  change_seq bigint not null default nextval('public.spreadsheet_sync_change_seq'),
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index spreadsheet_sync_logs_open_idx
  on public.spreadsheet_sync_logs (spreadsheet_month)
  where sync_status <> 'success';

create trigger spreadsheet_sync_logs_set_updated_at
  before update on public.spreadsheet_sync_logs
  for each row execute function public.set_updated_at();

create or replace function public.bump_sheet_month(p_month text)
returns void
language sql
as $$
  insert into public.sheet_months (month_key, revision)
  values (p_month, 1)
  on conflict (month_key) do update set revision = public.sheet_months.revision + 1;
$$;

-- Runs in the same transaction as the lead write, so a committed lead change
-- always has a matching dirty month and pending sync row.
create or replace function public.leads_after_write()
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
    insert into public.spreadsheet_sync_logs (lead_id, spreadsheet_month, sync_status, retry_count, error_message, synced_at)
    values (new.id, new_month, 'pending', 0, null, null)
    on conflict (lead_id) do update set
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

create trigger leads_after_write
  after insert or update or delete on public.leads
  for each row execute function public.leads_after_write();

create or replace function public.try_acquire_sheet_lock(p_month text, p_token uuid, p_ttl_seconds integer)
returns boolean
language plpgsql
as $$
declare
  acquired boolean;
begin
  insert into public.sheet_months (month_key) values (p_month) on conflict (month_key) do nothing;

  update public.sheet_months
     set lock_token = p_token,
         locked_until = now() + make_interval(secs => p_ttl_seconds)
   where month_key = p_month
     and (lock_token is null or locked_until < now() or lock_token = p_token)
  returning true into acquired;

  return coalesce(acquired, false);
end;
$$;

create or replace function public.release_sheet_lock(p_month text, p_token uuid)
returns void
language sql
as $$
  update public.sheet_months
     set lock_token = null, locked_until = null
   where month_key = p_month and lock_token = p_token;
$$;

-- Called after Google Sheets confirmed the rebuild of a month tab.
-- p_logs: [{"id": "<uuid>", "change_seq": <bigint>}, ...] read before the lead snapshot.
create or replace function public.complete_sheet_sync(
  p_month text,
  p_token uuid,
  p_revision bigint,
  p_sheet_id bigint,
  p_logs jsonb
)
returns void
language plpgsql
as $$
begin
  update public.sheet_months
     set synced_revision = greatest(synced_revision, p_revision),
         sheet_id = p_sheet_id,
         last_attempt_at = now(),
         last_synced_at = now(),
         last_error = null
   where month_key = p_month and lock_token = p_token;

  if not found then
    raise exception 'sheet lock for % is not held by this sync run', p_month;
  end if;

  update public.spreadsheet_sync_logs l
     set sync_status = 'success',
         error_message = null,
         synced_at = now()
    from jsonb_to_recordset(coalesce(p_logs, '[]'::jsonb)) as done(id uuid, change_seq bigint)
   where l.id = done.id
     and l.change_seq = done.change_seq
     and l.spreadsheet_month = p_month;
end;
$$;

-- Called when the Google Sheets write for a month failed.
create or replace function public.fail_sheet_sync(p_month text, p_error text)
returns void
language plpgsql
as $$
begin
  update public.sheet_months
     set last_attempt_at = now(),
         last_error = left(p_error, 2000)
   where month_key = p_month;

  update public.spreadsheet_sync_logs
     set sync_status = 'failed',
         error_message = left(p_error, 2000),
         retry_count = retry_count + 1
   where spreadsheet_month = p_month
     and sync_status <> 'success';
end;
$$;

-- ---------------------------------------------------------------------------
-- WhatsApp handover (manual sending only)
-- ---------------------------------------------------------------------------

-- One row per (lead, destination group). The message text is generated from the
-- lead on demand, so it is not stored. `sent_marked_at` is set only when the
-- user explicitly confirms that they sent the message themselves.
create table public.lead_handovers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  whatsapp_group_id uuid not null references public.whatsapp_groups (id) on delete restrict,
  copied_at timestamptz,
  opened_at timestamptz,
  sent_marked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lead_id, whatsapp_group_id)
);

create index lead_handovers_created_idx on public.lead_handovers (created_at desc);
create index lead_handovers_group_idx on public.lead_handovers (whatsapp_group_id);

-- ---------------------------------------------------------------------------
-- Row-level security & privileges
-- ---------------------------------------------------------------------------

alter table public.dealers enable row level security;
alter table public.whatsapp_groups enable row level security;
alter table public.region_mappings enable row level security;
alter table public.leads enable row level security;
alter table public.sheet_months enable row level security;
alter table public.spreadsheet_sync_logs enable row level security;
alter table public.lead_handovers enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
