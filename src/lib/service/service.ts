import "server-only";
import type { SyncStatus } from "../constants";
import { monthKeyOf, monthRange } from "../dates";
import { dbError, type Db } from "../db/admin";
import type { ServiceInput } from "./schema";

export interface ServiceRecord {
  id: string;
  dealerId: string;
  dealerName: string;
  name: string;
  location: string;
  unit: string;
  source: string;
  finalNote: string | null;
  entryDate: string | null;
  reportDate: string;
  createdAt: string;
  updatedAt: string;
  sync: { status: SyncStatus; error: string | null; month: string } | null;
}

const SELECT =
  "id, dealer_id, name, location, unit, source, final_note, entry_date, report_date, created_at, updated_at, dealer:dealers(dealer_name), sync:spreadsheet_sync_logs(sync_status, error_message, spreadsheet_month)";

type Row = {
  id: string;
  dealer_id: string;
  name: string;
  location: string;
  unit: string;
  source: string;
  final_note: string | null;
  entry_date: string | null;
  report_date: string;
  created_at: string;
  updated_at: string;
  dealer: { dealer_name: string } | null;
  sync: { sync_status: string; error_message: string | null; spreadsheet_month: string } | null;
};

function toRecord(row: Row): ServiceRecord {
  return {
    id: row.id,
    dealerId: row.dealer_id,
    dealerName: row.dealer?.dealer_name ?? "-",
    name: row.name,
    location: row.location,
    unit: row.unit,
    source: row.source,
    finalNote: row.final_note,
    entryDate: row.entry_date,
    reportDate: row.report_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sync: row.sync
      ? { status: row.sync.sync_status as SyncStatus, error: row.sync.error_message, month: row.sync.spreadsheet_month }
      : null,
  };
}

export const SERVICE_PAGE_SIZE = 25;

export async function getServiceEntry(db: Db, id: string): Promise<ServiceRecord | null> {
  const { data, error } = await db.from("service_entries").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw dbError("Gagal membaca data service", error);
  return data ? toRecord(data as unknown as Row) : null;
}

export async function listServiceEntries(
  db: Db,
  filters: { q?: string; month?: string; dealerId?: string; source?: string },
  page: number,
): Promise<{ rows: ServiceRecord[]; total: number }> {
  let query = db.from("service_entries").select(SELECT, { count: "exact" });
  const q = filters.q?.replace(/[,()*%\\:."']/g, " ").trim().slice(0, 60);
  if (q) query = query.or(`name.ilike.%${q}%,location.ilike.%${q}%`);
  if (filters.month) {
    const { start, end } = monthRange(filters.month);
    query = query.gte("report_date", start).lte("report_date", end);
  }
  if (filters.dealerId) query = query.eq("dealer_id", filters.dealerId);
  if (filters.source) query = query.eq("source", filters.source);

  const from = (page - 1) * SERVICE_PAGE_SIZE;
  const { data, error, count } = await query
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + SERVICE_PAGE_SIZE - 1);
  if (error) throw dbError("Gagal membaca daftar service", error);
  return { rows: (data as unknown as Row[]).map(toRecord), total: count ?? 0 };
}

export type SaveServiceResult =
  | { kind: "saved"; serviceId: string; monthKeys: string[]; replayed: boolean }
  | { kind: "rejected"; field: string; message: string };

async function checkDealer(db: Db, dealerId: string, currentDealerId?: string) {
  const { data, error } = await db.from("dealers").select("id, is_active").eq("id", dealerId).maybeSingle();
  if (error) throw dbError("Gagal membaca dealer", error);
  if (!data) return { field: "dealerId", message: "Dealer tidak ditemukan." };
  if (!data.is_active && data.id !== currentDealerId) return { field: "dealerId", message: "Dealer sudah nonaktif." };
  return null;
}

export async function createServiceEntry(db: Db, input: ServiceInput): Promise<SaveServiceResult> {
  // Idempotency: a repeated submission returns the entry that was already saved.
  const prior = await db.from("service_entries").select("id, report_date").eq("submission_id", input.submissionId).maybeSingle();
  if (prior.error) throw dbError("Gagal memeriksa pengiriman", prior.error);
  if (prior.data) {
    return { kind: "saved", serviceId: prior.data.id, monthKeys: [monthKeyOf(prior.data.report_date)], replayed: true };
  }

  const problem = await checkDealer(db, input.dealerId);
  if (problem) return { kind: "rejected", ...problem };

  const { data, error } = await db
    .from("service_entries")
    .insert({
      submission_id: input.submissionId,
      dealer_id: input.dealerId,
      name: input.name,
      location: input.location,
      unit: input.unit,
      source: input.source,
      final_note: input.finalNote,
      entry_date: input.entryDate,
    })
    .select("id, report_date")
    .single();

  if (error) {
    if (error.code === "23505") {
      const again = await db.from("service_entries").select("id, report_date").eq("submission_id", input.submissionId).single();
      if (again.error) throw dbError("Gagal membaca data service", again.error);
      return { kind: "saved", serviceId: again.data.id, monthKeys: [monthKeyOf(again.data.report_date)], replayed: true };
    }
    throw dbError("Gagal menyimpan data service", error);
  }
  return { kind: "saved", serviceId: data.id, monthKeys: [monthKeyOf(data.report_date)], replayed: false };
}

export async function updateServiceEntry(db: Db, id: string, input: ServiceInput): Promise<SaveServiceResult> {
  const current = await db.from("service_entries").select("id, dealer_id, report_date").eq("id", id).maybeSingle();
  if (current.error) throw dbError("Gagal membaca data service", current.error);
  if (!current.data) return { kind: "rejected", field: "form", message: "Data service tidak ditemukan atau sudah dihapus." };

  const problem = await checkDealer(db, input.dealerId, current.data.dealer_id);
  if (problem) return { kind: "rejected", ...problem };

  const { data, error } = await db
    .from("service_entries")
    .update({
      dealer_id: input.dealerId,
      name: input.name,
      location: input.location,
      unit: input.unit,
      source: input.source,
      final_note: input.finalNote,
      entry_date: input.entryDate,
    })
    .eq("id", id)
    .select("report_date")
    .single();
  if (error) throw dbError("Gagal memperbarui data service", error);

  return {
    kind: "saved",
    serviceId: id,
    monthKeys: [...new Set([monthKeyOf(current.data.report_date), monthKeyOf(data.report_date)])],
    replayed: false,
  };
}

export async function deleteServiceEntry(db: Db, id: string): Promise<{ monthKey: string } | null> {
  const { data, error } = await db.from("service_entries").delete().eq("id", id).select("report_date").maybeSingle();
  if (error) throw dbError("Gagal menghapus data service", error);
  return data ? { monthKey: monthKeyOf(data.report_date) } : null;
}
