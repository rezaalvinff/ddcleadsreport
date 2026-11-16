"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { actionErrorMessage } from "@/lib/action-error";
import { requireUser } from "@/lib/auth";
import type { SyncStatus } from "@/lib/constants";
import { getAdminDb } from "@/lib/db/admin";
import { readEnv } from "@/lib/env";
import { classifyDomicile, type Classification } from "@/lib/location/classify";
import { resolveLocationWithGemini } from "@/lib/location/gemini";
import { findLearnedMapping, saveLearnedMapping } from "@/lib/location/learned";
import { fieldErrors, leadInputSchema, type FieldErrors } from "@/lib/leads/schema";
import { createLead, deleteLead, findPhoneDuplicates, getLead, updateLead, type DuplicateMatch } from "@/lib/leads/service";
import { normalizePhone } from "@/lib/phone";
import { appSyncDeps } from "@/lib/sync/app";
import { syncDirtyMonths, syncMonths, type MonthSyncOutcome } from "@/lib/sync/service";

export async function classifyDomicileAction(domicile: string): Promise<Classification | { status: "error"; message: string }> {
  await requireUser();
  try {
    const text = z.string().trim().max(120).parse(domicile);
    const db = getAdminDb();
    const gemini = readEnv("gemini");
    return await classifyDomicile(text, {
      findLearned: (name) => findLearnedMapping(db, name),
      saveLearned: (mapping) => saveLearnedMapping(db, mapping),
      // Only the domicile text is sent to Gemini.
      resolveWithAi: gemini.ok
        ? (value) => resolveLocationWithGemini(value, { apiKey: gemini.value.GEMINI_API_KEY, model: gemini.value.GEMINI_MODEL })
        : undefined,
    });
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

export interface LeadSyncSummary {
  status: SyncStatus | null;
  error: string | null;
  month: string | null;
}

export type SaveLeadResponse =
  | { status: "saved"; leadId: string; replayed: boolean; sync: LeadSyncSummary; warnings: string[] }
  | { status: "duplicate_phone"; matches: DuplicateMatch[] }
  | { status: "invalid"; errors: FieldErrors }
  | { status: "error"; message: string };

function describeOutcomes(outcomes: MonthSyncOutcome[]): string | null {
  const problems = outcomes.flatMap((o) =>
    o.status === "failed" ? [`${o.monthKey}: ${o.error}`] : o.status === "busy" ? [`${o.monthKey}: sedang disinkronkan proses lain`] : [],
  );
  return problems.length > 0 ? problems.join("; ") : null;
}

/** Saves to Supabase first, then synchronises the affected month tab(s). */
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

  const deps = appSyncDeps();
  const outcomes = await syncMonths(deps, result.monthKeys);
  if (outcomes.every((o) => o.status === "success")) {
    // Google Sheets is reachable: retry anything left from earlier failures.
    after(async () => {
      await syncDirtyMonths(appSyncDeps());
    });
  }
  revalidatePath("/", "layout");

  const lead = await getLead(db, result.leadId);
  const problem = describeOutcomes(outcomes);
  return {
    status: "saved",
    leadId: result.leadId,
    replayed: result.replayed,
    sync: {
      status: lead?.sync?.status ?? null,
      error: lead?.sync?.error ?? problem,
      month: lead?.sync?.month ?? null,
    },
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
    const [outcome] = await syncMonths(appSyncDeps(), [deleted.monthKey]);
    revalidatePath("/", "layout");
    if (outcome?.status === "success") return { ok: true, message: "Prospek dihapus dan laporan Google Sheets diperbarui." };
    return {
      ok: true,
      message: `Prospek dihapus dari database. Google Sheets belum diperbarui (${describeOutcomes(outcome ? [outcome] : [])}); akan dicoba ulang.`,
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
    const outcomes = await syncMonths(appSyncDeps(), [lead.reportDate.slice(0, 7)]);
    revalidatePath("/", "layout");
    const problem = describeOutcomes(outcomes);
    return problem ? { ok: false, message: `Sinkronisasi gagal: ${problem}` } : { ok: true, message: "Tersinkron ke Google Sheets." };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Sinkronisasi ulang", error) };
  }
}
