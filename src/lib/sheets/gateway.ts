import "server-only";
import { auth, sheets, type sheets_v4 } from "@googleapis/sheets";
import { decodePrivateKey, requireEnv } from "../env";

export interface SheetTab {
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
}

/** The only Google Sheets operations the app needs; isolated for testing. */
export interface SheetsGateway {
  getSpreadsheet(): Promise<{ title: string; tabs: SheetTab[] }>;
  addTab(title: string, index: number): Promise<SheetTab>;
  batchUpdate(requests: sheets_v4.Schema$Request[]): Promise<void>;
  setSpreadsheetTitle(title: string): Promise<void>;
}

export class SheetsApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "SheetsApiError";
  }
}

function describeError(error: unknown): SheetsApiError {
  const e = error as { code?: number; status?: number; message?: string; response?: { data?: { error?: { message?: string } } } };
  const status = e.code ?? e.status;
  const detail = e.response?.data?.error?.message ?? e.message ?? String(error);
  const hint =
    status === 403
      ? " — pastikan spreadsheet dibagikan (Editor) ke email service account dan Google Sheets API aktif."
      : status === 404
        ? " — periksa GOOGLE_SHEETS_SPREADSHEET_ID."
        : "";
  return new SheetsApiError(`Google Sheets API${status ? ` ${status}` : ""}: ${detail}${hint}`, status);
}

const isTransient = (status?: number) => status === 429 || (status !== undefined && status >= 500);

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (first) {
    const err = describeError(first);
    if (!isTransient(err.status)) throw err;
    await new Promise((r) => setTimeout(r, 1500));
    try {
      return await operation();
    } catch (second) {
      throw describeError(second);
    }
  }
}

function toTab(props: sheets_v4.Schema$SheetProperties | undefined): SheetTab {
  if (props?.sheetId === undefined || props.sheetId === null || !props.title) {
    throw new SheetsApiError("Respons Google Sheets tidak memuat properti tab.");
  }
  return {
    sheetId: props.sheetId,
    title: props.title,
    index: props.index ?? 0,
    rowCount: props.gridProperties?.rowCount ?? 1000,
    columnCount: props.gridProperties?.columnCount ?? 26,
  };
}

export function createGoogleSheetsGateway(): SheetsGateway {
  const env = requireEnv("sheets");
  const client = sheets({
    version: "v4",
    auth: new auth.JWT({
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: decodePrivateKey(env.GOOGLE_PRIVATE_KEY),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    }),
  });
  const spreadsheetId = env.GOOGLE_SHEETS_SPREADSHEET_ID;

  return {
    async getSpreadsheet() {
      const res = await withRetry(() =>
        client.spreadsheets.get({ spreadsheetId, fields: "properties.title,sheets.properties" }),
      );
      return {
        title: res.data.properties?.title ?? "",
        tabs: (res.data.sheets ?? []).map((s) => toTab(s.properties)),
      };
    },
    async addTab(title, index) {
      const res = await withRetry(() =>
        client.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title, index, gridProperties: { rowCount: 300, columnCount: 8 } } } }],
          },
        }),
      );
      return toTab(res.data.replies?.[0]?.addSheet?.properties);
    },
    async batchUpdate(requests) {
      await withRetry(() => client.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } }));
    },
    async setSpreadsheetTitle(title) {
      await withRetry(() =>
        client.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: [{ updateSpreadsheetProperties: { properties: { title }, fields: "title" } }] },
        }),
      );
    },
  };
}

export function spreadsheetUrl(sheetId?: number | null): string | null {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) return null;
  return `https://docs.google.com/spreadsheets/d/${id}/edit${sheetId !== undefined && sheetId !== null ? `#gid=${sheetId}` : ""}`;
}
