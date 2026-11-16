import "server-only";
import { dbError, type Db } from "./db/admin";

export interface SheetMonthStatus {
  monthKey: string;
  sheetId: number | null;
  revision: number;
  syncedRevision: number;
  lastAttemptAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  openRows: number;
  failedRows: number;
}

export async function listSheetMonths(db: Db): Promise<SheetMonthStatus[]> {
  const [months, open] = await Promise.all([
    db.from("sheet_months").select("month_key, sheet_id, revision, synced_revision, last_attempt_at, last_synced_at, last_error").order("month_key", { ascending: false }),
    db.from("spreadsheet_sync_logs").select("spreadsheet_month, sync_status").neq("sync_status", "success"),
  ]);
  if (months.error) throw dbError("Gagal membaca status laporan", months.error);
  if (open.error) throw dbError("Gagal membaca status sinkronisasi", open.error);
  return months.data.map((m) => {
    const rows = open.data.filter((o) => o.spreadsheet_month === m.month_key);
    return {
      monthKey: m.month_key,
      sheetId: m.sheet_id === null ? null : Number(m.sheet_id),
      revision: Number(m.revision),
      syncedRevision: Number(m.synced_revision),
      lastAttemptAt: m.last_attempt_at,
      lastSyncedAt: m.last_synced_at,
      lastError: m.last_error,
      openRows: rows.length,
      failedRows: rows.filter((r) => r.sync_status === "failed").length,
    };
  });
}

export interface OpenSyncLead {
  leadId: string;
  name: string;
  status: string;
  error: string | null;
  retryCount: number;
}

export async function listOpenSyncLeads(db: Db, monthKey: string): Promise<OpenSyncLead[]> {
  const { data, error } = await db
    .from("spreadsheet_sync_logs")
    .select("lead_id, sync_status, error_message, retry_count, lead:leads(name)")
    .eq("spreadsheet_month", monthKey)
    .neq("sync_status", "success")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw dbError("Gagal membaca status sinkronisasi", error);
  return data.map((r) => ({
    leadId: r.lead_id,
    name: r.lead?.name ?? "-",
    status: r.sync_status,
    error: r.error_message,
    retryCount: r.retry_count,
  }));
}

export interface PendingSummary {
  /** Leads waiting to be sent. */
  total: number;
  failed: number;
  /** Month tabs that differ from the database, including months whose only change was a deletion. */
  months: string[];
  lastSentAt: string | null;
}

export async function getPendingSummary(db: Db): Promise<PendingSummary> {
  const [open, months] = await Promise.all([
    db.from("spreadsheet_sync_logs").select("spreadsheet_month, sync_status").neq("sync_status", "success"),
    db.from("sheet_months").select("month_key, revision, synced_revision, last_synced_at"),
  ]);
  if (open.error) throw dbError("Gagal membaca antrean pengiriman", open.error);
  if (months.error) throw dbError("Gagal membaca status bulan", months.error);

  const dirty = new Set(months.data.filter((m) => Number(m.revision) > Number(m.synced_revision)).map((m) => m.month_key));
  for (const row of open.data) dirty.add(row.spreadsheet_month);
  const sent = months.data.map((m) => m.last_synced_at).filter((t): t is string => t !== null);

  return {
    total: open.data.length,
    failed: open.data.filter((r) => r.sync_status === "failed").length,
    months: [...dirty].sort(),
    lastSentAt: sent.length > 0 ? sent.sort().at(-1)! : null,
  };
}
