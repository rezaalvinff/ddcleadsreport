import type { Metadata } from "next";
import Link from "next/link";
import { EmptyRow, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { REPORTING_REGIONS } from "@/lib/constants";
import { formatTimestampId, monthLabelId, sheetTitleForMonth, shiftMonth, todayJakarta } from "@/lib/dates";
import { getAdminDb } from "@/lib/db/admin";
import { readEnv } from "@/lib/env";
import { listOpenSyncLeads, listSheetMonths } from "@/lib/reports";
import { monthParam, withParams, type SearchParams } from "@/lib/search-params";
import { spreadsheetUrl } from "@/lib/sheets/gateway";
import { buildMonthLayout, SUMMARY_SOURCES } from "@/lib/sheets/layout";
import { createSupabaseSyncStore } from "@/lib/sync/store";
import { SyncButton } from "./sync-button";

export const metadata: Metadata = { title: "Laporan Bulanan" };

export default async function ReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireUser();
  const monthKey = monthParam(await searchParams);
  const db = getAdminDb();
  const [months, leads, openLeads] = await Promise.all([
    listSheetMonths(db),
    createSupabaseSyncStore(db).loadMonthLeads(monthKey),
    listOpenSyncLeads(db, monthKey),
  ]);
  const layout = buildMonthLayout(monthKey, leads);
  const status = months.find((m) => m.monthKey === monthKey);
  const sheetsConfigured = readEnv("sheets").ok;
  const upToDate = status ? status.revision <= status.syncedRevision && status.openRows === 0 : leads.length === 0;
  const url = spreadsheetUrl(status?.sheetId);
  const days = layout.rows.slice(layout.summary.firstDayRow, layout.summary.totalRow);
  const totals = SUMMARY_SOURCES.map((_, i) => days.reduce((n, row) => n + Number(row[2 + i]!.value ?? 0), 0));
  const current = todayJakarta().slice(0, 7);

  return (
    <>
      <PageHeader
        title="Laporan Bulanan"
        description="Spreadsheet DIPO LEAD REPORT: satu tab per bulan, dibangun ulang otomatis dari database."
        actions={
          <>
            {url && (
              <a className="btn btn-secondary" href={url} target="_blank" rel="noopener noreferrer">
                Buka Google Sheets
              </a>
            )}
            <SyncButton label="Sinkronkan semua yang tertunda" primary />
          </>
        }
      />
      {!sheetsConfigured && (
        <div className="mb-4">
          <Notice tone="error">
            Google Sheets belum dikonfigurasi (GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY). Prospek tetap
            tersimpan di database dan akan disinkronkan setelah konfigurasi lengkap. Lihat{" "}
            <Link className="link" href="/pengaturan">
              Pengaturan
            </Link>
            .
          </Notice>
        </div>
      )}

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="month">
            Bulan
          </label>
          <select id="month" name="month" defaultValue={monthKey} className="input">
            {Array.from({ length: 24 }, (_, i) => shiftMonth(current, -i)).map((m) => (
              <option key={m} value={m}>
                {monthLabelId(m)}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-secondary">Tampilkan</button>
      </form>

      <section className="card mb-6 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Tab &ldquo;{sheetTitleForMonth(monthKey)}&rdquo;</h2>
            <p className="mt-1 text-sm text-neutral-600">
              {leads.length} prospek ·{" "}
              {!status
                ? "belum pernah disinkronkan"
                : upToDate
                  ? `tersinkron${status.lastSyncedAt ? ` ${formatTimestampId(status.lastSyncedAt)}` : ""}`
                  : `perlu sinkronisasi (${status.openRows} prospek menunggu/gagal)`}
            </p>
            {status?.lastError && !upToDate && <p className="mt-1 text-sm text-red-700">Error terakhir: {status.lastError}</p>}
          </div>
          <SyncButton monthKey={monthKey} label="Sinkronkan ulang bulan ini" />
        </div>

        <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="overflow-x-auto">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Ringkasan harian (sesuai tab)</h3>
            <table className="table min-w-[420px] text-xs">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Hari/Tanggal</th>
                  {SUMMARY_SOURCES.map((s) => (
                    <th key={s} className="text-center">
                      {s}
                    </th>
                  ))}
                  <th className="text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                {days.map((row) => {
                  const counts = SUMMARY_SOURCES.map((_, i) => Number(row[2 + i]!.value ?? 0));
                  const total = counts.reduce((a, b) => a + b, 0);
                  return (
                    <tr key={String(row[0]!.value)} className={total ? "" : "text-neutral-400"}>
                      <td>{String(row[0]!.value)}</td>
                      <td>{String(row[1]!.value)}</td>
                      {counts.map((c, i) => (
                        <td key={i} className="text-center">
                          {c}
                        </td>
                      ))}
                      <td className="text-center font-medium">{total}</td>
                    </tr>
                  );
                })}
                <tr className="bg-emerald-50 font-semibold">
                  <td colSpan={2}>TOTAL</td>
                  {totals.map((t, i) => (
                    <td key={i} className="text-center">
                      {t}
                    </td>
                  ))}
                  <td className="text-center">{totals.reduce((a, b) => a + b, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Prospek per wilayah</h3>
              <table className="table text-sm">
                <tbody>
                  {REPORTING_REGIONS.map((r) => (
                    <tr key={r}>
                      <td>{r}</td>
                      <td className="text-right font-medium">{layout.regions.find((s) => s.region === r)?.leadIds.length ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {openLeads.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Belum tersinkron</h3>
                <ul className="space-y-1 text-sm">
                  {openLeads.map((l) => (
                    <li key={l.leadId}>
                      <Link className="link" href={`/prospek/${l.leadId}/edit`}>
                        {l.name}
                      </Link>{" "}
                      <span className={l.status === "failed" ? "text-red-700" : "text-amber-700"}>
                        {l.status === "failed" ? `gagal (${l.retryCount}x)` : "menunggu"}
                      </span>
                      {l.error && <span className="block text-xs text-neutral-500">{l.error}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold text-neutral-900">Semua tab bulanan</h2>
        <div className="card overflow-x-auto">
          <table className="table min-w-[720px]">
            <thead>
              <tr>
                <th>Tab</th>
                <th>Status</th>
                <th>Sinkron terakhir</th>
                <th>Error terakhir</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {months.length === 0 && <EmptyRow colSpan={5}>Belum ada tab. Tab dibuat otomatis saat prospek pertama bulan itu disimpan.</EmptyRow>}
              {months.map((m) => {
                const ok = m.revision <= m.syncedRevision && m.openRows === 0;
                return (
                  <tr key={m.monthKey}>
                    <td>
                      <Link className="link" href={withParams("/laporan", { month: m.monthKey })}>
                        {sheetTitleForMonth(m.monthKey)}
                      </Link>
                    </td>
                    <td className={ok ? "text-emerald-700" : m.failedRows > 0 || m.lastError ? "text-red-700" : "text-amber-700"}>
                      {ok ? "Tersinkron" : m.failedRows > 0 ? `Gagal (${m.failedRows} prospek)` : "Perlu sinkronisasi"}
                    </td>
                    <td className="text-xs text-neutral-600">{m.lastSyncedAt ? formatTimestampId(m.lastSyncedAt) : "—"}</td>
                    <td className="max-w-xs text-xs break-words text-red-700">{!ok && m.lastError ? m.lastError : ""}</td>
                    <td className="text-right">
                      <SyncButton monthKey={m.monthKey} label="Sinkronkan" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
