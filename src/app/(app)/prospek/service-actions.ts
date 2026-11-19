"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionErrorMessage } from "@/lib/action-error";
import { requireUser } from "@/lib/auth";
import { sheetTitleForMonth } from "@/lib/dates";
import { getAdminDb } from "@/lib/db/admin";
import { fieldErrors, type FieldErrors } from "@/lib/leads/schema";
import { getPendingSummary, type PendingSummary } from "@/lib/reports";
import { serviceInputSchema } from "@/lib/service/schema";
import { createServiceEntry, deleteServiceEntry, updateServiceEntry } from "@/lib/service/service";
import { appSyncDeps } from "@/lib/sync/app";
import { syncMonths } from "@/lib/sync/service";

export type SaveServiceResponse =
  | { status: "saved"; serviceId: string; replayed: boolean; month: string; pending: PendingSummary }
  | { status: "invalid"; errors: FieldErrors }
  | { status: "error"; message: string };

/** Saves to Supabase and queues the month; nothing is written to Sheets here. */
export async function saveServiceAction(raw: unknown, serviceId?: string): Promise<SaveServiceResponse> {
  await requireUser();
  const parsed = serviceInputSchema.safeParse(raw);
  if (!parsed.success) return { status: "invalid", errors: fieldErrors(parsed.error) };
  if (serviceId !== undefined && !z.uuid().safeParse(serviceId).success) {
    return { status: "error", message: "ID data service tidak valid." };
  }

  const db = getAdminDb();
  let result;
  try {
    result = serviceId ? await updateServiceEntry(db, serviceId, parsed.data) : await createServiceEntry(db, parsed.data);
  } catch (error) {
    return { status: "error", message: actionErrorMessage("Menyimpan data service", error) };
  }
  if (result.kind === "rejected") return { status: "invalid", errors: { [result.field]: result.message } };

  revalidatePath("/", "layout");
  return {
    status: "saved",
    serviceId: result.serviceId,
    replayed: result.replayed,
    month: result.monthKeys.at(-1)!,
    pending: await getPendingSummary(db),
  };
}

export type SimpleResult = { ok: true; message: string } | { ok: false; message: string };

export async function deleteServiceAction(serviceId: string): Promise<SimpleResult> {
  await requireUser();
  if (!z.uuid().safeParse(serviceId).success) return { ok: false, message: "ID data service tidak valid." };
  try {
    const deleted = await deleteServiceEntry(getAdminDb(), serviceId);
    if (!deleted) return { ok: false, message: "Data service tidak ditemukan." };
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Data service dihapus. Tab ${sheetTitleForMonth(deleted.monthKey)} masuk antrean; tekan "Kirim sekarang" untuk memperbarui Google Sheets.`,
    };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Menghapus data service", error) };
  }
}

export async function resyncServiceAction(serviceId: string): Promise<SimpleResult> {
  await requireUser();
  if (!z.uuid().safeParse(serviceId).success) return { ok: false, message: "ID data service tidak valid." };
  try {
    const db = getAdminDb();
    const { data, error } = await db.from("service_entries").select("report_date").eq("id", serviceId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { ok: false, message: "Data service tidak ditemukan." };
    const [outcome] = await syncMonths(appSyncDeps(), [data.report_date.slice(0, 7)]);
    revalidatePath("/", "layout");
    if (outcome?.status === "success") return { ok: true, message: "Tersinkron ke Google Sheets." };
    const reason = outcome?.status === "failed" ? outcome.error : "sedang dikirim oleh proses lain, coba lagi sebentar";
    return { ok: false, message: `Pengiriman gagal: ${reason}` };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Sinkronisasi ulang", error) };
  }
}
