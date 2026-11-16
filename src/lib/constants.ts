export const REPORTING_REGIONS = [
  "JABODETABEK",
  "JAWA BARAT",
  "BANTEN",
  "JAWA TIMUR",
  "SUMATERA & KALIMANTAN",
] as const;

export type ReportingRegion = (typeof REPORTING_REGIONS)[number];

export function isReportingRegion(value: unknown): value is ReportingRegion {
  return typeof value === "string" && (REPORTING_REGIONS as readonly string[]).includes(value);
}

export const LEAD_SOURCES = ["META", "GOOGLE", "TIKTOK"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const UNIT_OPTIONS = ["Xpander", "Xforce", "Destinator", "Pajero Sport", "L300", "Triton"] as const;
export const UNIT_OTHER = "Lainnya";

export const CLASSIFICATION_METHODS = ["mapped", "ai", "manual"] as const;
export type ClassificationMethod = (typeof CLASSIFICATION_METHODS)[number];

export const CLASSIFICATION_LABELS: Record<ClassificationMethod, string> = {
  mapped: "Database lokasi",
  ai: "Gemini (AI)",
  manual: "Manual",
};

export const SYNC_STATUSES = ["pending", "success", "failed"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const APP_TIMEZONE = "Asia/Jakarta";
export const SPREADSHEET_TITLE = "DIPO LEAD REPORT";
