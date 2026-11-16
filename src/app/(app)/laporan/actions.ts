"use server";

import { revalidatePath } from "next/cache";
import { actionErrorMessage } from "@/lib/action-error";
import { requireUser } from "@/lib/auth";
import { isValidMonthKey, sheetTitleForMonth } from "@/lib/dates";
import { appSyncDeps } from "@/lib/sync/app";
import { syncDirtyMonths, syncMonth, type MonthSyncOutcome } from "@/lib/sync/service";

export type SyncActionResult = { ok: boolean; message: string };

function summarize(outcomes: MonthSyncOutcome[]): SyncActionResult {
  if (outcomes.length === 0) return { ok: true, message: "Tidak ada bulan yang perlu disinkronkan." };
  const failed = outcomes.filter((o) => o.status !== "success");
  if (failed.length === 0) return { ok: true, message: `Tersinkron: ${outcomes.map((o) => sheetTitleForMonth(o.monthKey)).join(", ")}.` };
  return {
    ok: false,
    message: failed
      .map((o) => `${sheetTitleForMonth(o.monthKey)}: ${o.status === "failed" ? o.error : "sedang disinkronkan proses lain, coba lagi sebentar"}`)
      .join(" | "),
  };
}

export async function resyncMonthAction(monthKey: string): Promise<SyncActionResult> {
  await requireUser();
  if (!isValidMonthKey(monthKey)) return { ok: false, message: "Bulan tidak valid." };
  try {
    // Forced: also repairs a tab that was edited by hand.
    const outcome = await syncMonth(appSyncDeps(), monthKey, { force: true });
    revalidatePath("/", "layout");
    return summarize([outcome]);
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Sinkronisasi bulan", error) };
  }
}

export async function resyncAllAction(): Promise<SyncActionResult> {
  await requireUser();
  try {
    const outcomes = await syncDirtyMonths(appSyncDeps());
    revalidatePath("/", "layout");
    return summarize(outcomes);
  } catch (error) {
    return { ok: false, message: actionErrorMessage("Sinkronisasi", error) };
  }
}
