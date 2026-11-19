import type { sheets_v4 } from "@googleapis/sheets";
import { REPORTING_REGIONS, type LeadSource, type ReportingRegion } from "../constants";
import { datesOfMonth, formatDayDateId, monthKeyOf, sheetTitleForMonth, toSheetsSerialDate, type IsoDate } from "../dates";

/**
 * Monthly tab template. Every sync rebuilds the whole tab from Supabase (the
 * source of truth) in one atomic batchUpdate, so rows can never be duplicated,
 * edits and deletions are always reflected and the formatting is re-applied
 * identically every time.
 */

export interface SheetLead {
  id: string;
  name: string;
  phone: string;
  domicile: string;
  dealerName: string;
  unit: string;
  source: LeadSource;
  reportDate: IsoDate;
  createdAt: string;
  region: ReportingRegion;
}

/** One service enquiry, listed in its own block to the right of the sales tables. */
export interface SheetService {
  id: string;
  dealerName: string;
  name: string;
  location: string;
  unit: string;
  source: LeadSource;
  finalNote: string | null;
  reportDate: IsoDate;
  createdAt: string;
}

export const REGION_TABLE_COLUMNS = ["NO", "NAMA", "NOMOR TLP", "LOCATION", "DEALER", "UNIT", "FOLLOW UP", "SOURCE"] as const;
export const SERVICE_TABLE_COLUMNS = ["NO", "DEALER", "NAMA", "LOCATION", "UNIT", "FOLLOW UP", "SOURCE", "FINAL"] as const;
/** Order of the source columns in the daily summary, as in the reference sheet. */
export const SUMMARY_SOURCES = ["GOOGLE", "META", "TIKTOK"] as const satisfies readonly LeadSource[];

export const COLORS = {
  yellow: { red: 1, green: 1, blue: 0 },
  green: { red: 0.5725, green: 0.8157, blue: 0.3137 },
  lightGreen: { red: 0.851, green: 0.9176, blue: 0.8275 },
  lightBlue: { red: 0.8118, green: 0.8863, blue: 0.9529 },
  red: { red: 0.8, green: 0, blue: 0 },
  white: { red: 1, green: 1, blue: 1 },
  black: { red: 0, green: 0, blue: 0 },
} as const;

const SALES_COLUMN_COUNT = REGION_TABLE_COLUMNS.length;
/** One empty column separates the sales side from the service block. */
const SERVICE_COLUMN_START = SALES_COLUMN_COUNT + 1;
const COLUMN_COUNT = SERVICE_COLUMN_START + SERVICE_TABLE_COLUMNS.length;
const COLUMN_WIDTHS = [48, 230, 140, 170, 210, 120, 110, 95, 24, 44, 180, 200, 170, 170, 105, 90, 300];
const EMPTY_REGION_ROWS = 3;
/** The service block always offers this many numbered rows, as in DDC Report. */
const MIN_SERVICE_ROWS = 30;
const GAP_ROWS = 2;

type Style =
  | "headerYellow"
  | "headerGreen"
  | "totalLabel"
  | "totalNumber"
  | "cell"
  | "cellCenter"
  | "number"
  | "date"
  | "regionTitle"
  | "tableHeader"
  | "serviceBanner"
  | "serviceHeader";

export type CellValue = string | number | { formula: string } | { date: IsoDate } | null;

export interface LayoutCell {
  value: CellValue;
  style: Style | null;
}

export interface Merge {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

export interface RegionSection {
  region: ReportingRegion;
  titleRow: number;
  headerRow: number;
  firstDataRow: number;
  dataRowCount: number;
  leadIds: string[];
}

export interface ServiceSection {
  bannerRow: number;
  headerRow: number;
  firstDataRow: number;
  dataRowCount: number;
  firstColumn: number;
  serviceIds: string[];
}

export interface MonthLayout {
  monthKey: string;
  rows: LayoutCell[][];
  merges: Merge[];
  summary: { headerRow: number; firstDayRow: number; dayCount: number; totalRow: number };
  regions: RegionSection[];
  service: ServiceSection;
}

const blankRow = (): LayoutCell[] => Array.from({ length: COLUMN_COUNT }, () => ({ value: null, style: null }));
const a1Row = (rowIndex: number) => rowIndex + 1;
const COL = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export function sortLeadsForReport(leads: SheetLead[]): SheetLead[] {
  return [...leads].sort(
    (a, b) => a.reportDate.localeCompare(b.reportDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export function sortServicesForReport(services: SheetService[]): SheetService[] {
  return [...services].sort(
    (a, b) => a.reportDate.localeCompare(b.reportDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

export function buildMonthLayout(monthKey: string, leads: SheetLead[], services: SheetService[] = []): MonthLayout {
  for (const lead of leads) {
    if (monthKeyOf(lead.reportDate) !== monthKey) {
      throw new Error(`Lead ${lead.id} (${lead.reportDate}) does not belong to ${monthKey}`);
    }
  }
  for (const entry of services) {
    if (monthKeyOf(entry.reportDate) !== monthKey) {
      throw new Error(`Service ${entry.id} (${entry.reportDate}) does not belong to ${monthKey}`);
    }
  }
  const rows: LayoutCell[][] = [];
  const merges: Merge[] = [];
  const sorted = sortLeadsForReport(leads);

  // --- A. Daily source summary --------------------------------------------
  const header = blankRow();
  const subHeader = blankRow();
  header[0] = { value: "NO", style: "headerYellow" };
  header[1] = { value: "HARI/TANGGAL", style: "headerYellow" };
  header[2] = { value: "SALES", style: "headerGreen" };
  header[3] = { value: null, style: "headerGreen" };
  header[4] = { value: null, style: "headerGreen" };
  header[5] = { value: "TOTAL", style: "headerYellow" };
  subHeader[0] = { value: null, style: "headerYellow" };
  subHeader[1] = { value: null, style: "headerYellow" };
  SUMMARY_SOURCES.forEach((source, i) => (subHeader[2 + i] = { value: source, style: "headerGreen" }));
  subHeader[5] = { value: null, style: "headerYellow" };
  rows.push(header, subHeader);
  merges.push(
    { row: 0, col: 0, rowSpan: 2, colSpan: 1 },
    { row: 0, col: 1, rowSpan: 2, colSpan: 1 },
    { row: 0, col: 2, rowSpan: 1, colSpan: 3 },
    { row: 0, col: 5, rowSpan: 2, colSpan: 1 },
  );

  const counts = new Map<string, Record<LeadSource, number>>();
  for (const lead of sorted) {
    const day = counts.get(lead.reportDate) ?? { GOOGLE: 0, META: 0, TIKTOK: 0 };
    day[lead.source] += 1;
    counts.set(lead.reportDate, day);
  }

  const days = datesOfMonth(monthKey);
  const firstDayRow = rows.length;
  days.forEach((date, i) => {
    const row = blankRow();
    const r = a1Row(rows.length);
    const day = counts.get(date) ?? { GOOGLE: 0, META: 0, TIKTOK: 0 };
    row[0] = { value: i + 1, style: "number" };
    row[1] = { value: formatDayDateId(date), style: "cell" };
    SUMMARY_SOURCES.forEach((source, j) => (row[2 + j] = { value: day[source], style: "number" }));
    row[5] = { value: { formula: `=SUM(C${r}:E${r})` }, style: "number" };
    rows.push(row);
  });
  const lastDayA1 = a1Row(rows.length - 1);
  const totalRowIndex = rows.length;
  const totalRow = blankRow();
  totalRow[0] = { value: "TOTAL", style: "totalLabel" };
  totalRow[1] = { value: null, style: "totalLabel" };
  for (let c = 2; c <= 5; c++) {
    totalRow[c] = { value: { formula: `=SUM(${COL[c]}${a1Row(firstDayRow)}:${COL[c]}${lastDayA1})` }, style: "totalNumber" };
  }
  rows.push(totalRow);
  merges.push({ row: totalRowIndex, col: 0, rowSpan: 1, colSpan: 2 });

  // --- B. Regional prospect tables ----------------------------------------
  const regions: RegionSection[] = [];
  for (const region of REPORTING_REGIONS) {
    for (let g = 0; g < GAP_ROWS; g++) rows.push(blankRow());

    const titleRow = rows.length;
    const title = blankRow();
    title[0] = { value: region, style: "regionTitle" };
    rows.push(title);
    merges.push({ row: titleRow, col: 0, rowSpan: 1, colSpan: COLUMN_COUNT });

    const headerRow = rows.length;
    rows.push(REGION_TABLE_COLUMNS.map((name) => ({ value: name, style: "tableHeader" as const })));

    const regionLeads = sorted.filter((lead) => lead.region === region);
    const firstDataRow = rows.length;
    regionLeads.forEach((lead, i) => {
      rows.push([
        { value: i + 1, style: "cellCenter" },
        { value: lead.name, style: "cell" },
        { value: lead.phone, style: "cell" },
        { value: lead.domicile, style: "cell" },
        { value: lead.dealerName, style: "cell" },
        { value: lead.unit, style: "cell" },
        { value: { date: lead.reportDate }, style: "date" },
        { value: lead.source, style: "cellCenter" },
      ]);
    });
    if (regionLeads.length === 0) {
      for (let i = 0; i < EMPTY_REGION_ROWS; i++) {
        rows.push(REGION_TABLE_COLUMNS.map((_, c) => ({ value: null, style: c === 0 || c === 7 ? "cellCenter" : "cell" })));
      }
    }
    regions.push({
      region,
      titleRow,
      headerRow,
      firstDataRow,
      dataRowCount: rows.length - firstDataRow,
      leadIds: regionLeads.map((l) => l.id),
    });
  }

  // --- C. Service block, to the right of everything above -------------------
  // The sales sections build rows only as wide as they need, so pad them first:
  // writing a service column into a short row would otherwise leave a hole.
  for (const row of rows) {
    while (row.length < COLUMN_COUNT) row.push({ value: null, style: null });
  }
  const col = SERVICE_COLUMN_START;
  const at = (rowIndex: number): LayoutCell[] => {
    while (rows.length <= rowIndex) rows.push(blankRow());
    return rows[rowIndex]!;
  };

  const bannerRow = 0;
  at(bannerRow)[col] = { value: `SERVICE ${sheetTitleForMonth(monthKey).toUpperCase()}`, style: "serviceBanner" };
  for (let i = 1; i < SERVICE_TABLE_COLUMNS.length; i++) at(bannerRow)[col + i] = { value: null, style: "serviceBanner" };
  merges.push({ row: bannerRow, col, rowSpan: 1, colSpan: SERVICE_TABLE_COLUMNS.length });

  const serviceHeaderRow = 1;
  SERVICE_TABLE_COLUMNS.forEach((name, i) => {
    at(serviceHeaderRow)[col + i] = { value: name, style: "serviceHeader" };
  });

  const sortedServices = sortServicesForReport(services);
  const firstServiceRow = serviceHeaderRow + 1;
  const serviceRowCount = Math.max(MIN_SERVICE_ROWS, sortedServices.length);
  for (let i = 0; i < serviceRowCount; i++) {
    const row = at(firstServiceRow + i);
    const entry = sortedServices[i];
    row[col] = { value: i + 1, style: "cellCenter" };
    row[col + 1] = { value: entry?.dealerName ?? null, style: "cell" };
    row[col + 2] = { value: entry?.name ?? null, style: "cell" };
    row[col + 3] = { value: entry?.location ?? null, style: "cell" };
    row[col + 4] = { value: entry?.unit ?? null, style: "cell" };
    row[col + 5] = { value: entry ? { date: entry.reportDate } : null, style: "date" };
    row[col + 6] = { value: entry?.source ?? null, style: "cellCenter" };
    row[col + 7] = { value: entry?.finalNote ?? null, style: "cell" };
  }

  return {
    monthKey,
    rows,
    merges,
    summary: { headerRow: 0, firstDayRow, dayCount: days.length, totalRow: totalRowIndex },
    regions,
    service: {
      bannerRow,
      headerRow: serviceHeaderRow,
      firstDataRow: firstServiceRow,
      dataRowCount: serviceRowCount,
      firstColumn: col,
      serviceIds: sortedServices.map((e) => e.id),
    },
  };
}

// --- Google Sheets request rendering ---------------------------------------

const thin: sheets_v4.Schema$Border = { style: "SOLID", color: COLORS.black };
const allBorders: sheets_v4.Schema$Borders = { top: thin, bottom: thin, left: thin, right: thin };
const base = { fontFamily: "Arial", fontSize: 10 };

const STYLE_FORMATS: Record<Style, sheets_v4.Schema$CellFormat> = {
  headerYellow: {
    backgroundColor: COLORS.yellow, borders: allBorders, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE",
    textFormat: { ...base, bold: true },
  },
  headerGreen: {
    backgroundColor: COLORS.green, borders: allBorders, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE",
    textFormat: { ...base, bold: true },
  },
  totalLabel: {
    backgroundColor: COLORS.lightGreen, borders: allBorders, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE",
    textFormat: { ...base, bold: true },
  },
  totalNumber: {
    backgroundColor: COLORS.lightGreen, borders: allBorders, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE",
    textFormat: { ...base, bold: true }, numberFormat: { type: "NUMBER", pattern: "0" },
  },
  cell: { borders: allBorders, verticalAlignment: "MIDDLE", wrapStrategy: "WRAP", textFormat: base },
  cellCenter: { borders: allBorders, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", textFormat: base },
  number: {
    borders: allBorders, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", textFormat: base,
    numberFormat: { type: "NUMBER", pattern: "0" },
  },
  date: {
    borders: allBorders, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE", textFormat: base,
    numberFormat: { type: "DATE", pattern: "dd/mm/yyyy" },
  },
  regionTitle: { horizontalAlignment: "LEFT", verticalAlignment: "MIDDLE", textFormat: { ...base, bold: true, fontSize: 12 } },
  tableHeader: {
    backgroundColor: COLORS.lightBlue, borders: allBorders, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE",
    textFormat: { ...base, bold: true },
  },
  serviceBanner: {
    backgroundColor: COLORS.red, borders: allBorders, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE",
    textFormat: { ...base, bold: true, fontSize: 11, foregroundColor: COLORS.white },
  },
  serviceHeader: {
    backgroundColor: COLORS.red, borders: allBorders, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE",
    textFormat: { ...base, bold: true, foregroundColor: COLORS.white },
  },
};

function toCellData(cell: LayoutCell): sheets_v4.Schema$CellData {
  const data: sheets_v4.Schema$CellData = {};
  const v = cell.value;
  if (typeof v === "string") data.userEnteredValue = { stringValue: v };
  else if (typeof v === "number") data.userEnteredValue = { numberValue: v };
  else if (v && "formula" in v) data.userEnteredValue = { formulaValue: v.formula };
  else if (v && "date" in v) data.userEnteredValue = { numberValue: toSheetsSerialDate(v.date) };
  if (cell.style) data.userEnteredFormat = STYLE_FORMATS[cell.style];
  return data;
}

export interface GridSize {
  rowCount: number;
  columnCount: number;
}

/** Requests that replace the full content of a tab with the layout, atomically. */
export function buildSheetRequests(layout: MonthLayout, sheetId: number, grid: GridSize): sheets_v4.Schema$Request[] {
  const neededRows = layout.rows.length + 20;
  const rowCount = Math.max(grid.rowCount, neededRows);
  const columnCount = Math.max(grid.columnCount, COLUMN_COUNT);
  const requests: sheets_v4.Schema$Request[] = [];

  if (rowCount !== grid.rowCount || columnCount !== grid.columnCount) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { rowCount, columnCount } },
        fields: "gridProperties.rowCount,gridProperties.columnCount",
      },
    });
  }
  const whole = { sheetId, startRowIndex: 0, endRowIndex: rowCount, startColumnIndex: 0, endColumnIndex: columnCount };
  requests.push(
    { unmergeCells: { range: whole } },
    { updateCells: { range: whole, fields: "userEnteredValue,userEnteredFormat,note" } },
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: layout.rows.map((row) => ({ values: row.map(toCellData) })),
        fields: "userEnteredValue,userEnteredFormat",
      },
    },
    ...layout.merges.map((m) => ({
      mergeCells: {
        mergeType: "MERGE_ALL",
        range: {
          sheetId,
          startRowIndex: m.row,
          endRowIndex: m.row + m.rowSpan,
          startColumnIndex: m.col,
          endColumnIndex: m.col + m.colSpan,
        },
      },
    })),
    ...COLUMN_WIDTHS.map((pixelSize, i) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        properties: { pixelSize },
        fields: "pixelSize",
      },
    })),
  );
  return requests;
}
