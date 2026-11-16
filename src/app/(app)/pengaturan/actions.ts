"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionErrorMessage } from "@/lib/action-error";
import { requireUser } from "@/lib/auth";
import { SPREADSHEET_TITLE } from "@/lib/constants";
import { getAdminDb } from "@/lib/db/admin";
import { readEnv } from "@/lib/env";
import { getGeminiModelInfo } from "@/lib/location/gemini";
import { createGoogleSheetsGateway } from "@/lib/sheets/gateway";

export type CheckResult = { ok: boolean; message: string; detail?: string[]; titleMismatch?: boolean };

export async function testSheetsAction(): Promise<CheckResult> {
  await requireUser();
  const env = readEnv("sheets");
  if (!env.ok) return { ok: false, message: "Konfigurasi belum lengkap.", detail: env.problems };
  try {
    const { title, tabs } = await createGoogleSheetsGateway().getSpreadsheet();
    return {
      ok: true,
      message: `Terhubung ke spreadsheet "${title}" (${tabs.length} tab).`,
      detail: tabs.sort((a, b) => a.index - b.index).map((t) => t.title),
      titleMismatch: title !== SPREADSHEET_TITLE,
    };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Tes Google Sheets", error) };
  }
}

export async function setSpreadsheetTitleAction(): Promise<CheckResult> {
  await requireUser();
  try {
    await createGoogleSheetsGateway().setSpreadsheetTitle(SPREADSHEET_TITLE);
    return { ok: true, message: `Judul spreadsheet diubah menjadi "${SPREADSHEET_TITLE}".` };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Mengubah judul spreadsheet", error) };
  }
}

export async function testGeminiAction(): Promise<CheckResult> {
  await requireUser();
  const env = readEnv("gemini");
  if (!env.ok) return { ok: false, message: "Konfigurasi belum lengkap.", detail: env.problems };
  try {
    const info = await getGeminiModelInfo({ apiKey: env.value.GEMINI_API_KEY, model: env.value.GEMINI_MODEL });
    if (!info.supportsGenerateContent) return { ok: false, message: `Model ${info.name} tidak mendukung generateContent.` };
    return {
      ok: true,
      message: `Model tersedia: ${info.displayName ?? info.name} (${info.name}).`,
      detail: [
        "Ketersediaan free tier tidak bisa dicek lewat API. Pastikan model ini termasuk free tier di https://ai.google.dev/gemini-api/docs/pricing dan pantau kuota di Google AI Studio.",
      ],
    };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Tes Gemini", error) };
  }
}

export async function deleteMappingAction(id: string): Promise<CheckResult> {
  await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "ID tidak valid." };
  try {
    const { error } = await getAdminDb().from("region_mappings").delete().eq("id", id);
    if (error) return { ok: false, message: error.message };
    revalidatePath("/pengaturan");
    return { ok: true, message: "Dihapus." };
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Menghapus cache lokasi", error) };
  }
}
