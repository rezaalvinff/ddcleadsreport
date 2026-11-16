"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionErrorMessage } from "@/lib/action-error";
import { requireUser } from "@/lib/auth";
import { getAdminDb } from "@/lib/db/admin";
import { dealerSchema, groupSchema, masterWriteError } from "@/lib/master/service";

export interface FormState {
  ok: boolean;
  message: string | null;
  /** Changes on every successful submit so client forms can reset. */
  savedAt?: number;
}

const id = z.uuid();

function fields(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}

export async function saveDealerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = dealerSchema.safeParse(fields(formData, ["dealer_name", "city", "province", "reporting_region"]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
  const dealerId = String(formData.get("id") ?? "");
  if (dealerId && !id.safeParse(dealerId).success) return { ok: false, message: "ID dealer tidak valid." };
  try {
    const db = getAdminDb();
    const { error } = dealerId
      ? await db.from("dealers").update(parsed.data).eq("id", dealerId)
      : await db.from("dealers").insert(parsed.data);
    if (error) return { ok: false, message: masterWriteError(error, "Dealer") };
    revalidatePath("/", "layout");
    return { ok: true, message: dealerId ? "Dealer diperbarui." : "Dealer ditambahkan.", savedAt: Date.now() };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Menyimpan dealer", error) };
  }
}

export async function saveGroupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = groupSchema.safeParse(fields(formData, ["group_name", "dealer_id", "reporting_region", "group_link"]));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
  const groupId = String(formData.get("id") ?? "");
  if (groupId && !id.safeParse(groupId).success) return { ok: false, message: "ID grup tidak valid." };
  try {
    const db = getAdminDb();
    const { error } = groupId
      ? await db.from("whatsapp_groups").update(parsed.data).eq("id", groupId)
      : await db.from("whatsapp_groups").insert(parsed.data);
    if (error) return { ok: false, message: masterWriteError(error, "Grup") };
    revalidatePath("/", "layout");
    return { ok: true, message: groupId ? "Grup diperbarui." : "Grup ditambahkan.", savedAt: Date.now() };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Menyimpan grup", error) };
  }
}

export async function setActiveAction(kind: "dealer" | "group", recordId: string, active: boolean): Promise<FormState> {
  await requireUser();
  if (!id.safeParse(recordId).success || !["dealer", "group"].includes(kind)) return { ok: false, message: "Data tidak valid." };
  try {
    const table = kind === "dealer" ? "dealers" : "whatsapp_groups";
    const { error } = await getAdminDb().from(table).update({ is_active: active === true }).eq("id", recordId);
    if (error) return { ok: false, message: masterWriteError(error, kind === "dealer" ? "Dealer" : "Grup") };
    revalidatePath("/", "layout");
    return { ok: true, message: null };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Mengubah status", error) };
  }
}

export async function deleteMasterAction(kind: "dealer" | "group", recordId: string): Promise<FormState> {
  await requireUser();
  if (!id.safeParse(recordId).success || !["dealer", "group"].includes(kind)) return { ok: false, message: "Data tidak valid." };
  try {
    const table = kind === "dealer" ? "dealers" : "whatsapp_groups";
    const { error } = await getAdminDb().from(table).delete().eq("id", recordId);
    if (error) return { ok: false, message: masterWriteError(error, kind === "dealer" ? "Dealer" : "Grup") };
    revalidatePath("/", "layout");
    return { ok: true, message: "Dihapus." };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Menghapus data", error) };
  }
}
