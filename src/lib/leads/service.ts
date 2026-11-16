import "server-only";
import { isReportingRegion, type ClassificationMethod, type ReportingRegion, type SyncStatus } from "../constants";
import { monthKeyOf, monthRange } from "../dates";
import { dbError, type Db } from "../db/admin";
import { classifyDomicile, resolveSubmittedRegion } from "../location/classify";
import { findLearnedMapping, saveLearnedMapping } from "../location/learned";
import { normalizeLocation } from "../location/match";
import type { LeadInput } from "./schema";

export interface LeadSync {
  status: SyncStatus;
  error: string | null;
  retryCount: number;
  syncedAt: string | null;
  month: string;
}

export interface LeadRecord {
  id: string;
  name: string;
  phone: string;
  domicile: string;
  city: string | null;
  province: string | null;
  reportingRegion: ReportingRegion;
  classificationStatus: ClassificationMethod;
  leadDate: string | null;
  reportDate: string;
  createdAt: string;
  updatedAt: string;
  dealerId: string;
  dealerName: string;
  unit: string;
  followUpDate: string | null;
  source: string;
  sync: LeadSync | null;
}

const LEAD_SELECT =
  "id, name, phone, domicile, city, province, reporting_region, classification_status, lead_date, report_date, created_at, updated_at, dealer_id, unit, follow_up_date, source, dealer:dealers(dealer_name), sync:spreadsheet_sync_logs(sync_status, error_message, retry_count, synced_at, spreadsheet_month)";

type LeadRow = {
  id: string;
  name: string;
  phone: string;
  domicile: string;
  city: string | null;
  province: string | null;
  reporting_region: string;
  classification_status: string;
  lead_date: string | null;
  report_date: string;
  created_at: string;
  updated_at: string;
  dealer_id: string;
  unit: string;
  follow_up_date: string | null;
  source: string;
  dealer: { dealer_name: string } | null;
  sync:
    | { sync_status: string; error_message: string | null; retry_count: number; synced_at: string | null; spreadsheet_month: string }
    | null;
};

function toRecord(row: LeadRow): LeadRecord {
  if (!isReportingRegion(row.reporting_region)) throw new Error(`Wilayah tidak valid pada prospek ${row.id}`);
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    domicile: row.domicile,
    city: row.city,
    province: row.province,
    reportingRegion: row.reporting_region,
    classificationStatus: row.classification_status as ClassificationMethod,
    leadDate: row.lead_date,
    reportDate: row.report_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dealerId: row.dealer_id,
    dealerName: row.dealer?.dealer_name ?? "-",
    unit: row.unit,
    followUpDate: row.follow_up_date,
    source: row.source,
    sync: row.sync
      ? {
          status: row.sync.sync_status as SyncStatus,
          error: row.sync.error_message,
          retryCount: row.sync.retry_count,
          syncedAt: row.sync.synced_at,
          month: row.sync.spreadsheet_month,
        }
      : null,
  };
}

export async function getLead(db: Db, id: string): Promise<LeadRecord | null> {
  const { data, error } = await db.from("leads").select(LEAD_SELECT).eq("id", id).maybeSingle();
  if (error) throw dbError("Gagal membaca prospek", error);
  return data ? toRecord(data as unknown as LeadRow) : null;
}

export interface LeadFilters {
  q?: string;
  month?: string;
  region?: string;
  dealerId?: string;
  source?: string;
  date?: string;
  sync?: string;
}

export const PAGE_SIZE = 25;

/** Removes characters with meaning in PostgREST filter syntax. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%\\:."']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export async function listLeads(db: Db, filters: LeadFilters, page: number): Promise<{ rows: LeadRecord[]; total: number }> {
  // With a sync-status filter the embed becomes an inner join so it filters the leads.
  const select = filters.sync
    ? LEAD_SELECT.replace("sync:spreadsheet_sync_logs(", "sync:spreadsheet_sync_logs!inner(")
    : LEAD_SELECT;
  let query = db.from("leads").select(select, { count: "exact" });
  const q = filters.q ? sanitizeSearch(filters.q) : "";
  if (q) {
    const digits = q.replace(/\D/g, "");
    const isPhone = digits.length >= 3 && digits.length === q.replace(/[\s+-]/g, "").length;
    const phoneTerm = digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
    query = isPhone ? query.ilike("phone", `%${phoneTerm}%`) : query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
  }
  if (filters.month) {
    const { start, end } = monthRange(filters.month);
    query = query.gte("report_date", start).lte("report_date", end);
  }
  if (filters.date) query = query.eq("report_date", filters.date);
  if (filters.region) query = query.eq("reporting_region", filters.region);
  if (filters.dealerId) query = query.eq("dealer_id", filters.dealerId);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.sync) query = query.eq("sync.sync_status", filters.sync);

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw dbError("Gagal membaca daftar prospek", error);
  return { rows: (data as unknown as LeadRow[]).map(toRecord), total: count ?? 0 };
}

export interface DuplicateMatch {
  id: string;
  name: string;
  reportDate: string;
  dealerName: string;
  createdAt: string;
}

export async function findPhoneDuplicates(db: Db, phone: string, excludeId?: string): Promise<DuplicateMatch[]> {
  let query = db.from("leads").select("id, name, report_date, created_at, dealer:dealers(dealer_name)").eq("phone", phone);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(5);
  if (error) throw dbError("Gagal memeriksa nomor duplikat", error);
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    reportDate: r.report_date,
    createdAt: r.created_at,
    dealerName: r.dealer?.dealer_name ?? "-",
  }));
}

export type SaveLeadResult =
  | { kind: "saved"; leadId: string; monthKeys: string[]; replayed: boolean; warnings: string[] }
  | { kind: "duplicate_phone"; matches: DuplicateMatch[] }
  | { kind: "rejected"; field: string; message: string };

async function checkReferences(
  db: Db,
  input: LeadInput,
  currentDealerId?: string,
): Promise<{ field: string; message: string } | null> {
  const dealer = await db.from("dealers").select("id, is_active").eq("id", input.dealerId).maybeSingle();
  if (dealer.error) throw dbError("Gagal membaca dealer", dealer.error);
  if (!dealer.data) return { field: "dealerId", message: "Dealer tidak ditemukan." };
  if (!dealer.data.is_active && dealer.data.id !== currentDealerId) return { field: "dealerId", message: "Dealer sudah nonaktif." };

  if (input.groupIds.length > 0) {
    const groups = await db.from("whatsapp_groups").select("id, is_active").in("id", input.groupIds);
    if (groups.error) throw dbError("Gagal membaca grup WhatsApp", groups.error);
    const found = new Map(groups.data.map((g) => [g.id, g.is_active]));
    if (input.groupIds.some((id) => !found.has(id))) return { field: "groupIds", message: "Grup WhatsApp tidak ditemukan." };
  }
  return null;
}

/** Re-derives the classification server-side (deterministic + cache, never Gemini). */
async function classificationFor(db: Db, input: LeadInput) {
  const server = await classifyDomicile(input.domicile, { findLearned: (n) => findLearnedMapping(db, n) });
  const decision = resolveSubmittedRegion(server, input.reportingRegion);
  if (decision.learnManual) {
    await saveLearnedMapping(db, {
      normalizedName: normalizeLocation(input.domicile),
      city: decision.city,
      province: decision.province,
      region: input.reportingRegion,
      source: "manual",
      confidence: null,
    });
  }
  return decision;
}

/** Adds the selected groups; removes deselected ones that were not marked as sent. */
export async function setHandoverGroups(db: Db, leadId: string, groupIds: string[]): Promise<void> {
  const existing = await db.from("lead_handovers").select("id, whatsapp_group_id, sent_marked_at").eq("lead_id", leadId);
  if (existing.error) throw dbError("Gagal membaca handover", existing.error);
  const remove = existing.data.filter((h) => !groupIds.includes(h.whatsapp_group_id) && !h.sent_marked_at).map((h) => h.id);
  if (remove.length > 0) {
    const del = await db.from("lead_handovers").delete().in("id", remove);
    if (del.error) throw dbError("Gagal memperbarui grup handover", del.error);
  }
  const have = new Set(existing.data.map((h) => h.whatsapp_group_id));
  const add = groupIds.filter((id) => !have.has(id)).map((id) => ({ lead_id: leadId, whatsapp_group_id: id }));
  if (add.length > 0) {
    const ins = await db.from("lead_handovers").upsert(add, { onConflict: "lead_id,whatsapp_group_id", ignoreDuplicates: true });
    if (ins.error) throw dbError("Gagal menyimpan grup handover", ins.error);
  }
}

export async function createLead(db: Db, input: LeadInput): Promise<SaveLeadResult> {
  // Idempotency: a repeated submission returns the lead that was already saved.
  const prior = await db.from("leads").select("id, report_date").eq("submission_id", input.submissionId).maybeSingle();
  if (prior.error) throw dbError("Gagal memeriksa pengiriman", prior.error);
  if (prior.data) return { kind: "saved", leadId: prior.data.id, monthKeys: [monthKeyOf(prior.data.report_date)], replayed: true, warnings: [] };

  const problem = await checkReferences(db, input);
  if (problem) return { kind: "rejected", ...problem };

  if (!input.confirmDuplicate) {
    const matches = await findPhoneDuplicates(db, input.phone);
    if (matches.length > 0) return { kind: "duplicate_phone", matches };
  }

  const classification = await classificationFor(db, input);
  const { data, error } = await db
    .from("leads")
    .insert({
      submission_id: input.submissionId,
      name: input.name,
      phone: input.phone,
      domicile: input.domicile,
      city: classification.city,
      province: classification.province,
      reporting_region: input.reportingRegion,
      classification_status: classification.method,
      lead_date: input.leadDate,
      dealer_id: input.dealerId,
      unit: input.unit,
      follow_up_date: input.followUpDate,
      source: input.source,
    })
    .select("id, report_date")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Concurrent double submit: the other request inserted it first.
      const again = await db.from("leads").select("id, report_date").eq("submission_id", input.submissionId).single();
      if (again.error) throw dbError("Gagal membaca prospek", again.error);
      return { kind: "saved", leadId: again.data.id, monthKeys: [monthKeyOf(again.data.report_date)], replayed: true, warnings: [] };
    }
    throw dbError("Gagal menyimpan prospek", error);
  }

  const warnings: string[] = [];
  try {
    await setHandoverGroups(db, data.id, input.groupIds);
  } catch (e) {
    warnings.push(`Prospek tersimpan, tetapi grup handover gagal disimpan: ${(e as Error).message}`);
  }
  return { kind: "saved", leadId: data.id, monthKeys: [monthKeyOf(data.report_date)], replayed: false, warnings };
}

export async function updateLead(db: Db, id: string, input: LeadInput): Promise<SaveLeadResult> {
  const current = await db.from("leads").select("id, dealer_id, report_date").eq("id", id).maybeSingle();
  if (current.error) throw dbError("Gagal membaca prospek", current.error);
  if (!current.data) return { kind: "rejected", field: "form", message: "Prospek tidak ditemukan atau sudah dihapus." };

  const problem = await checkReferences(db, input, current.data.dealer_id);
  if (problem) return { kind: "rejected", ...problem };

  if (!input.confirmDuplicate) {
    const matches = await findPhoneDuplicates(db, input.phone, id);
    if (matches.length > 0) return { kind: "duplicate_phone", matches };
  }

  const classification = await classificationFor(db, input);
  const { data, error } = await db
    .from("leads")
    .update({
      name: input.name,
      phone: input.phone,
      domicile: input.domicile,
      city: classification.city,
      province: classification.province,
      reporting_region: input.reportingRegion,
      classification_status: classification.method,
      lead_date: input.leadDate,
      dealer_id: input.dealerId,
      unit: input.unit,
      follow_up_date: input.followUpDate,
      source: input.source,
    })
    .eq("id", id)
    .select("report_date")
    .single();
  if (error) throw dbError("Gagal memperbarui prospek", error);

  await setHandoverGroups(db, id, input.groupIds);
  return {
    kind: "saved",
    leadId: id,
    monthKeys: [...new Set([monthKeyOf(current.data.report_date), monthKeyOf(data.report_date)])],
    replayed: false,
    warnings: [],
  };
}

export async function deleteLead(db: Db, id: string): Promise<{ monthKey: string } | null> {
  const { data, error } = await db.from("leads").delete().eq("id", id).select("report_date").maybeSingle();
  if (error) throw dbError("Gagal menghapus prospek", error);
  return data ? { monthKey: monthKeyOf(data.report_date) } : null;
}

/** Most recently submitted leads (by created_at, not report date). */
export async function listRecentLeads(db: Db, limit: number): Promise<LeadRecord[]> {
  const { data, error } = await db.from("leads").select(LEAD_SELECT).order("created_at", { ascending: false }).limit(limit);
  if (error) throw dbError("Gagal membaca prospek terbaru", error);
  return (data as unknown as LeadRow[]).map(toRecord);
}
