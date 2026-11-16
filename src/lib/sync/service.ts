import { randomUUID } from "node:crypto";
import { monthKeyFromSheetTitle, sheetTitleForMonth } from "../dates";
import type { SheetTab, SheetsGateway } from "../sheets/gateway";
import { buildMonthLayout, buildSheetRequests } from "../sheets/layout";
import type { SyncStore } from "./store";

/**
 * Supabase is the source of truth. A month tab is rebuilt from the database
 * under a per-month lock:
 *
 *   1. read the month revision R and the open per-lead sync rows P (id + change_seq)
 *   2. read every lead of the month
 *   3. rewrite the tab in one atomic batchUpdate
 *   4. mark the month synced up to R and the rows in P successful (only if their
 *      change_seq is unchanged)
 *
 * Lead writes bump the revision and reset the sync row in the same transaction
 * (database trigger), so anything in P is guaranteed to be in the snapshot of
 * step 2, and changes made during a run stay pending for the next iteration.
 */

export interface SyncDeps {
  store: SyncStore;
  /** Lazily created so a missing Google configuration is recorded as a sync failure. */
  getSheets: () => SheetsGateway;
  lockWaitMs?: number;
}

export type MonthSyncOutcome =
  | { monthKey: string; status: "success"; sheetId: number | null }
  | { monthKey: string; status: "failed"; error: string }
  | { monthKey: string; status: "busy" };

const LOCK_TTL_SECONDS = 120;
const LOCK_POLL_MS = 400;
const MAX_ITERATIONS = 5;

async function acquireLock(store: SyncStore, monthKey: string, token: string, waitMs: number): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    if (await store.tryAcquireLock(monthKey, token, LOCK_TTL_SECONDS)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
  }
}

function insertIndexFor(monthKey: string, tabs: SheetTab[]): number {
  const monthTabs = tabs
    .map((tab) => ({ tab, key: monthKeyFromSheetTitle(tab.title) }))
    .filter((t): t is { tab: SheetTab; key: string } => t.key !== null)
    .sort((a, b) => a.tab.index - b.tab.index);
  const later = monthTabs.find((t) => t.key > monthKey);
  if (later) return later.tab.index;
  const last = monthTabs.at(-1);
  return last ? last.tab.index + 1 : tabs.length;
}

/** Finds the month tab by title or creates it; never creates a duplicate. */
export async function ensureMonthTab(sheets: SheetsGateway, monthKey: string): Promise<SheetTab> {
  const title = sheetTitleForMonth(monthKey);
  const find = (tabs: SheetTab[]) => tabs.find((t) => t.title.trim().toLowerCase() === title.toLowerCase());
  const { tabs } = await sheets.getSpreadsheet();
  const existing = find(tabs);
  if (existing) return existing;
  try {
    return await sheets.addTab(title, insertIndexFor(monthKey, tabs));
  } catch (error) {
    // Created elsewhere in the meantime (e.g. manually): use that tab.
    const again = find((await sheets.getSpreadsheet()).tabs);
    if (again) return again;
    throw error;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function syncMonth(deps: SyncDeps, monthKey: string): Promise<MonthSyncOutcome> {
  const { store } = deps;
  const token = randomUUID();
  if (!(await acquireLock(store, monthKey, token, deps.lockWaitMs ?? 20_000))) {
    return { monthKey, status: "busy" };
  }

  try {
    let sheetId: number | null = null;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // Re-acquiring with the same token extends the lease.
      if (i > 0 && !(await store.tryAcquireLock(monthKey, token, LOCK_TTL_SECONDS))) {
        throw new Error("Lock sinkronisasi kedaluwarsa.");
      }
      const month = await store.getMonthState(monthKey);
      const open = await store.getOpenSyncRows(monthKey);
      if (month.revision <= month.syncedRevision && open.length === 0) {
        return { monthKey, status: "success", sheetId: sheetId ?? month.sheetId };
      }

      const leads = await store.loadMonthLeads(monthKey);
      const sheets = deps.getSheets();
      const tab = await ensureMonthTab(sheets, monthKey);
      await sheets.batchUpdate(buildSheetRequests(buildMonthLayout(monthKey, leads), tab.sheetId, tab));
      await store.completeSync(monthKey, token, month.revision, tab.sheetId, open);
      sheetId = tab.sheetId;
    }
    return { monthKey, status: "success", sheetId };
  } catch (error) {
    const message = errorMessage(error);
    try {
      await store.failSync(monthKey, message);
    } catch (recordError) {
      console.error(`Gagal mencatat kegagalan sinkronisasi ${monthKey}:`, recordError);
    }
    return { monthKey, status: "failed", error: message };
  } finally {
    try {
      await store.releaseLock(monthKey, token);
    } catch (releaseError) {
      // The lease expires on its own after LOCK_TTL_SECONDS.
      console.error(`Gagal melepas lock ${monthKey}:`, releaseError);
    }
  }
}

export async function syncMonths(deps: SyncDeps, monthKeys: string[]): Promise<MonthSyncOutcome[]> {
  const outcomes: MonthSyncOutcome[] = [];
  for (const key of [...new Set(monthKeys)].sort()) outcomes.push(await syncMonth(deps, key));
  return outcomes;
}

export async function syncDirtyMonths(deps: SyncDeps): Promise<MonthSyncOutcome[]> {
  return syncMonths(deps, await deps.store.findDirtyMonths());
}
