import type { sheets_v4 } from "@googleapis/sheets";
import type { SheetTab, SheetsGateway } from "@/lib/sheets/gateway";

export type FakeCell = string | number | null;

/**
 * In-memory Google Sheets double. It interprets the subset of batchUpdate
 * requests the app sends (grid resize, clear, write) so tests can assert the
 * resulting tab contents.
 */
export class FakeSheets implements SheetsGateway {
  title = "DIPO LEAD REPORT";
  tabs: SheetTab[] = [{ sheetId: 0, title: "Sheet1", index: 0, rowCount: 1000, columnCount: 26 }];
  grids = new Map<number, FakeCell[][]>();
  addTabCalls = 0;
  batchCalls = 0;
  failNext = 0;
  onBatch?: () => Promise<void>;
  private nextId = 1000;

  async getSpreadsheet() {
    return { title: this.title, tabs: this.tabs.map((t) => ({ ...t })) };
  }

  async addTab(title: string, index: number): Promise<SheetTab> {
    this.addTabCalls++;
    if (this.tabs.some((t) => t.title === title)) throw new Error(`A sheet with the name "${title}" already exists.`);
    for (const t of this.tabs) if (t.index >= index) t.index++;
    const tab = { sheetId: this.nextId++, title, index, rowCount: 300, columnCount: 8 };
    this.tabs.push(tab);
    return { ...tab };
  }

  async setSpreadsheetTitle(title: string) {
    this.title = title;
  }

  async batchUpdate(requests: sheets_v4.Schema$Request[]) {
    this.batchCalls++;
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("Google Sheets API 503: The service is currently unavailable.");
    }
    if (this.onBatch) await this.onBatch();
    for (const req of requests) {
      if (req.updateSheetProperties) {
        const p = req.updateSheetProperties.properties!;
        const tab = this.tabs.find((t) => t.sheetId === p.sheetId)!;
        tab.rowCount = p.gridProperties?.rowCount ?? tab.rowCount;
        tab.columnCount = p.gridProperties?.columnCount ?? tab.columnCount;
      }
      const uc = req.updateCells;
      if (uc?.range && !uc.rows) this.grids.set(uc.range.sheetId!, []);
      if (uc?.start && uc.rows) {
        const grid = this.grids.get(uc.start.sheetId!) ?? [];
        uc.rows.forEach((row, r) => {
          grid[r] = (row.values ?? []).map((cell) => {
            const v = cell.userEnteredValue;
            return v?.stringValue ?? v?.numberValue ?? v?.formulaValue ?? null;
          });
        });
        this.grids.set(uc.start.sheetId!, grid);
      }
    }
  }

  tab(title: string) {
    return this.tabs.find((t) => t.title === title);
  }

  grid(title: string): FakeCell[][] {
    const tab = this.tab(title);
    if (!tab) throw new Error(`no tab ${title}`);
    return this.grids.get(tab.sheetId) ?? [];
  }

  /** Rows (as arrays) of a regional table, excluding blank placeholder rows. */
  regionRows(title: string, region: string): FakeCell[][] {
    const grid = this.grid(title);
    const titleRow = grid.findIndex((row) => row[0] === region);
    if (titleRow < 0) throw new Error(`no region ${region}`);
    const rows: FakeCell[][] = [];
    for (let r = titleRow + 2; r < grid.length && grid[r]!.length > 0; r++) {
      if (grid[r]!.every((c) => c === null)) break;
      rows.push(grid[r]!);
    }
    return rows;
  }
}
