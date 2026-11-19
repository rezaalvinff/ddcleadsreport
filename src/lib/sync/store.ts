import { isReportingRegion, LEAD_SOURCES, type LeadSource } from "../constants";
import { monthRange } from "../dates";
import { dbError, type Db } from "../db/admin";
import type { SheetLead, SheetService } from "../sheets/layout";

export interface MonthState {
  revision: number;
  syncedRevision: number;
  sheetId: number | null;
}

export interface OpenSyncRow {
  id: string;
  changeSeq: number;
}

/**
 * Database operations of the sync engine. Each maps 1:1 to a query or SQL
 * function from the migration, which keeps the engine testable against a
 * plain PostgreSQL instance (tests/integration).
 */
export interface SyncStore {
  tryAcquireLock(monthKey: string, token: string, ttlSeconds: number): Promise<boolean>;
  releaseLock(monthKey: string, token: string): Promise<void>;
  getMonthState(monthKey: string): Promise<MonthState>;
  getOpenSyncRows(monthKey: string): Promise<OpenSyncRow[]>;
  loadMonthLeads(monthKey: string): Promise<SheetLead[]>;
  loadMonthServices(monthKey: string): Promise<SheetService[]>;
  completeSync(monthKey: string, token: string, revision: number, sheetId: number, rows: OpenSyncRow[]): Promise<void>;
  failSync(monthKey: string, error: string): Promise<void>;
  findDirtyMonths(): Promise<string[]>;
}

export function toSheetLead(row: {
  id: string;
  name: string;
  phone: string;
  domicile: string;
  unit: string;
  source: string;
  report_date: string;
  created_at: string;
  reporting_region: string;
  dealer_name: string | null;
}): SheetLead {
  if (!isReportingRegion(row.reporting_region) || !(LEAD_SOURCES as readonly string[]).includes(row.source)) {
    throw new Error(`Data prospek ${row.id} tidak valid untuk laporan.`);
  }
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    domicile: row.domicile,
    dealerName: row.dealer_name ?? "",
    unit: row.unit,
    source: row.source as LeadSource,
    reportDate: row.report_date,
    createdAt: row.created_at,
    region: row.reporting_region,
  };
}

export function toSheetService(row: {
  id: string;
  name: string;
  location: string;
  unit: string;
  source: string;
  final_note: string | null;
  report_date: string;
  created_at: string;
  dealer_name: string | null;
}): SheetService {
  if (!(LEAD_SOURCES as readonly string[]).includes(row.source)) {
    throw new Error(`Data service ${row.id} tidak valid untuk laporan.`);
  }
  return {
    id: row.id,
    dealerName: row.dealer_name ?? "",
    name: row.name,
    location: row.location,
    unit: row.unit,
    source: row.source as LeadSource,
    finalNote: row.final_note,
    reportDate: row.report_date,
    createdAt: row.created_at,
  };
}

const PAGE_SIZE = 1000;

export function createSupabaseSyncStore(db: Db): SyncStore {
  return {
    async tryAcquireLock(monthKey, token, ttlSeconds) {
      const { data, error } = await db.rpc("try_acquire_sheet_lock", { p_month: monthKey, p_token: token, p_ttl_seconds: ttlSeconds });
      if (error) throw dbError("Gagal mengambil lock sinkronisasi", error);
      return data === true;
    },
    async releaseLock(monthKey, token) {
      const { error } = await db.rpc("release_sheet_lock", { p_month: monthKey, p_token: token });
      if (error) throw dbError("Gagal melepas lock sinkronisasi", error);
    },
    async getMonthState(monthKey) {
      const { data, error } = await db
        .from("sheet_months")
        .select("revision, synced_revision, sheet_id")
        .eq("month_key", monthKey)
        .single();
      if (error) throw dbError("Gagal membaca status bulan", error);
      return { revision: Number(data.revision), syncedRevision: Number(data.synced_revision), sheetId: data.sheet_id === null ? null : Number(data.sheet_id) };
    },
    async getOpenSyncRows(monthKey) {
      const { data, error } = await db
        .from("spreadsheet_sync_logs")
        .select("id, change_seq")
        .eq("spreadsheet_month", monthKey)
        .neq("sync_status", "success");
      if (error) throw dbError("Gagal membaca status sinkronisasi", error);
      return data.map((r) => ({ id: r.id, changeSeq: Number(r.change_seq) }));
    },
    async loadMonthLeads(monthKey) {
      const { start, end } = monthRange(monthKey);
      const leads: SheetLead[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await db
          .from("leads")
          .select("id, name, phone, domicile, unit, source, report_date, created_at, reporting_region, dealer:dealers(dealer_name)")
          .gte("report_date", start)
          .lte("report_date", end)
          .order("report_date")
          .order("created_at")
          .order("id")
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw dbError("Gagal membaca prospek bulan ini", error);
        for (const row of data) leads.push(toSheetLead({ ...row, dealer_name: row.dealer?.dealer_name ?? null }));
        if (data.length < PAGE_SIZE) return leads;
      }
    },
    async loadMonthServices(monthKey) {
      const { start, end } = monthRange(monthKey);
      const { data, error } = await db
        .from("service_entries")
        .select("id, name, location, unit, source, final_note, report_date, created_at, dealer:dealers(dealer_name)")
        .gte("report_date", start)
        .lte("report_date", end)
        .order("report_date")
        .order("created_at")
        .order("id");
      if (error) throw dbError("Gagal membaca data service bulan ini", error);
      return data.map((row) => toSheetService({ ...row, dealer_name: row.dealer?.dealer_name ?? null }));
    },
    async completeSync(monthKey, token, revision, sheetId, rows) {
      const { error } = await db.rpc("complete_sheet_sync", {
        p_month: monthKey,
        p_token: token,
        p_revision: revision,
        p_sheet_id: sheetId,
        p_logs: rows.map((r) => ({ id: r.id, change_seq: r.changeSeq })),
      });
      if (error) throw dbError("Gagal mencatat hasil sinkronisasi", error);
    },
    async failSync(monthKey, message) {
      const { error } = await db.rpc("fail_sheet_sync", { p_month: monthKey, p_error: message });
      if (error) throw dbError("Gagal mencatat kegagalan sinkronisasi", error);
    },
    async findDirtyMonths() {
      const months = await db.from("sheet_months").select("month_key, revision, synced_revision");
      if (months.error) throw dbError("Gagal membaca status bulan", months.error);
      const open = await db.from("spreadsheet_sync_logs").select("spreadsheet_month").neq("sync_status", "success");
      if (open.error) throw dbError("Gagal membaca status sinkronisasi", open.error);
      const dirty = new Set(months.data.filter((m) => Number(m.revision) > Number(m.synced_revision)).map((m) => m.month_key));
      for (const row of open.data) dirty.add(row.spreadsheet_month);
      return [...dirty].sort();
    },
  };
}
