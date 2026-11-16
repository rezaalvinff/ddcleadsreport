import type { Metadata } from "next";
import Link from "next/link";
import { EmptyRow, PageHeader, SyncBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { LEAD_SOURCES, REPORTING_REGIONS } from "@/lib/constants";
import { formatDateShort, formatTimestampId, monthLabelId, sheetTitleForMonth, todayJakarta } from "@/lib/dates";
import { getDashboardStats } from "@/lib/dashboard";
import { getAdminDb } from "@/lib/db/admin";
import { listRecentLeads } from "@/lib/leads/service";
import { getPendingSummary } from "@/lib/reports";
import { monthParam, type SearchParams } from "@/lib/search-params";
import { SyncButton } from "./laporan/sync-button";

export const metadata: Metadata = { title: "Dashboard" };

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900 tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireUser();
  const monthKey = monthParam(await searchParams);
  const [year, month] = monthKey.split("-");
  const db = getAdminDb();
  const [stats, recent, pending] = await Promise.all([getDashboardStats(db, monthKey), listRecentLeads(db, 10), getPendingSummary(db)]);
  const queued = pending.months.length > 0;
  const currentYear = Number(todayJakarta().slice(0, 4));
  const maxRegion = Math.max(1, ...REPORTING_REGIONS.map((r) => stats.byRegion[r]));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Prospek bulan laporan ${monthLabelId(monthKey)} (berdasarkan tanggal laporan).`}
        actions={
          <Link className="btn btn-primary" href="/prospek/tambah">
            Tambah Prospek
          </Link>
        }
      />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="m">
            Bulan
          </label>
          <select id="m" name="month" defaultValue={month} className="input">
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={String(i + 1).padStart(2, "0")}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="y">
            Tahun
          </label>
          <select id="y" name="year" defaultValue={year} className="input">
            {Array.from({ length: 6 }, (_, i) => currentYear + 1 - i).map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-secondary">Tampilkan</button>
      </form>

      <section className={`card mb-6 p-4 ${queued ? "border-brand-600 bg-brand-50" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {queued ? (
              <>
                <p className="font-medium text-neutral-900">
                  {pending.total > 0
                    ? `${pending.total} prospek menunggu dikirim ke Google Sheets`
                    : "Ada perubahan yang menunggu dikirim ke Google Sheets"}
                </p>
                <p className="mt-0.5 text-sm text-neutral-600">
                  Tab: {pending.months.map(sheetTitleForMonth).join(", ")}
                  {pending.failed > 0 && ` · ${pending.failed} gagal pada percobaan sebelumnya`}
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-neutral-900">Semua prospek sudah terkirim ke Google Sheets.</p>
                <p className="mt-0.5 text-sm text-neutral-600">
                  {pending.lastSentAt ? `Terakhir dikirim ${formatTimestampId(pending.lastSentAt)}.` : "Belum ada pengiriman."}
                </p>
              </>
            )}
          </div>
          {queued && <SyncButton label="Kirim sekarang" primary />}
        </div>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Total prospek" value={stats.total} sub={monthLabelId(monthKey)} />
        {LEAD_SOURCES.map((s) => (
          <Stat key={s} label={s} value={stats.bySource[s]} sub={stats.total ? `${Math.round((stats.bySource[s] / stats.total) * 100)}%` : undefined} />
        ))}
        <Stat label="Disubmit hari ini" value={stats.submittedToday} sub={formatDateShort(todayJakarta())} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Per wilayah pelaporan</h2>
          <ul className="space-y-3">
            {REPORTING_REGIONS.map((r) => (
              <li key={r}>
                <div className="flex justify-between text-sm">
                  <Link className="hover:text-brand-700" href={`/prospek?month=${monthKey}&region=${encodeURIComponent(r)}`}>
                    {r}
                  </Link>
                  <span className="font-medium tabular-nums">{stats.byRegion[r]}</span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-neutral-100">
                  <div className="h-1.5 rounded bg-brand-600" style={{ width: `${(stats.byRegion[r] / maxRegion) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card overflow-x-auto">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-neutral-900">Entri terbaru</h2>
            <Link className="link text-sm" href="/prospek">
              Semua prospek
            </Link>
          </div>
          <table className="table min-w-[640px]">
            <thead>
              <tr>
                <th>Disubmit</th>
                <th>Nama</th>
                <th>Wilayah</th>
                <th>Unit</th>
                <th>Source</th>
                <th>Sheets</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && <EmptyRow colSpan={6}>Belum ada prospek.</EmptyRow>}
              {recent.map((l) => (
                  <tr key={l.id}>
                    <td className="text-xs whitespace-nowrap text-neutral-600">{formatTimestampId(l.createdAt)}</td>
                    <td>
                      <Link className="hover:text-brand-700" href={`/prospek/${l.id}/edit`}>
                        {l.name}
                      </Link>
                    </td>
                    <td className="text-xs">{l.reportingRegion}</td>
                    <td>{l.unit}</td>
                    <td>{l.source}</td>
                    <td>
                      <SyncBadge status={l.sync?.status} title={l.sync?.error} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
