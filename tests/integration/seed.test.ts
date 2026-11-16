import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REPORTING_REGIONS } from "@/lib/constants";
import { matchLocation } from "@/lib/location/match";
import { createTestDatabase, type TestDatabase } from "./pg";

const SEED = readFileSync(path.resolve(import.meta.dirname, "../../supabase/seed/001_master_cabang.sql"), "utf8");

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.pool.query(SEED);
});
afterAll(async () => {
  await db?.close();
});

describe("master data seed", () => {
  it("loads every DDC group exactly once", async () => {
    const r = await db.pool.query("select count(*)::int as n from public.whatsapp_groups");
    expect(r.rows[0].n).toBe(37);
  });

  it("loads the dealers and links each branch group to its dealer", async () => {
    const dealers = await db.pool.query("select count(*)::int as n from public.dealers");
    expect(dealers.rows[0].n).toBe(31);

    // Only the area/combined groups and the three unverified ones have no dealer.
    const unlinked = await db.pool.query(
      "select group_name from public.whatsapp_groups where dealer_id is null order by group_name",
    );
    expect(unlinked.rows.map((r) => r.group_name)).toEqual([
      "DDC BANDA ACEH & MEULABOH",
      "DDC BANTEN AREA",
      "DDC DIPO GATOT SUBROTO",
      "DDC DIPO SENEJA",
      "DDC DIPO SERANG GROUP",
      "DDC KRAKATAU",
    ]);
  });

  it("gives a linked group the same reporting region as its dealer", async () => {
    const r = await db.pool.query(
      `select g.group_name from public.whatsapp_groups g
         join public.dealers d on d.id = g.dealer_id
        where g.reporting_region <> d.reporting_region`,
    );
    expect(r.rows).toEqual([]);
  });

  it("spreads the groups across all five reporting regions", async () => {
    const r = await db.pool.query(
      "select reporting_region, count(*)::int as n from public.whatsapp_groups group by 1 order by 1",
    );
    expect(Object.fromEntries(r.rows.map((x) => [x.reporting_region, x.n]))).toEqual({
      "JABODETABEK": 6, // 5 cabang + Gatot Subroto (nonaktif, masih tebakan)
      "JAWA BARAT": 3,
      "BANTEN": 9, // 5 cabang + Serang Group + Banten Area + Seneja/Krakatau (nonaktif)
      "JAWA TIMUR": 4,
      "SUMATERA & KALIMANTAN": 15,
    });
    expect(REPORTING_REGIONS).toHaveLength(5);
  });

  it("deactivates exactly the groups whose location is not confirmed", async () => {
    const r = await db.pool.query("select group_name from public.whatsapp_groups where not is_active order by group_name");
    expect(r.rows.map((x) => x.group_name)).toEqual(["DDC DIPO GATOT SUBROTO", "DDC DIPO SENEJA", "DDC KRAKATAU"]);
  });

  it("gives every dealer a city that the app's own classifier maps to its declared region", async () => {
    const dealers = await db.pool.query("select dealer_name, city, province, reporting_region from public.dealers");
    const mismatches = dealers.rows.flatMap((d) => {
      const match = matchLocation(`${d.city}, ${d.province}`);
      if (match.kind !== "resolved") return [`${d.dealer_name}: "${d.city}, ${d.province}" tidak dikenali (${match.kind})`];
      if (match.place.region !== d.reporting_region) {
        return [`${d.dealer_name}: ${d.city} seharusnya ${match.place.region}, bukan ${d.reporting_region}`];
      }
      return [];
    });
    expect(mismatches).toEqual([]);
  });

  it("leaves the group invite links empty so no name is mistaken for a link", async () => {
    const r = await db.pool.query("select count(*)::int as n from public.whatsapp_groups where group_link is not null");
    expect(r.rows[0].n).toBe(0);
  });

  it("can be re-run without creating duplicates", async () => {
    await db.pool.query(SEED);
    const groups = await db.pool.query("select count(*)::int as n from public.whatsapp_groups");
    const dealers = await db.pool.query("select count(*)::int as n from public.dealers");
    expect([groups.rows[0].n, dealers.rows[0].n]).toEqual([37, 31]);
  });
});
