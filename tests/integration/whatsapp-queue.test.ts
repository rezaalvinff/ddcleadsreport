import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./pg";
import { insertDealer, insertLead } from "./helpers";

let db: TestDatabase;
let dealerId: string;
let groupId: string;
let leadId: string;

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
  dealerId = await insertDealer(db.pool, "DIPO TANGERANG", "BANTEN");
  const g = await db.pool.query(
    "insert into public.whatsapp_groups (group_name, dealer_id, reporting_region) values ('DDC DIPO TANGERANG', $1, 'BANTEN') returning id",
    [dealerId],
  );
  groupId = g.rows[0].id;
  const lead = await insertLead(db.pool, dealerId, { name: "Budi", domicile: "Tangerang", region: "BANTEN", unit: "Xforce HEV" });
  leadId = lead.id;
});

async function queue(): Promise<string> {
  const r = await db.pool.query(
    `insert into public.lead_handovers (lead_id, whatsapp_group_id, auto_status, auto_queued_at)
     values ($1, $2, 'queued', now()) returning id`,
    [leadId, groupId],
  );
  return r.rows[0].id;
}

const claim = (limit = 5, stale = 120) =>
  db.pool.query("select * from public.claim_whatsapp_sends($1, $2)", [limit, stale]);

const row = async (id: string) =>
  (await db.pool.query("select * from public.lead_handovers where id = $1", [id])).rows[0];

describe("claiming work", () => {
  it("hands over the lead and group details the worker needs", async () => {
    const id = await queue();
    const r = await claim();
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      handover_id: id,
      group_name: "DDC DIPO TANGERANG",
      lead_name: "Budi",
      domicile: "Tangerang",
      unit: "Xforce HEV",
      source: "META",
      phone: "081234567890",
    });
  });

  it("marks a claimed row as sending so a second poll skips it", async () => {
    const id = await queue();
    expect((await claim()).rows).toHaveLength(1);
    expect(await row(id)).toMatchObject({ auto_status: "sending", auto_attempts: 1 });
    expect((await claim()).rows).toHaveLength(0);
  });

  it("respects the batch limit and takes the oldest first", async () => {
    const second = await db.pool.query(
      "insert into public.whatsapp_groups (group_name, reporting_region) values ('DDC BANTEN AREA', 'BANTEN') returning id",
    );
    const older = await queue();
    await db.pool.query("update public.lead_handovers set auto_queued_at = now() - interval '1 hour' where id = $1", [older]);
    const newer = await db.pool.query(
      `insert into public.lead_handovers (lead_id, whatsapp_group_id, auto_status, auto_queued_at)
       values ($1, $2, 'queued', now()) returning id`,
      [leadId, second.rows[0].id],
    );

    const first = await claim(1);
    expect(first.rows.map((r) => r.handover_id)).toEqual([older]);
    const rest = await claim(1);
    expect(rest.rows.map((r) => r.handover_id)).toEqual([newer.rows[0].id]);
  });

  it("retakes a row left in sending by a crashed worker, but not a fresh one", async () => {
    const id = await queue();
    await claim();
    expect((await claim(5, 120)).rows).toHaveLength(0);
    await db.pool.query("update public.lead_handovers set auto_updated_at = now() - interval '10 minutes' where id = $1", [id]);
    const again = await claim(5, 120);
    expect(again.rows).toHaveLength(1);
    expect(await row(id)).toMatchObject({ auto_attempts: 2 });
  });

  it("ignores handovers that were never queued", async () => {
    await db.pool.query("insert into public.lead_handovers (lead_id, whatsapp_group_id) values ($1, $2)", [leadId, groupId]);
    expect((await claim()).rows).toHaveLength(0);
  });
});

describe("reporting the result", () => {
  it("marks a successful send sent and counts it as sent", async () => {
    const id = await queue();
    await claim();
    await db.pool.query("select public.finish_whatsapp_send($1, true, null)", [id]);
    const after = await row(id);
    expect(after).toMatchObject({ auto_status: "sent", auto_error: null });
    expect(after.sent_marked_at).not.toBeNull();
  });

  it("records a failure with its reason and leaves it unsent", async () => {
    const id = await queue();
    await claim();
    await db.pool.query("select public.finish_whatsapp_send($1, false, $2)", [id, 'Grup "DDC X" tidak ditemukan']);
    const after = await row(id);
    expect(after).toMatchObject({ auto_status: "failed" });
    expect(after.auto_error).toContain("tidak ditemukan");
    expect(after.sent_marked_at).toBeNull();
  });

  it("never clears a manual confirmation that was already made", async () => {
    const id = await queue();
    await db.pool.query("update public.lead_handovers set sent_marked_at = '2026-11-01T00:00:00Z' where id = $1", [id]);
    await claim();
    await db.pool.query("select public.finish_whatsapp_send($1, false, 'gagal')", [id]);
    expect((await row(id)).sent_marked_at).not.toBeNull();
  });

  it("truncates a very long error instead of failing", async () => {
    const id = await queue();
    await claim();
    await db.pool.query("select public.finish_whatsapp_send($1, false, $2)", [id, "x".repeat(2000)]);
    expect((await row(id)).auto_error).toHaveLength(500);
  });
});

describe("queueing", () => {
  it("leaves an already-sent handover out of the queue", async () => {
    const r = await db.pool.query(
      `insert into public.lead_handovers (lead_id, whatsapp_group_id, sent_marked_at)
       values ($1, $2, now()) returning id`,
      [leadId, groupId],
    );
    await db.pool.query(
      "update public.lead_handovers set auto_status = 'queued', auto_queued_at = now() where lead_id = $1 and sent_marked_at is null",
      [leadId],
    );
    expect(await row(r.rows[0].id)).toMatchObject({ auto_status: null });
  });

  it("only accepts the four known statuses", async () => {
    const id = await queue();
    await expect(
      db.pool.query("update public.lead_handovers set auto_status = 'terkirim' where id = $1", [id]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
