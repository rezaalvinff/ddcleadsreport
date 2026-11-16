import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { syncDirtyMonths, syncMonth, type SyncDeps } from "@/lib/sync/service";
import { createPgSyncStore, createTestDatabase, type TestDatabase } from "./pg";
import { insertDealer, insertLead, monthRow, syncRow } from "./helpers";
import { FakeSheets } from "../support/fake-sheets";

let db: TestDatabase;
let dealerId: string;
let sheets: FakeSheets;
let deps: SyncDeps;

beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.admin.query("truncate public.lead_handovers, public.spreadsheet_sync_logs, public.leads, public.whatsapp_groups, public.dealers, public.sheet_months cascade");
  dealerId = await insertDealer(db.pool, "DIPO Bandung");
  sheets = new FakeSheets();
  deps = { store: createPgSyncStore(db.pool), getSheets: () => sheets, lockWaitMs: 15_000 };
});

describe("monthly tab", () => {
  it("creates the month tab automatically and only once", async () => {
    const lead = await insertLead(db.pool, dealerId, { leadDate: "2026-11-10" });
    expect(await syncMonth(deps, "2026-11")).toMatchObject({ status: "success" });
    await insertLead(db.pool, dealerId, { leadDate: "2026-11-11" });
    expect(await syncMonth(deps, "2026-11")).toMatchObject({ status: "success" });

    expect(sheets.tabs.filter((t) => t.title === "November 2026")).toHaveLength(1);
    expect(sheets.addTabCalls).toBe(1);
    expect(await syncRow(db.pool, lead.id)).toMatchObject({ sync_status: "success" });
    const month = await monthRow(db.pool, "2026-11");
    expect(month?.synced_revision).toBe(month?.revision);
    expect(Number(month?.sheet_id)).toBe(sheets.tab("November 2026")!.sheetId);
  });

  it("keeps month tabs in chronological order", async () => {
    await insertLead(db.pool, dealerId, { leadDate: "2026-11-10" });
    await insertLead(db.pool, dealerId, { leadDate: "2026-09-10" });
    await insertLead(db.pool, dealerId, { leadDate: "2026-10-10" });
    await syncDirtyMonths(deps);
    const order = [...sheets.tabs].sort((a, b) => a.index - b.index).map((t) => t.title);
    expect(order).toEqual(["Sheet1", "September 2026", "October 2026", "November 2026"]);
  });

  it("does nothing when the month is already up to date", async () => {
    await insertLead(db.pool, dealerId, { leadDate: "2026-11-10" });
    await syncMonth(deps, "2026-11");
    const calls = sheets.batchCalls;
    await syncMonth(deps, "2026-11");
    expect(sheets.batchCalls).toBe(calls);
  });
});

describe("daily summary and regional tables", () => {
  beforeEach(async () => {
    const jkt = await insertDealer(db.pool, "DIPO Jakarta", "JABODETABEK");
    await insertLead(db.pool, dealerId, { name: "Ani", leadDate: "2026-11-02", source: "GOOGLE", region: "JAWA BARAT", phone: "081200000001" });
    await insertLead(db.pool, dealerId, { name: "Budi", leadDate: "2026-11-02", source: "META", region: "JAWA BARAT", followUp: "2026-11-20" });
    await insertLead(db.pool, jkt, { name: "Citra", leadDate: "2026-11-01", source: "TIKTOK", region: "JABODETABEK", domicile: "Bogor" });
    await insertLead(db.pool, jkt, { name: "Dodi", leadDate: "2026-11-30", source: "META", region: "SUMATERA & KALIMANTAN", domicile: "Medan" });
    // Different month and follow-up-only date: must not appear in November.
    await insertLead(db.pool, dealerId, { name: "Eko", leadDate: "2026-10-31", followUp: "2026-11-02", source: "GOOGLE" });
    await syncDirtyMonths(deps);
  });

  it("counts prospects per report date and source with total formulas", async () => {
    const grid = sheets.grid("November 2026");
    expect(grid[0]!.slice(0, 6)).toEqual(["NO", "HARI/TANGGAL", "SALES", null, null, "TOTAL"]);
    expect(grid[1]!.slice(2, 5)).toEqual(["GOOGLE", "META", "TIKTOK"]);
    expect(grid[2]!.slice(0, 6)).toEqual([1, "Minggu, 1 November 2026", 0, 0, 1, "=SUM(C3:E3)"]);
    expect(grid[3]!.slice(0, 6)).toEqual([2, "Senin, 2 November 2026", 1, 1, 0, "=SUM(C4:E4)"]);
    expect(grid[31]!.slice(0, 5)).toEqual([30, "Senin, 30 November 2026", 0, 1, 0]);
    expect(grid[32]!.slice(0, 6)).toEqual(["TOTAL", null, "=SUM(C3:C32)", "=SUM(D3:D32)", "=SUM(E3:E32)", "=SUM(F3:F32)"]);
    const sum = (col: number) => grid.slice(2, 32).reduce((n, row) => n + Number(row[col]), 0);
    expect([sum(2), sum(3), sum(4)]).toEqual([1, 2, 1]);
  });

  it("puts each prospect in its region's table, oldest first, with the exact columns", async () => {
    const grid = sheets.grid("November 2026");
    const titles = grid.map((r) => r[0]).filter((v) => typeof v === "string" && /^[A-Z &]+$/.test(v) && !["NO", "TOTAL"].includes(v));
    expect(titles).toEqual(["JABODETABEK", "JAWA BARAT", "BANTEN", "JAWA TIMUR", "SUMATERA & KALIMANTAN"]);
    const header = grid[grid.findIndex((r) => r[0] === "JABODETABEK") + 1];
    expect(header).toEqual(["NO", "NAMA", "NOMOR TLP", "LOCATION", "DEALER", "UNIT", "FOLLOW UP", "SOURCE"]);

    expect(sheets.regionRows("November 2026", "JAWA BARAT").map((r) => [r[0], r[1], r[2], r[7]])).toEqual([
      [1, "Ani", "081200000001", "GOOGLE"],
      [2, "Budi", "081234567890", "META"],
    ]);
    const budi = sheets.regionRows("November 2026", "JAWA BARAT")[1]!;
    expect(budi[6]).toBe(46346); // 20 Nov 2026 as a Sheets serial date
    expect(sheets.regionRows("November 2026", "JABODETABEK").map((r) => [r[1], r[3], r[4]])).toEqual([["Citra", "Bogor", "DIPO Jakarta"]]);
    expect(sheets.regionRows("November 2026", "BANTEN")).toEqual([]);
    expect(sheets.regionRows("November 2026", "SUMATERA & KALIMANTAN").map((r) => r[1])).toEqual(["Dodi"]);
    expect(sheets.regionRows("October 2026", "JAWA BARAT").map((r) => r[1])).toEqual(["Eko"]);
  });
});

describe("edits and deletions", () => {
  it("updates an edited record in place without duplicating it", async () => {
    const lead = await insertLead(db.pool, dealerId, { name: "Ani", leadDate: "2026-11-05" });
    await syncMonth(deps, "2026-11");
    await db.pool.query("update public.leads set name = 'Ani Rahma', unit = 'Destinator' where id = $1", [lead.id]);
    expect(await syncRow(db.pool, lead.id)).toMatchObject({ sync_status: "pending" });
    await syncMonth(deps, "2026-11");
    const rows = sheets.regionRows("November 2026", "JAWA BARAT");
    expect(rows.map((r) => [r[1], r[5]])).toEqual([["Ani Rahma", "Destinator"]]);
    expect(await syncRow(db.pool, lead.id)).toMatchObject({ sync_status: "success" });
  });

  it("moves a record between months and regions", async () => {
    const lead = await insertLead(db.pool, dealerId, { name: "Ani", leadDate: "2026-11-05" });
    await syncMonth(deps, "2026-11");
    await db.pool.query("update public.leads set lead_date = '2026-10-30', reporting_region = 'BANTEN' where id = $1", [lead.id]);
    const outcomes = await syncDirtyMonths(deps);
    expect(outcomes.map((o) => [o.monthKey, o.status])).toEqual([["2026-10", "success"], ["2026-11", "success"]]);
    expect(sheets.regionRows("November 2026", "JAWA BARAT")).toEqual([]);
    expect(sheets.regionRows("October 2026", "BANTEN").map((r) => r[1])).toEqual(["Ani"]);
    expect(sheets.grid("November 2026")[6]![3]).toBe(0);
  });

  it("removes a deleted record and recalculates the summary", async () => {
    const a = await insertLead(db.pool, dealerId, { name: "Ani", leadDate: "2026-11-05", source: "META" });
    await insertLead(db.pool, dealerId, { name: "Budi", leadDate: "2026-11-05", source: "META" });
    await syncMonth(deps, "2026-11");
    expect(sheets.grid("November 2026")[6]![3]).toBe(2);
    await db.pool.query("delete from public.leads where id = $1", [a.id]);
    expect(await syncDirtyMonths(deps)).toMatchObject([{ monthKey: "2026-11", status: "success" }]);
    expect(sheets.regionRows("November 2026", "JAWA BARAT").map((r) => [r[0], r[1]])).toEqual([[1, "Budi"]]);
    expect(sheets.grid("November 2026")[6]![3]).toBe(1);
  });
});

describe("failures and retries", () => {
  it("keeps the lead, records the failure and succeeds on retry", async () => {
    const lead = await insertLead(db.pool, dealerId, { leadDate: "2026-11-05" });
    sheets.failNext = 2; // first attempt (incl. no retry inside the fake) fails
    const first = await syncMonth(deps, "2026-11");
    expect(first).toMatchObject({ status: "failed" });
    expect(await syncRow(db.pool, lead.id)).toMatchObject({ sync_status: "failed", retry_count: 1 });
    expect((await monthRow(db.pool, "2026-11"))?.last_error).toContain("503");
    expect((await db.pool.query("select count(*)::int as n from public.leads")).rows[0].n).toBe(1);

    expect(await syncMonth(deps, "2026-11")).toMatchObject({ status: "failed" });
    expect(await syncRow(db.pool, lead.id)).toMatchObject({ sync_status: "failed", retry_count: 2 });

    expect(await syncDirtyMonths(deps)).toMatchObject([{ status: "success" }]);
    expect(await syncRow(db.pool, lead.id)).toMatchObject({ sync_status: "success", error_message: null });
    expect((await monthRow(db.pool, "2026-11"))?.last_error).toBeNull();
    expect(sheets.regionRows("November 2026", "JAWA BARAT")).toHaveLength(1);
  });

  it("records a missing Google configuration as a failed sync, not a success", async () => {
    const lead = await insertLead(db.pool, dealerId, { leadDate: "2026-11-05" });
    const outcome = await syncMonth({
      ...deps,
      getSheets: () => {
        throw new Error("Konfigurasi sheets belum lengkap: GOOGLE_PRIVATE_KEY belum diisi");
      },
    }, "2026-11");
    expect(outcome).toMatchObject({ status: "failed", error: expect.stringContaining("GOOGLE_PRIVATE_KEY") });
    expect(await syncRow(db.pool, lead.id)).toMatchObject({ sync_status: "failed" });
  });
});

describe("concurrency", () => {
  it("never loses or duplicates prospects when submissions and syncs run in parallel", async () => {
    const work = Array.from({ length: 12 }, async (_, i) => {
      await insertLead(db.pool, dealerId, { name: `Prospek ${String(i).padStart(2, "0")}`, leadDate: "2026-11-07", phone: `08120000${String(i).padStart(4, "0")}` });
      return syncMonth(deps, "2026-11");
    });
    const outcomes = await Promise.all(work);
    expect(outcomes.every((o) => o.status === "success")).toBe(true);
    expect(sheets.addTabCalls).toBe(1);
    const names = sheets.regionRows("November 2026", "JAWA BARAT").map((r) => r[1]);
    expect(names).toHaveLength(12);
    expect(new Set(names).size).toBe(12);
    const open = await db.pool.query("select count(*)::int as n from public.spreadsheet_sync_logs where sync_status <> 'success'");
    expect(open.rows[0].n).toBe(0);
  });

  it("re-syncs a lead that changed while the sheet was being written", async () => {
    const lead = await insertLead(db.pool, dealerId, { name: "Ani", leadDate: "2026-11-05" });
    let edited = false;
    sheets.onBatch = async () => {
      if (edited) return;
      edited = true;
      await db.pool.query("update public.leads set name = 'Ani Baru' where id = $1", [lead.id]);
    };
    expect(await syncMonth(deps, "2026-11")).toMatchObject({ status: "success" });
    expect(sheets.regionRows("November 2026", "JAWA BARAT").map((r) => r[1])).toEqual(["Ani Baru"]);
    expect(sheets.batchCalls).toBe(2);
    expect(await syncRow(db.pool, lead.id)).toMatchObject({ sync_status: "success" });
  });

  it("reports busy instead of writing when another sync holds the lock", async () => {
    await insertLead(db.pool, dealerId, { leadDate: "2026-11-05" });
    await db.pool.query("select public.try_acquire_sheet_lock('2026-11', gen_random_uuid(), 60)");
    expect(await syncMonth({ ...deps, lockWaitMs: 0 }, "2026-11")).toEqual({ monthKey: "2026-11", status: "busy" });
    expect(sheets.batchCalls).toBe(0);
  });
});
