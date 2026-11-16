"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionErrorMessage } from "@/lib/action-error";
import { requireUser } from "@/lib/auth";
import { sheetTitleForMonth } from "@/lib/dates";
import { getAdminDb } from "@/lib/db/admin";
import { readEnv } from "@/lib/env";
import { classifyDomicile, type Classification } from "@/lib/location/classify";
import { resolveLocationWithGemini } from "@/lib/location/gemini";
import { findLearnedMapping, saveLearnedMapping } from "@/lib/location/learned";
import { fieldErrors, leadInputSchema, type FieldErrors } from "@/lib/leads/schema";
import { dealerRouting, listDealers } from "@/lib/master/service";
import { suggestDealer, type DealerSuggestion } from "@/lib/master/suggest";
import { createLead, deleteLead, findPhoneDuplicates, getLead, updateLead, type DuplicateMatch } from "@/lib/leads/service";
import { normalizePhone } from "@/lib/phone";
import { getPendingSummary, type PendingSummary } from "@/lib/reports";
import { appSyncDeps } from "@/lib/sync/app";
import { syncMonths } from "@/lib/sync/service";

export interface DomicileLookup {
  classification: Classification;
  /** Dealer the location points at; null when nothing matches. */
  dealer: DealerSuggestion | null;
}

export async function classifyDomicileAction(domicile: string): Promise<DomicileLookup | { status: "error"; message: string }> {
  await requireUser();
  try {
    const text = z.string().trim().max(120).parse(domicile);
    const db = getAdminDb();
    const gemini = readEnv("gemini");
    const classification = await classifyDomicile(text, {
      findLearned: (name) => findLearnedMapping(db, name),
      saveLearned: (mapping) => saveLearnedMapping(db, mapping),
      // Only the domicile text is sent to Gemini.
      resolveWithAi: gemini.ok
        ? (value) => resolveLocationWithGemini(value, { apiKey: gemini.value.GEMINI_API_KEY, model: gemini.value.GEMINI_MODEL })
        : undefined,
    });

    // The suggestion follows whatever the classifier worked out, including a
    // place it found but could not assign to a region on its own.
    const place =
      classification.status === "resolved"
        ? { city: classification.city, province: classification.province, region: classification.region }
        : (classification.suggestion ?? classification.candidates[0] ?? null);
    if (!place) return { classification, dealer: null };

    const [dealers, routing] = await Promise.all([
      listDealers(db, { activeOnly: true }),
      dealerRouting(db, { city: place.city }, text),
    ]);
    return { classification, dealer: suggestDealer({ place, dealers, ...routing }) };
  } catch (error) {
    return { status: "error", message: actionErrorMessage("Klasifikasi domisili", error) };
  }
}

export async function checkPhoneAction(phone: string, excludeId?: string): Promise<DuplicateMatch[]> {
  await requireUser();
  const normalized = normalizePhone(String(phone));
  if (!normalized) return [];
  const id = excludeId && z.uuid().safeParse(excludeId).success ? excludeId : undefined;
  return findPhoneDuplicates(getAdminDb(), normalized, id);
}

export type SaveLeadResponse =
  | { status: "saved"; leadId: string; replayed: boolean; month: string; pending: PendingSummary; warnings: string[] }
  | { status: "duplicate_phone"; matches: DuplicateMatch[] }
  | { status: "invalid"; errors: FieldErrors }
  | { status: "error"; message: string };

/**
 * Saves to Supabase and queues the affected month(s) for the next send.
 * Nothing is written to Google Sheets here: the user sends the whole queue
 * from the dashboard, and the optional daily cron is only a safety net.
 */
export async function saveLeadAction(raw: unknown, leadId?: string): Promise<SaveLeadResponse> {
  await requireUser();
  const parsed = leadInputSchema.safeParse(raw);
  if (!parsed.success) return { status: "invalid", errors: fieldErrors(parsed.error) };
  if (leadId !== undefined && !z.uuid().safeParse(leadId).success) return { status: "error", message: "ID prospek tidak valid." };

  const db = getAdminDb();
  let result;
  try {
    result = leadId ? await updateLead(db, leadId, parsed.data) : await createLead(db, parsed.data);
  } catch (error) {
    return { status: "error", message: actionErrorMessage("Menyimpan prospek", error) };
  }
  if (result.kind === "duplicate_phone") return { status: "duplicate_phone", matches: result.matches };
  if (result.kind === "rejected") return { status: "invalid", errors: { [result.field]: result.message } };

  revalidatePath("/", "layout");
  return {
    status: "saved",
    leadId: result.leadId,
    replayed: result.replayed,
    month: result.monthKeys.at(-1)!,
    pending: await getPendingSummary(db),
    warnings: result.warnings,
  };
}

export type SimpleResult = { ok: true; message: string } | { ok: false; message: string };

export async function deleteLeadAction(leadId: string): Promise<SimpleResult> {
  await requireUser();
  if (!z.uuid().safeParse(leadId).success) return { ok: false, message: "ID prospek tidak valid." };
  try {
    const deleted = await deleteLead(getAdminDb(), leadId);
    if (!deleted) return { ok: false, message: "Prospek tidak ditemukan." };
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Prospek dihapus. Tab ${sheetTitleForMonth(deleted.monthKey)} masuk antrean; tekan "Kirim sekarang" untuk memperbarui Google Sheets.`,
    };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Menghapus prospek", error) };
  }
}

export async function resyncLeadAction(leadId: string): Promise<SimpleResult> {
  await requireUser();
  if (!z.uuid().safeParse(leadId).success) return { ok: false, message: "ID prospek tidak valid." };
  try {
    const db = getAdminDb();
    const lead = await getLead(db, leadId);
    if (!lead) return { ok: false, message: "Prospek tidak ditemukan." };
    const [outcome] = await syncMonths(appSyncDeps(), [lead.reportDate.slice(0, 7)]);
    revalidatePath("/", "layout");
    if (outcome?.status === "success") return { ok: true, message: "Tersinkron ke Google Sheets." };
    const reason = outcome?.status === "failed" ? outcome.error : "sedang dikirim oleh proses lain, coba lagi sebentar";
    return { ok: false, message: `Pengiriman gagal: ${reason}` };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Sinkronisasi ulang", error) };
  }
}
