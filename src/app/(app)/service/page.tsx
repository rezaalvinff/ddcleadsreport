import type { Metadata } from "next";
import Link from "next/link";
import { EmptyRow, PageHeader, Pagination, SyncBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { LEAD_SOURCES } from "@/lib/constants";
import { formatDateShort, formatTimestampId, monthLabelId, shiftMonth, todayJakarta } from "@/lib/dates";
import { getAdminDb } from "@/lib/db/admin";
import { listDealers } from "@/lib/master/service";
import { pageParam, param, withParams, type SearchParams } from "@/lib/search-params";
import { isValidMonthKey } from "@/lib/dates";
import { listServiceEntries, SERVICE_PAGE_SIZE } from "@/lib/service/service";
import { ServiceRowActions } from "./row-actions";

export const metadata: Metadata = { title: "Data Service" };

export default async function ServiceListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireUser();
  const sp = await searchParams;
  const month = param(sp, "month");
  const source = param(sp, "source");
  const dealer = param(sp, "dealer");
  const filters = {
    q: param(sp, "q"),
    month: month && isValidMonthKey(month) ? month : undefined,
    source: source && (LEAD_SOURCES as readonly string[]).includes(source) ? source : undefined,
    dealerId: dealer && /^[0-9a-f-]{36}$/i.test(dealer) ? dealer : undefined,
  };
  const page = pageParam(sp);
  const db = getAdminDb();
  const [{ rows, total }, dealers] = await Promise.all([listServiceEntries(db, filters, page), listDealers(db)]);
  const current = todayJakarta().slice(0, 7);

  return (
    <>
      <PageHeader
        title="Data Service"
        description="Entri service yang mengisi blok SERVICE di tab bulanan. Tidak punya pesan WhatsApp."
        actions={
          <Link className="btn btn-primary" href="/prospek/tambah?jenis=service">
            Tambah Service
          </Link>
        }
      />

      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" method="get">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="q">
            Cari nama / location
          </label>
          <input id="q" name="q" defaultValue={filters.q} className="input" placeholder="mis. Dina atau Serpong" />
        </div>
        <div>
          <label className="label" htmlFor="month">
            Bulan laporan
          </label>
          <select id="month" name="month" defaultValue={filters.month ?? ""} className="input">
            <option value="">Semua bulan</option>
            {Array.from({ length: 18 }, (_, i) => shiftMonth(current, -i)).map((m) => (
              <option key={m} value={m}>
                {monthLabelId(m)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dealer">
            Dealer
          </label>
          <select id="dealer" name="dealer" defaultValue={filters.dealerId ?? ""} className="input">
            <option value="">Semua dealer</option>
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.dealer_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="source">
            Source
          </label>
          <select id="source" name="source" defaultValue={filters.source ?? ""} className="input">
            <option value="">Semua source</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button className="btn btn-primary">Terapkan filter</button>
          <Link className="btn btn-secondary" href="/service">
            Reset
          </Link>
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="table min-w-[960px]">
          <thead>
            <tr>
              <th>Tgl laporan</th>
              <th>Dealer</th>
              <th>Nama</th>
              <th>Location</th>
              <th>Unit</th>
              <th>Source</th>
              <th>Final</th>
              <th>Sheets</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={9}>Belum ada data service yang cocok dengan filter.</EmptyRow>}
            {rows.map((entry) => (
              <tr key={entry.id}>
                <td className="whitespace-nowrap">
                  {formatDateShort(entry.reportDate)}
                  <span className="block text-xs text-neutral-500">{formatTimestampId(entry.createdAt)}</span>
                </td>
                <td>{entry.dealerName}</td>
                <td className="font-medium text-neutral-900">{entry.name}</td>
                <td>{entry.location}</td>
                <td>{entry.unit}</td>
                <td>{entry.source}</td>
                <td className="max-w-[260px] text-xs text-neutral-600">{entry.finalNote ?? "—"}</td>
                <td>
                  <SyncBadge status={entry.sync?.status} title={entry.sync?.error} />
                  {entry.sync?.status === "failed" && entry.sync.error && (
                    <span className="mt-1 block max-w-[200px] text-xs break-words text-red-700">{entry.sync.error}</span>
                  )}
                </td>
                <td className="text-right">
                  <ServiceRowActions serviceId={entry.id} name={entry.name} canResync={entry.sync?.status !== "success"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        total={total}
        pageSize={SERVICE_PAGE_SIZE}
        hrefFor={(p) => withParams("/service", { ...filters, dealer: filters.dealerId, dealerId: undefined, page: p })}
      />
    </>
  );
}
