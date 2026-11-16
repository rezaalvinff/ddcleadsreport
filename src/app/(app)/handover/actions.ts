"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionErrorMessage } from "@/lib/action-error";
import { requireUser } from "@/lib/auth";
import { getAdminDb } from "@/lib/db/admin";
import { markHandoversCopied, markHandoverOpened, setHandoverSent } from "@/lib/handover/service";
import { getLead, setHandoverGroups } from "@/lib/leads/service";

type Result = { ok: true } | { ok: false; message: string };
const id = z.uuid();

export async function markCopiedAction(leadId: string): Promise<Result> {
  await requireUser();
  if (!id.safeParse(leadId).success) return { ok: false, message: "ID tidak valid." };
  try {
    await markHandoversCopied(getAdminDb(), leadId);
    revalidatePath("/handover");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Mencatat salin pesan", error) };
  }
}

export async function markOpenedAction(handoverId: string): Promise<Result> {
  await requireUser();
  if (!id.safeParse(handoverId).success) return { ok: false, message: "ID tidak valid." };
  try {
    await markHandoverOpened(getAdminDb(), handoverId);
    revalidatePath("/handover");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Mencatat pembukaan WhatsApp", error) };
  }
}

export async function setSentAction(handoverId: string, sent: boolean): Promise<Result> {
  await requireUser();
  if (!id.safeParse(handoverId).success) return { ok: false, message: "ID tidak valid." };
  try {
    await setHandoverSent(getAdminDb(), handoverId, sent === true);
    revalidatePath("/handover", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Memperbarui status handover", error) };
  }
}

export async function updateHandoverGroupsAction(leadId: string, groupIds: string[]): Promise<Result> {
  await requireUser();
  const parsed = z.object({ leadId: id, groupIds: z.array(id).max(20) }).safeParse({ leadId, groupIds });
  if (!parsed.success) return { ok: false, message: "Data grup tidak valid." };
  try {
    const db = getAdminDb();
    if (!(await getLead(db, leadId))) return { ok: false, message: "Prospek tidak ditemukan." };
    const groups = await db.from("whatsapp_groups").select("id").in("id", parsed.data.groupIds);
    if (groups.error) throw new Error(groups.error.message);
    if (groups.data.length !== new Set(parsed.data.groupIds).size) return { ok: false, message: "Grup tidak ditemukan." };
    await setHandoverGroups(db, leadId, [...new Set(parsed.data.groupIds)]);
    revalidatePath("/handover", "layout");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Menyimpan grup handover", error) };
  }
}
