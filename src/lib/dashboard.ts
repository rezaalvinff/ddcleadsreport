import "server-only";
import { LEAD_SOURCES, REPORTING_REGIONS, type LeadSource, type ReportingRegion } from "./constants";
import { datesOfMonth, monthRange, startOfJakartaDay, todayJakarta, type IsoDate } from "./dates";
import { dbError, type Db } from "./db/admin";

export interface DailyPoint {
  date: IsoDate;
  bySource: Record<LeadSource, number>;
  total: number;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface DashboardStats {
  total: number;
  bySource: Record<LeadSource, number>;
  byRegion: Record<ReportingRegion, number>;
  byDealer: NamedCount[];
  byUnit: NamedCount[];
  daily: DailyPoint[];
  busiestDay: DailyPoint | null;
  submittedToday: number;
}

const PAGE = 1000;

export async function getDashboardStats(db: Db, monthKey: string, now = new Date()): Promise<DashboardStats> {
  const { start, end } = monthRange(monthKey);
  const bySource = Object.fromEntries(LEAD_SOURCES.map((s) => [s, 0])) as Record<LeadSource, number>;
  const byRegion = Object.fromEntries(REPORTING_REGIONS.map((r) => [r, 0])) as Record<ReportingRegion, number>;
  const dealerCounts = new Map<string, number>();
  const unitCounts = new Map<string, number>();
  const daily = new Map<IsoDate, Record<LeadSource, number>>(
    datesOfMonth(monthKey).map((d) => [d, Object.fromEntries(LEAD_SOURCES.map((s) => [s, 0])) as Record<LeadSource, number>]),
  );
  let total = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("leads")
      .select("source, reporting_region, report_date, unit, dealer:dealers(dealer_name)")
      .gte("report_date", start)
      .lte("report_date", end)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw dbError("Gagal membaca statistik", error);
    for (const row of data) {
      total++;
      const source = row.source as LeadSource;
      if (row.source in bySource) bySource[source]++;
      if (row.reporting_region in byRegion) byRegion[row.reporting_region as ReportingRegion]++;
      const day = daily.get(row.report_date);
      if (day) day[source]++;
      const dealer = row.dealer?.dealer_name ?? "Tanpa dealer";
      dealerCounts.set(dealer, (dealerCounts.get(dealer) ?? 0) + 1);
      unitCounts.set(row.unit, (unitCounts.get(row.unit) ?? 0) + 1);
    }
    if (data.length < PAGE) break;
  }

  const today = await db
    .from("leads")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startOfJakartaDay(todayJakarta(now)).toISOString());
  if (today.error) throw dbError("Gagal membaca statistik", today.error);

  const points: DailyPoint[] = [...daily].map(([date, counts]) => ({
    date,
    bySource: counts,
    total: LEAD_SOURCES.reduce((n, s) => n + counts[s], 0),
  }));
  const busiest = points.reduce<DailyPoint | null>((best, p) => (p.total > 0 && (!best || p.total > best.total) ? p : best), null);
  const rank = (m: Map<string, number>): NamedCount[] =>
    [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    total,
    bySource,
    byRegion,
    byDealer: rank(dealerCounts),
    byUnit: rank(unitCounts),
    daily: points,
    busiestDay: busiest,
    submittedToday: today.count ?? 0,
  };
}
