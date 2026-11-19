import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { syncDirtyMonths, syncMonth, type SyncDeps } from "@/lib/sync/service";
import { createPgSyncStore, createTestDatabase, type TestDatabase } from "./pg";
import { insertDealer, insertLead, insertService, monthRow, serviceSyncRow } from "./helpers";
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
  await db.admin.query(
    "truncate public.lead_handovers, public.spreadsheet_sync_logs, public.service_entries, public.leads, public.whatsapp_groups, public.dealers, public.sheet_months cascade",
  );
  dealerId = await insertDealer(db.pool, "DIPO GATSU", "JABODETABEK");
  sheets = new FakeSheets();
  deps = { store: createPgSyncStore(db.pool), getSheets: () => sheets, lockWaitMs: 15_000 };
});

/** Rows of the SERVICE block, excluding the empty placeholder rows. */
function serviceRows(title: string) {
  const grid = sheets.grid(title);
  const banner = grid.findIndex((row) => typeof row[9] === "string" && String(row[9]).startsWith("SERVICE "));
  expect(banner).toBeGreaterThanOrEqual(0);
  const out: (string | number | null)[][] = [];
  for (let r = banner + 2; r < grid.length; r++) {
    const cells = grid[r]!.slice(9, 17);
    if (cells.slice(1).every((c) => c === null)) continue;
    out.push(cells);
  }
  return out;
}

describe("service entries", () => {
  it("decides its reporting month the same way a lead does", async () => {
    const manual = await insertService(db.pool, dealerId, { entryDate: "2026-10-31", createdAt: "2026-11-19T03:00:00Z" });
    expect(manual.report_date).toBe("2026-10-31");
    expect((await serviceSyncRow(db.pool, manual.id))?.spreadsheet_month).toBe("2026-10");

    // 18:30 UTC is already the next day in Jakarta.
    const auto = await insertService(db.pool, dealerId, { createdAt: "2026-11-18T18:30:00Z" });
    expect(auto.report_date).toBe("2026-11-19");
  });

  it("never lets an edit rewrite created_at or the submission id", async () => {
    const entry = await insertService(db.pool, dealerId, { createdAt: "2026-11-19T03:00:00Z" });
    const before = (await db.pool.query("select created_at, submission_id from public.service_entries where id = $1", [entry.id])).rows[0];
    await db.pool.query(
      "update public.service_entries set name = 'Dina A.', created_at = '2000-01-01', submission_id = gen_random_uuid() where id = $1",
      [entry.id],
    );
    const after = (await db.pool.query("select name, created_at, submission_id from public.service_entries where id = $1", [entry.id])).rows[0];
    expect(after.name).toBe("Dina A.");
    expect(after.created_at.toISOString()).toBe(before.created_at.toISOString());
    expect(after.submission_id).toBe(before.submission_id);
  });

  it("queues its month and resets the queue entry on every edit", async () => {
    const entry = await insertService(db.pool, dealerId, { entryDate: "2026-11-05" });
    expect(await serviceSyncRow(db.pool, entry.id)).toMatchObject({ sync_status: "pending", spreadsheet_month: "2026-11" });

    await db.pool.query("update public.spreadsheet_sync_logs set sync_status = 'success' where service_id = $1", [entry.id]);
    const before = await serviceSyncRow(db.pool, entry.id);
    await db.pool.query("update public.service_entries set entry_date = '2026-10-20' where id = $1", [entry.id]);
    const after = await serviceSyncRow(db.pool, entry.id);
    expect(after).toMatchObject({ sync_status: "pending", spreadsheet_month: "2026-10" });
    expect(BigInt(after!.change_seq)).toBeGreaterThan(BigInt(before!.change_seq));
    expect(await monthRow(db.pool, "2026-11")).toMatchObject({ revision: "2" });
  });

  it("rejects an invalid source and a duplicate submission id", async () => {
    await expect(insertService(db.pool, dealerId, { source: "FACEBOOK" })).rejects.toMatchObject({ code: "23514" });
    const submission = randomUUID();
    const insert = () =>
      db.pool.query(
        `insert into public.service_entries (submission_id, dealer_id, name, location, unit, source)
         values ($1, $2, 'Juvi', 'Serpong', 'Xforce', 'GOOGLE')`,
        [submission, dealerId],
      );
    await insert();
    await expect(insert()).rejects.toMatchObject({ code: "23505" });
  });

  it("keeps anon and authenticated locked out", async () => {
    const client = await db.pool.connect();
    try {
      for (const role of ["anon", "authenticated"]) {
        await client.query(`set role ${role}`);
        await expect(client.query("select 1 from public.service_entries limit 1")).rejects.toMatchObject({ code: "42501" });
        await client.query("reset role");
      }
    } finally {
      client.release();
    }
  });
});

describe("service block on the monthly tab", () => {
  it("writes the DDC service columns beside the sales tables", async () => {
    await insertService(db.pool, dealerId, {
      name: "Dina Adrianti",
      location: "Rawamangun",
      unit: "Outlander",
      source: "GOOGLE",
      finalNote: "BOOKING SERVICE 10/11/2026 RECALL REM",
      entryDate: "2026-11-03",
    });
    expect(await syncMonth(deps, "2026-11")).toMatchObject({ status: "success" });

    const grid = sheets.grid("November 2026");
    expect(grid[0]![9]).toBe("SERVICE NOVEMBER 2026");
    expect(grid[1]!.slice(9, 17)).toEqual(["NO", "DEALER", "NAMA", "LOCATION", "UNIT", "FOLLOW UP", "SOURCE", "FINAL"]);
    expect(grid[2]!.slice(9, 17)).toEqual([
      1,
      "DIPO GATSU",
      "Dina Adrianti",
      "Rawamangun",
      "Outlander",
      46329, // 3 Nov 2026 as a Sheets serial date
      "GOOGLE",
      "BOOKING SERVICE 10/11/2026 RECALL REM",
    ]);
  });

  it("keeps the sales side untouched and numbers 30 service rows even when empty", async () => {
    await insertLead(db.pool, dealerId, { name: "Agus", leadDate: "2026-11-02", region: "JABODETABEK" });
    expect(await syncMonth(deps, "2026-11")).toMatchObject({ status: "success" });

    expect(sheets.regionRows("November 2026", "JABODETABEK").map((r) => r[1])).toEqual(["Agus"]);
    expect(serviceRows("November 2026")).toEqual([]);
    const grid = sheets.grid("November 2026");
    expect(grid[2]![9]).toBe(1);
    expect(grid[31]![9]).toBe(30); // banner + header + 30 numbered rows
  });

  it("sorts service rows oldest first and renumbers after a delete", async () => {
    const first = await insertService(db.pool, dealerId, { name: "Satu", entryDate: "2026-11-02" });
    await insertService(db.pool, dealerId, { name: "Dua", entryDate: "2026-11-09" });
    await insertService(db.pool, dealerId, { name: "Tiga", entryDate: "2026-11-20" });
    await syncMonth(deps, "2026-11");
    expect(serviceRows("November 2026").map((r) => [r[0], r[2]])).toEqual([
      [1, "Satu"],
      [2, "Dua"],
      [3, "Tiga"],
    ]);

    await db.pool.query("delete from public.service_entries where id = $1", [first.id]);
    expect(await syncDirtyMonths(deps)).toMatchObject([{ monthKey: "2026-11", status: "success" }]);
    expect(serviceRows("November 2026").map((r) => [r[0], r[2]])).toEqual([
      [1, "Dua"],
      [2, "Tiga"],
    ]);
  });

  it("sends sales and service of the same month in one go, then reports nothing pending", async () => {
    await insertLead(db.pool, dealerId, { name: "Agus", leadDate: "2026-11-02", region: "JABODETABEK" });
    const entry = await insertService(db.pool, dealerId, { name: "Dina", entryDate: "2026-11-03" });
    expect(await deps.store.findDirtyMonths()).toEqual(["2026-11"]);

    expect(await syncDirtyMonths(deps)).toMatchObject([{ status: "success" }]);
    expect(sheets.batchCalls).toBe(1);
    expect(await serviceSyncRow(db.pool, entry.id)).toMatchObject({ sync_status: "success" });
    expect(await deps.store.findDirtyMonths()).toEqual([]);
  });

  it("keeps a failed service entry queued for the next attempt", async () => {
    const entry = await insertService(db.pool, dealerId, { entryDate: "2026-11-05" });
    sheets.failNext = 1;
    expect(await syncDirtyMonths(deps)).toMatchObject([{ status: "failed" }]);
    expect(await serviceSyncRow(db.pool, entry.id)).toMatchObject({ sync_status: "failed", retry_count: 1 });

    expect(await syncDirtyMonths(deps)).toMatchObject([{ status: "success" }]);
    expect(await serviceSyncRow(db.pool, entry.id)).toMatchObject({ sync_status: "success" });
  });
});
