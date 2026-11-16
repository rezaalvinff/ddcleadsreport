import { APP_TIMEZONE } from "./constants";

/** Date-only values are handled as ISO strings ("YYYY-MM-DD") everywhere. */
export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const jakartaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function isValidIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function isValidMonthKey(value: string): boolean {
  return MONTH_KEY.test(value);
}

/** Calendar date of an instant in Asia/Jakarta. */
export function jakartaDate(instant: Date): IsoDate {
  return jakartaDateFormatter.format(instant);
}

export function todayJakarta(now: Date = new Date()): IsoDate {
  return jakartaDate(now);
}

/**
 * report_date = manually entered prospect date if provided, otherwise the
 * submission date in Asia/Jakarta. The database trigger `leads_before_write`
 * applies the same rule and is the authority; this mirror is used for previews.
 */
export function resolveReportDate(leadDate: IsoDate | null | undefined, submittedAt: Date): IsoDate {
  return leadDate ? leadDate : jakartaDate(submittedAt);
}

export function monthKeyOf(date: IsoDate): string {
  if (!isValidIsoDate(date)) throw new Error(`Invalid date: ${date}`);
  return date.slice(0, 7);
}

function parseMonthKey(monthKey: string): { year: number; month: number } {
  const m = MONTH_KEY.exec(monthKey);
  if (!m) throw new Error(`Invalid month key: ${monthKey}`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** Spreadsheet tab title, e.g. "November 2026". */
export function sheetTitleForMonth(monthKey: string): string {
  const { year, month } = parseMonthKey(monthKey);
  return `${MONTHS_EN[month - 1]} ${year}`;
}

/** Inverse of sheetTitleForMonth; returns null for non-month tab titles. */
export function monthKeyFromSheetTitle(title: string): string | null {
  const m = /^([A-Za-z]+) (\d{4})$/.exec(title.trim());
  if (!m) return null;
  const idx = MONTHS_EN.findIndex((name) => name.toLowerCase() === m[1]!.toLowerCase());
  if (idx < 0) return null;
  return `${m[2]}-${String(idx + 1).padStart(2, "0")}`;
}

export function monthLabelId(monthKey: string): string {
  const { year, month } = parseMonthKey(monthKey);
  return `${MONTHS_ID[month - 1]} ${year}`;
}

export function daysInMonth(monthKey: string): number {
  const { year, month } = parseMonthKey(monthKey);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Inclusive first and last calendar day of a month. */
export function monthRange(monthKey: string): { start: IsoDate; end: IsoDate } {
  const { year, month } = parseMonthKey(monthKey);
  const mm = String(month).padStart(2, "0");
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(daysInMonth(monthKey)).padStart(2, "0")}` };
}

export function datesOfMonth(monthKey: string): IsoDate[] {
  const { start } = monthRange(monthKey);
  const prefix = start.slice(0, 8);
  return Array.from({ length: daysInMonth(monthKey) }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`);
}

export function shiftMonth(monthKey: string, delta: number): string {
  const { year, month } = parseMonthKey(monthKey);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dateParts(date: IsoDate): { y: number; m: number; d: number; weekday: number } {
  if (!isValidIsoDate(date)) throw new Error(`Invalid date: ${date}`);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "Senin, 2 November 2026" */
export function formatDayDateId(date: IsoDate): string {
  const { y, m, d, weekday } = dateParts(date);
  return `${DAYS_ID[weekday]}, ${d} ${MONTHS_ID[m - 1]} ${y}`;
}

/** "02/11/2026" */
export function formatDateShort(date: IsoDate): string {
  const { y, m, d } = dateParts(date);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** "16 Nov 2026 14:05" in Asia/Jakarta. */
export function formatTimestampId(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Days since 1899-12-30, the serial date format used by Google Sheets. */
export function toSheetsSerialDate(date: IsoDate): number {
  const { y, m, d } = dateParts(date);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/** UTC instant at which a Jakarta calendar day starts (Jakarta is UTC+7, no DST). */
export function startOfJakartaDay(date: IsoDate): Date {
  const { y, m, d } = dateParts(date);
  return new Date(Date.UTC(y, m - 1, d) - 7 * 3_600_000);
}
