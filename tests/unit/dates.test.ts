import { describe, expect, it } from "vitest";
import {
  datesOfMonth,
  formatDayDateId,
  jakartaDate,
  monthKeyFromSheetTitle,
  monthKeyOf,
  resolveReportDate,
  sheetTitleForMonth,
  startOfJakartaDay,
  toSheetsSerialDate,
} from "@/lib/dates";

// Website submission on 16 November 2026 (Asia/Jakarta).
const submittedAt = new Date("2026-11-16T03:00:00Z");

describe("report date logic", () => {
  it("Prospect A: manual date 10 Nov -> November 2026", () => {
    const reportDate = resolveReportDate("2026-11-10", submittedAt);
    expect(reportDate).toBe("2026-11-10");
    expect(sheetTitleForMonth(monthKeyOf(reportDate))).toBe("November 2026");
  });

  it("Prospect B: manual date 31 Oct submitted 16 Nov -> October 2026 (late entry)", () => {
    const reportDate = resolveReportDate("2026-10-31", submittedAt);
    expect(sheetTitleForMonth(monthKeyOf(reportDate))).toBe("October 2026");
  });

  it("Prospect C: empty manual date -> submission date -> November 2026", () => {
    expect(resolveReportDate(null, submittedAt)).toBe("2026-11-16");
    expect(resolveReportDate("", submittedAt)).toBe("2026-11-16");
    expect(resolveReportDate(undefined, submittedAt)).toBe("2026-11-16");
  });

  it("the follow-up date is not an input of the report date", () => {
    expect(resolveReportDate.length).toBe(2); // (leadDate, submittedAt) only
  });

  it("uses Asia/Jakarta, not UTC or the server timezone", () => {
    expect(jakartaDate(new Date("2026-10-31T16:59:59Z"))).toBe("2026-10-31");
    expect(jakartaDate(new Date("2026-10-31T17:00:00Z"))).toBe("2026-11-01");
    expect(resolveReportDate(null, new Date("2026-11-30T18:00:00Z"))).toBe("2026-12-01");
    expect(startOfJakartaDay("2026-11-16").toISOString()).toBe("2026-11-15T17:00:00.000Z");
  });
});

describe("month helpers", () => {
  it("names monthly tabs in English month + year and parses them back", () => {
    expect(sheetTitleForMonth("2026-09")).toBe("September 2026");
    expect(sheetTitleForMonth("2027-01")).toBe("January 2027");
    expect(monthKeyFromSheetTitle("February 2027")).toBe("2027-02");
    expect(monthKeyFromSheetTitle("Sheet1")).toBeNull();
  });

  it("lists every day of the month", () => {
    expect(datesOfMonth("2026-11")).toHaveLength(30);
    expect(datesOfMonth("2028-02")).toHaveLength(29);
    expect(datesOfMonth("2026-12").at(-1)).toBe("2026-12-31");
  });

  it("formats Indonesian day names and Sheets serial dates", () => {
    expect(formatDayDateId("2026-11-16")).toBe("Senin, 16 November 2026");
    expect(toSheetsSerialDate("1899-12-31")).toBe(1);
    expect(toSheetsSerialDate("2026-11-20")).toBe(46346);
  });

  it("rejects invalid dates", () => {
    expect(() => monthKeyOf("2026-02-30")).toThrow();
  });
});
