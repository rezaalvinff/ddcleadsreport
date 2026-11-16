import "server-only";
import { LEAD_SOURCES, REPORTING_REGIONS, type LeadSource, type ReportingRegion } from "./constants";
import { monthRange, startOfJakartaDay, todayJakarta } from "./dates";
import { dbError, type Db } from "./db/admin";

export interface DashboardStats {
  total: number;
  bySource: Record<LeadSource, number>;
  byRegion: Record<ReportingRegion, number>;
  submittedToday: number;
  syncFailed: number;
  syncPending: number;
}

const PAGE = 1000;

export async function getDashboardStats(db: Db, monthKey: string, now = new Date()): Promise<DashboardStats> {
  const { start, end } = monthRange(monthKey);
  const bySource = Object.fromEntries(LEAD_SOURCES.map((s) => [s, 0])) as Record<LeadSource, number>;
  const byRegion = Object.fromEntries(REPORTING_REGIONS.map((r) => [r, 0])) as Record<ReportingRegion, number>;
  let total = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("leads")
      .select("source, reporting_region")
      .gte("report_date", start)
      .lte("report_date", end)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw dbError("Gagal membaca statistik", error);
    for (const row of data) {
      total++;
      if (row.source in bySource) bySource[row.source as LeadSource]++;
      if (row.reporting_region in byRegion) byRegion[row.reporting_region as ReportingRegion]++;
    }
    if (data.length < PAGE) break;
  }

  const [today, failed, pending] = await Promise.all([
    db.from("leads").select("id", { count: "exact", head: true }).gte("created_at", startOfJakartaDay(todayJakarta(now)).toISOString()),
    db.from("spreadsheet_sync_logs").select("id", { count: "exact", head: true }).eq("sync_status", "failed"),
    db.from("spreadsheet_sync_logs").select("id", { count: "exact", head: true }).eq("sync_status", "pending"),
  ]);
  for (const r of [today, failed, pending]) if (r.error) throw dbError("Gagal membaca statistik", r.error);

  return {
    total,
    bySource,
    byRegion,
    submittedToday: today.count ?? 0,
    syncFailed: failed.count ?? 0,
    syncPending: pending.count ?? 0,
  };
}
