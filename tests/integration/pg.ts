import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { userInfo } from "node:os";
import path from "node:path";
import pg from "pg";
import { monthRange } from "@/lib/dates";
import { toSheetLead, toSheetService, type SyncStore } from "@/lib/sync/store";

/**
 * Creates a throwaway database on a local PostgreSQL server, applies a minimal
 * Supabase role setup plus every migration, and returns a pool whose sessions
 * run as `service_role` — the role the app uses through PostgREST.
 *
 * TEST_DATABASE_URL defaults to the local socket as the current OS user.
 */
const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? `postgresql:///postgres?host=/var/run/postgresql&user=${encodeURIComponent(userInfo().username)}`;

const SUPABASE_ROLES = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end
$$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export interface TestDatabase {
  /** Sessions run as service_role. */
  pool: pg.Pool;
  /** Superuser connection for privilege tests. */
  admin: pg.Client;
  close(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `dipo_test_${randomBytes(4).toString("hex")}`;
  const server = new pg.Client({ connectionString: ADMIN_URL });
  await server.connect();
  await server.query(`create database ${name}`);
  await server.end();

  const u = new URL(ADMIN_URL.replace("postgresql:///", "postgresql://__local__/"));
  u.pathname = `/${name}`;
  const connectionString = u.toString().replace("postgresql://__local__/", "postgresql:///");

  const admin = new pg.Client({ connectionString });
  await admin.connect();
  await admin.query(SUPABASE_ROLES);
  const dir = path.resolve(import.meta.dirname, "../../supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await admin.query(readFileSync(path.join(dir, file), "utf8"));
  }

  const pool = new pg.Pool({ connectionString, max: 12, options: "-c role=service_role" });

  return {
    pool,
    admin,
    async close() {
      await pool.end();
      await admin.end();
      const s = new pg.Client({ connectionString: ADMIN_URL });
      await s.connect();
      await s.query(`drop database if exists ${name} with (force)`);
      await s.end();
    },
  };
}

/** SQL mirror of createSupabaseSyncStore — same tables, same functions. */
export function createPgSyncStore(pool: pg.Pool): SyncStore {
  return {
    async tryAcquireLock(monthKey, token, ttl) {
      const r = await pool.query("select public.try_acquire_sheet_lock($1, $2, $3) as ok", [monthKey, token, ttl]);
      return r.rows[0].ok === true;
    },
    async releaseLock(monthKey, token) {
      await pool.query("select public.release_sheet_lock($1, $2)", [monthKey, token]);
    },
    async getMonthState(monthKey) {
      const r = await pool.query("select revision, synced_revision, sheet_id from public.sheet_months where month_key = $1", [monthKey]);
      if (r.rowCount !== 1) throw new Error(`month ${monthKey} missing`);
      const row = r.rows[0];
      return { revision: Number(row.revision), syncedRevision: Number(row.synced_revision), sheetId: row.sheet_id === null ? null : Number(row.sheet_id) };
    },
    async getOpenSyncRows(monthKey) {
      const r = await pool.query(
        "select id, change_seq from public.spreadsheet_sync_logs where spreadsheet_month = $1 and sync_status <> 'success'",
        [monthKey],
      );
      return r.rows.map((row) => ({ id: row.id, changeSeq: Number(row.change_seq) }));
    },
    async loadMonthLeads(monthKey) {
      const { start, end } = monthRange(monthKey);
      const r = await pool.query(
        `select l.id, l.name, l.phone, l.domicile, l.unit, l.source,
                to_char(l.report_date, 'YYYY-MM-DD') as report_date, to_char(l.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
                l.reporting_region, d.dealer_name
           from public.leads l join public.dealers d on d.id = l.dealer_id
          where l.report_date between $1 and $2
          order by l.report_date, l.created_at, l.id`,
        [start, end],
      );
      return r.rows.map(toSheetLead);
    },
    async loadMonthServices(monthKey) {
      const { start, end } = monthRange(monthKey);
      const r = await pool.query(
        `select s.id, s.name, s.location, s.unit, s.source, s.final_note,
                to_char(s.report_date, 'YYYY-MM-DD') as report_date,
                to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
                d.dealer_name
           from public.service_entries s join public.dealers d on d.id = s.dealer_id
          where s.report_date between $1 and $2
          order by s.report_date, s.created_at, s.id`,
        [start, end],
      );
      return r.rows.map(toSheetService);
    },
    async completeSync(monthKey, token, revision, sheetId, rows) {
      await pool.query("select public.complete_sheet_sync($1, $2, $3, $4, $5::jsonb)", [
        monthKey,
        token,
        revision,
        sheetId,
        JSON.stringify(rows.map((r) => ({ id: r.id, change_seq: r.changeSeq }))),
      ]);
    },
    async failSync(monthKey, message) {
      await pool.query("select public.fail_sheet_sync($1, $2)", [monthKey, message]);
    },
    async findDirtyMonths() {
      const r = await pool.query(
        `select month_key from public.sheet_months where revision > synced_revision
         union select spreadsheet_month from public.spreadsheet_sync_logs where sync_status <> 'success'
         order by 1`,
      );
      return r.rows.map((row) => row.month_key);
    },
  };
}
