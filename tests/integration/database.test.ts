import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./pg";
import { insertDealer, insertLead, monthRow, syncRow } from "./helpers";

let db: TestDatabase;
let dealerId: string;

beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.admin.query("truncate public.lead_handovers, public.spreadsheet_sync_logs, public.leads, public.whatsapp_groups, public.dealers, public.sheet_months, public.region_mappings cascade");
  dealerId = await insertDealer(db.pool);
});

describe("lead insertion and report_date", () => {
  it("uses the manual prospect date as report_date", async () => {
    const lead = await insertLead(db.pool, dealerId, { leadDate: "2026-11-10", createdAt: "2026-11-16T03:00:00Z" });
    expect(lead.report_date).toBe("2026-11-10");
  });

  it("uses the submission date in Asia/Jakarta when no prospect date is given", async () => {
    // 18:30 UTC on 15 Nov is 01:30 on 16 Nov in Jakarta.
    const lead = await insertLead(db.pool, dealerId, { createdAt: "2026-11-15T18:30:00Z" });
    expect(lead.report_date).toBe("2026-11-16");
  });

  it("files a late entry under its own (previous) month", async () => {
    const lead = await insertLead(db.pool, dealerId, { leadDate: "2026-10-31", createdAt: "2026-11-16T03:00:00Z" });
    expect(lead.report_date).toBe("2026-10-31");
    expect((await syncRow(db.pool, lead.id))?.spreadsheet_month).toBe("2026-10");
    expect(await monthRow(db.pool, "2026-10")).toMatchObject({ revision: "1", synced_revision: "0" });
    expect(await monthRow(db.pool, "2026-11")).toBeUndefined();
  });

  it("ignores the follow-up date for the reporting month", async () => {
    const lead = await insertLead(db.pool, dealerId, { leadDate: "2026-11-10", followUp: "2026-12-05" });
    expect(lead.report_date).toBe("2026-11-10");
    expect((await syncRow(db.pool, lead.id))?.spreadsheet_month).toBe("2026-11");
  });

  it("creates a pending sync row in the same transaction", async () => {
    const lead = await insertLead(db.pool, dealerId, { leadDate: "2026-11-10" });
    expect(await syncRow(db.pool, lead.id)).toMatchObject({ sync_status: "pending", retry_count: 0 });
  });

  it("ignores a report_date sent by the client", async () => {
    const r = await db.pool.query(
      `insert into public.leads (submission_id, name, phone, domicile, reporting_region, classification_status, lead_date, report_date, dealer_id, unit, source)
       values ($1, 'Ani', '081111111111', 'Bogor', 'JABODETABEK', 'mapped', '2026-11-03', '2020-01-01', $2, 'Xforce', 'GOOGLE')
       returning to_char(report_date, 'YYYY-MM-DD') as report_date`,
      [randomUUID(), dealerId],
    );
    expect(r.rows[0].report_date).toBe("2026-11-03");
  });
});

describe("catatan customer", () => {
  it("stores the note and keeps it through an edit", async () => {
    const note = "Cust terakhir minta info angsuran untuk DP 50 juta";
    const lead = await insertLead(db.pool, dealerId);
    await db.pool.query("update public.leads set customer_note = $2 where id = $1", [lead.id, note]);
    const after = await db.pool.query("select customer_note from public.leads where id = $1", [lead.id]);
    expect(after.rows[0].customer_note).toBe(note);

    await db.pool.query("update public.leads set name = 'Nama Baru' where id = $1", [lead.id]);
    const kept = await db.pool.query("select customer_note from public.leads where id = $1", [lead.id]);
    expect(kept.rows[0].customer_note).toBe(note);
  });

  it("defaults to empty and rejects a note that is too long or blank", async () => {
    const lead = await insertLead(db.pool, dealerId, { phone: "081288887777" });
    const fresh = await db.pool.query("select customer_note from public.leads where id = $1", [lead.id]);
    expect(fresh.rows[0].customer_note).toBeNull();

    await expect(
      db.pool.query("update public.leads set customer_note = $2 where id = $1", [lead.id, "x".repeat(501)]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.pool.query("update public.leads set customer_note = '   ' where id = $1", [lead.id]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("lead editing", () => {
  it("never overwrites created_at or the submission id", async () => {
    const lead = await insertLead(db.pool, dealerId, { createdAt: "2026-11-16T03:00:00Z" });
    const before = (await db.pool.query("select created_at, submission_id from public.leads where id = $1", [lead.id])).rows[0];
    await db.pool.query(
      "update public.leads set name = 'Budi S.', created_at = '2000-01-01', submission_id = gen_random_uuid() where id = $1",
      [lead.id],
    );
    const after = (await db.pool.query("select name, created_at, submission_id, updated_at from public.leads where id = $1", [lead.id])).rows[0];
    expect(after.name).toBe("Budi S.");
    expect(after.created_at.toISOString()).toBe(before.created_at.toISOString());
    expect(after.submission_id).toBe(before.submission_id);
    expect(after.updated_at.getTime()).toBeGreaterThan(before.created_at.getTime());
  });

  it("recomputes report_date from created_at when the prospect date is cleared", async () => {
    const lead = await insertLead(db.pool, dealerId, { leadDate: "2026-10-20", createdAt: "2026-11-16T03:00:00Z" });
    const r = await db.pool.query(
      "update public.leads set lead_date = null where id = $1 returning to_char(report_date, 'YYYY-MM-DD') as report_date",
      [lead.id],
    );
    expect(r.rows[0].report_date).toBe("2026-11-16");
  });

  it("marks both months dirty and resets the sync row when an edit moves a lead to another month", async () => {
    const lead = await insertLead(db.pool, dealerId, { leadDate: "2026-10-20" });
    await db.pool.query("update public.spreadsheet_sync_logs set sync_status = 'success' where lead_id = $1", [lead.id]);
    const before = await syncRow(db.pool, lead.id);
    await db.pool.query("update public.leads set lead_date = '2026-11-02' where id = $1", [lead.id]);
    const after = await syncRow(db.pool, lead.id);
    expect(after).toMatchObject({ sync_status: "pending", spreadsheet_month: "2026-11" });
    expect(BigInt(after!.change_seq)).toBeGreaterThan(BigInt(before!.change_seq));
    expect(await monthRow(db.pool, "2026-10")).toMatchObject({ revision: "2" });
    expect(await monthRow(db.pool, "2026-11")).toMatchObject({ revision: "1" });
  });
});

describe("lead deletion", () => {
  it("removes the sync row and marks the month dirty", async () => {
    const lead = await insertLead(db.pool, dealerId, { leadDate: "2026-11-05" });
    await db.pool.query("delete from public.leads where id = $1", [lead.id]);
    expect(await syncRow(db.pool, lead.id)).toBeUndefined();
    expect(await monthRow(db.pool, "2026-11")).toMatchObject({ revision: "2" });
  });

  it("refuses to delete a dealer that still has prospects", async () => {
    await insertLead(db.pool, dealerId);
    await expect(db.pool.query("delete from public.dealers where id = $1", [dealerId])).rejects.toMatchObject({ code: "23503" });
  });
});

describe("duplicates and validation", () => {
  it("rejects a second insert with the same submission id (idempotency)", async () => {
    const submission = randomUUID();
    const insert = () =>
      db.pool.query(
        `insert into public.leads (submission_id, name, phone, domicile, reporting_region, classification_status, dealer_id, unit, source)
         values ($1, 'Ani', '081111111111', 'Bogor', 'JABODETABEK', 'mapped', $2, 'Xforce', 'GOOGLE')`,
        [submission, dealerId],
      );
    await insert();
    await expect(insert()).rejects.toMatchObject({ code: "23505" });
    expect((await db.pool.query("select count(*)::int as n from public.leads")).rows[0].n).toBe(1);
  });

  it("allows the same phone number twice (the app warns instead of rejecting)", async () => {
    await insertLead(db.pool, dealerId, { phone: "081299990000" });
    await insertLead(db.pool, dealerId, { phone: "081299990000" });
    const r = await db.pool.query("select count(*)::int as n from public.leads where phone = '081299990000'");
    expect(r.rows[0].n).toBe(2);
  });

  it.each([
    ["phone", { phone: "+6281234" }],
    ["region", { region: "JAWA TENGAH" }],
    ["source", { source: "FACEBOOK" }],
    ["name", { name: " " }],
  ])("rejects an invalid %s", async (_label, fields) => {
    await expect(insertLead(db.pool, dealerId, fields)).rejects.toMatchObject({ code: "23514" });
  });

  it("only accepts official WhatsApp group invite links", async () => {
    const insert = (link: string) =>
      db.pool.query("insert into public.whatsapp_groups (group_name, reporting_region, group_link) values ($1, 'BANTEN', $2)", [
        `Grup ${randomUUID()}`,
        link,
      ]);
    await expect(insert("https://example.com/grup")).rejects.toMatchObject({ code: "23514" });
    await expect(insert("https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv")).resolves.toBeTruthy();
  });

  it("enforces unique dealer names case-insensitively", async () => {
    await expect(insertDealer(db.pool, "dipo test bandung")).rejects.toMatchObject({ code: "23505" });
  });
});

describe("row-level security and privileges", () => {
  it.each(["anon", "authenticated"])("denies the %s role any access to application tables and functions", async (role) => {
    const client = await db.pool.connect();
    try {
      expect((await client.query("select current_user as u")).rows[0].u).toBe("service_role");
      await client.query(`set role ${role}`);
      for (const table of ["leads", "dealers", "whatsapp_groups", "region_mappings", "sheet_months", "spreadsheet_sync_logs", "lead_handovers"]) {
        await expect(client.query(`select 1 from public.${table} limit 1`)).rejects.toMatchObject({ code: "42501" });
      }
      await expect(client.query("select public.try_acquire_sheet_lock('2026-11', gen_random_uuid(), 10)")).rejects.toMatchObject({
        code: "42501",
      });
    } finally {
      await client.query("reset role");
      client.release();
    }
  });

  it("enables RLS on every table", async () => {
    const r = await db.admin.query(
      "select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity",
    );
    expect(r.rows).toEqual([]);
  });
});

describe("sheet lock", () => {
  it("is exclusive until released or expired", async () => {
    const a = randomUUID();
    const b = randomUUID();
    const acquire = async (token: string, ttl = 60) =>
      (await db.pool.query("select public.try_acquire_sheet_lock('2026-11', $1, $2) as ok", [token, ttl])).rows[0].ok;
    expect(await acquire(a)).toBe(true);
    expect(await acquire(b)).toBe(false);
    expect(await acquire(a)).toBe(true); // lease extension
    await db.pool.query("select public.release_sheet_lock('2026-11', $1)", [a]);
    expect(await acquire(b, 0)).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(await acquire(a)).toBe(true); // b's zero-second lease expired
  });
});
