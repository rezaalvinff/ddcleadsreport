import { isReportingRegion, LEAD_SOURCES, SYNC_STATUSES } from "./constants";
import { isValidIsoDate, isValidMonthKey, todayJakarta } from "./dates";

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  const value = Array.isArray(v) ? v[0] : v;
  return value?.trim() ? value.trim() : undefined;
}

export function monthParam(sp: SearchParams, fallback = todayJakarta().slice(0, 7)): string {
  const year = param(sp, "year");
  const month = param(sp, "month");
  if (month && isValidMonthKey(month)) return month;
  if (year && month && isValidMonthKey(`${year}-${month.padStart(2, "0")}`)) return `${year}-${month.padStart(2, "0")}`;
  return fallback;
}

export function pageParam(sp: SearchParams): number {
  const n = Number(param(sp, "page") ?? "1");
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : 1;
}

export function leadFilterParams(sp: SearchParams) {
  const month = param(sp, "month");
  const date = param(sp, "date");
  const region = param(sp, "region");
  const source = param(sp, "source");
  const sync = param(sp, "sync");
  const dealerId = param(sp, "dealer");
  return {
    q: param(sp, "q"),
    month: month && isValidMonthKey(month) ? month : undefined,
    date: date && isValidIsoDate(date) ? date : undefined,
    region: region && isReportingRegion(region) ? region : undefined,
    source: source && (LEAD_SOURCES as readonly string[]).includes(source) ? source : undefined,
    sync: sync && (SYNC_STATUSES as readonly string[]).includes(sync) ? sync : undefined,
    dealerId: dealerId && /^[0-9a-f-]{36}$/i.test(dealerId) ? dealerId : undefined,
  };
}

export function withParams(path: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") search.set(k, String(v));
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
