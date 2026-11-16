import { describe, expect, it } from "vitest";
import { REPORTING_REGIONS } from "@/lib/constants";
import { buildMonthLayout, buildSheetRequests, COLORS, REGION_TABLE_COLUMNS, type SheetLead } from "@/lib/sheets/layout";

let n = 0;
const lead = (over: Partial<SheetLead>): SheetLead => ({
  id: `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}`,
  name: "Prospek",
  phone: "081234567890",
  domicile: "Bandung",
  dealerName: "DIPO Bandung",
  unit: "Xpander",
  source: "META",
  reportDate: "2026-11-02",
  createdAt: "2026-11-02T03:00:00.000Z",
  region: "JAWA BARAT",
  ...over,
});

const value = (layout: ReturnType<typeof buildMonthLayout>, r: number, c: number) => layout.rows[r]![c]!.value;

describe("daily source summary", () => {
  const layout = buildMonthLayout("2026-11", [
    lead({ source: "GOOGLE", reportDate: "2026-11-01" }),
    lead({ source: "META", reportDate: "2026-11-01" }),
    lead({ source: "META", reportDate: "2026-11-30" }),
    lead({ source: "TIKTOK", reportDate: "2026-11-15" }),
  ]);

  it("has the NO / HARI/TANGGAL / SALES (GOOGLE, META, TIKTOK) / TOTAL header with merges", () => {
    expect([value(layout, 0, 0), value(layout, 0, 1), value(layout, 0, 2), value(layout, 0, 5)]).toEqual(["NO", "HARI/TANGGAL", "SALES", "TOTAL"]);
    expect([value(layout, 1, 2), value(layout, 1, 3), value(layout, 1, 4)]).toEqual(["GOOGLE", "META", "TIKTOK"]);
    expect(layout.merges).toEqual(expect.arrayContaining([
      { row: 0, col: 0, rowSpan: 2, colSpan: 1 },
      { row: 0, col: 1, rowSpan: 2, colSpan: 1 },
      { row: 0, col: 2, rowSpan: 1, colSpan: 3 },
      { row: 0, col: 5, rowSpan: 2, colSpan: 1 },
    ]));
  });

  it("has one row per day with counts by report_date (not follow-up date)", () => {
    expect(layout.summary.dayCount).toBe(30);
    const day = (d: number) => layout.rows[layout.summary.firstDayRow + d - 1]!;
    expect(day(1).slice(2, 5).map((c) => c.value)).toEqual([1, 1, 0]);
    expect(day(3).slice(2, 5).map((c) => c.value)).toEqual([0, 0, 0]);
    expect(day(15).slice(2, 5).map((c) => c.value)).toEqual([0, 0, 1]);
    expect(day(30).slice(2, 5).map((c) => c.value)).toEqual([0, 1, 0]);
    expect(day(30)[5]!.value).toEqual({ formula: "=SUM(C32:E32)" });
  });

  it("ends with a light-green TOTAL row summing every source and the grand total", () => {
    const total = layout.rows[layout.summary.totalRow]!;
    expect(total.map((c) => c.value).slice(0, 6)).toEqual([
      "TOTAL", null, { formula: "=SUM(C3:C32)" }, { formula: "=SUM(D3:D32)" }, { formula: "=SUM(E3:E32)" }, { formula: "=SUM(F3:F32)" },
    ]);
    const requests = buildSheetRequests(layout, 7, { rowCount: 1000, columnCount: 26 });
    const write = requests.find((r) => r.updateCells?.rows)!.updateCells!;
    const totalCell = write.rows![layout.summary.totalRow]!.values![2]!;
    expect(totalCell.userEnteredFormat?.backgroundColor).toEqual(COLORS.lightGreen);
    expect(write.rows![0]!.values![0]!.userEnteredFormat?.backgroundColor).toEqual(COLORS.yellow);
    expect(write.rows![1]!.values![2]!.userEnteredFormat?.backgroundColor).toEqual(COLORS.green);
    expect(write.rows![0]!.values![0]!.userEnteredFormat?.horizontalAlignment).toBe("CENTER");
  });
});

describe("regional tables", () => {
  const leads = [
    lead({ name: "Late", region: "JAWA BARAT", reportDate: "2026-11-20", createdAt: "2026-11-20T01:00:00Z" }),
    lead({ name: "Early", region: "JAWA BARAT", reportDate: "2026-11-03", createdAt: "2026-11-21T01:00:00Z" }),
    lead({ name: "Jkt", region: "JABODETABEK", phone: "0215551234", reportDate: "2026-11-25", source: "GOOGLE" }),
  ];
  const layout = buildMonthLayout("2026-11", leads);

  it("lists the five regions in the required order with the exact columns", () => {
    expect(layout.regions.map((r) => r.region)).toEqual([...REPORTING_REGIONS]);
    for (const section of layout.regions) {
      expect(value(layout, section.titleRow, 0)).toBe(section.region);
      expect(layout.rows[section.headerRow]!.map((c) => c.value)).toEqual([...REGION_TABLE_COLUMNS]);
      expect(section.titleRow).toBeGreaterThan(layout.summary.totalRow);
    }
    expect(REGION_TABLE_COLUMNS).toEqual(["NO", "NAMA", "NOMOR TLP", "LOCATION", "DEALER", "UNIT", "FOLLOW UP", "SOURCE"]);
  });

  it("sorts by report_date oldest first and numbers rows sequentially", () => {
    const jabar = layout.regions.find((r) => r.region === "JAWA BARAT")!;
    const rows = layout.rows.slice(jabar.firstDataRow, jabar.firstDataRow + jabar.dataRowCount);
    expect(rows.map((r) => [r[0]!.value, r[1]!.value])).toEqual([[1, "Early"], [2, "Late"]]);
  });

  it("writes phone as text and fills FOLLOW UP with the prospect's own report date", () => {
    const jkt = layout.regions.find((r) => r.region === "JABODETABEK")!;
    const row = layout.rows[jkt.firstDataRow]!;
    expect(row[2]!.value).toBe("0215551234");
    expect(row[6]!.value).toEqual({ date: "2026-11-25" });
    expect(row[6]!.value).toEqual({ date: leads[2]!.reportDate });
    const write = buildSheetRequests(layout, 1, { rowCount: 100, columnCount: 8 }).find((r) => r.updateCells?.rows)!.updateCells!;
    expect(write.rows![jkt.firstDataRow]!.values![2]!.userEnteredValue).toEqual({ stringValue: "0215551234" });
    expect(write.rows![jkt.firstDataRow]!.values![6]!.userEnteredFormat?.numberFormat).toEqual({ type: "DATE", pattern: "dd/mm/yyyy" });
    expect(write.rows![jkt.headerRow]!.values![0]!.userEnteredFormat?.backgroundColor).toEqual(COLORS.lightBlue);
    expect(write.rows![jkt.headerRow]!.values![0]!.userEnteredFormat?.textFormat?.bold).toBe(true);
  });

  it("keeps empty sections formatted with bordered blank rows", () => {
    const banten = layout.regions.find((r) => r.region === "BANTEN")!;
    expect(banten.leadIds).toEqual([]);
    expect(banten.dataRowCount).toBe(3);
    const write = buildSheetRequests(layout, 1, { rowCount: 100, columnCount: 8 }).find((r) => r.updateCells?.rows)!.updateCells!;
    const blank = write.rows![banten.firstDataRow]!.values!;
    expect(blank).toHaveLength(8);
    expect(blank.every((c) => c.userEnteredFormat?.borders?.top?.style === "SOLID" && !c.userEnteredValue)).toBe(true);
  });

  it("includes each lead exactly once", () => {
    const ids = layout.regions.flatMap((r) => r.leadIds);
    expect(ids.sort()).toEqual(leads.map((l) => l.id).sort());
  });

  it("rejects leads from another month", () => {
    expect(() => buildMonthLayout("2026-11", [lead({ reportDate: "2026-10-31" })])).toThrow();
  });
});

describe("sheet requests", () => {
  it("clears and rewrites the whole tab in one batch, growing the grid when needed", () => {
    const many = Array.from({ length: 400 }, () => lead({}));
    const layout = buildMonthLayout("2026-11", many);
    const requests = buildSheetRequests(layout, 5, { rowCount: 300, columnCount: 8 });
    const kinds = requests.map((r) => Object.keys(r)[0]);
    expect(kinds.slice(0, 4)).toEqual(["updateSheetProperties", "unmergeCells", "updateCells", "updateCells"]);
    expect(requests[0]!.updateSheetProperties!.properties!.gridProperties!.rowCount).toBeGreaterThanOrEqual(layout.rows.length);
    expect(requests[2]!.updateCells!.rows).toBeUndefined();
    expect(requests.filter((r) => r.mergeCells)).toHaveLength(layout.merges.length);
    expect(requests.filter((r) => r.updateDimensionProperties)).toHaveLength(8);
  });

  it("is deterministic, so re-syncing the same data produces the same sheet", () => {
    const data = [lead({ id: "a" }), lead({ id: "b", region: "BANTEN" })];
    expect(buildSheetRequests(buildMonthLayout("2026-11", data), 1, { rowCount: 500, columnCount: 8 })).toEqual(
      buildSheetRequests(buildMonthLayout("2026-11", [...data].reverse()), 1, { rowCount: 500, columnCount: 8 }),
    );
  });
});
