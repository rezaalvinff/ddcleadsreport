import type { Metadata } from "next";
import Link from "next/link";
import { EmptyRow, PageHeader, Pagination, SyncBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CLASSIFICATION_LABELS, LEAD_SOURCES, REPORTING_REGIONS } from "@/lib/constants";
import { formatDateShort, formatTimestampId, monthLabelId, shiftMonth, todayJakarta } from "@/lib/dates";
import { getAdminDb } from "@/lib/db/admin";
import { listLeads, PAGE_SIZE } from "@/lib/leads/service";
import { listDealers } from "@/lib/master/service";
import { leadFilterParams, pageParam, withParams, type SearchParams } from "@/lib/search-params";
import { LeadRowActions } from "./row-actions";

export const metadata: Metadata = { title: "Data Prospek" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireUser();
  const sp = await searchParams;
  const filters = leadFilterParams(sp);
  const page = pageParam(sp);
  const db = getAdminDb();
  const [{ rows, total }, dealers] = await Promise.all([listLeads(db, filters, page), listDealers(db)]);
  const current = todayJakarta().slice(0, 7);
  const months = Array.from({ length: 18 }, (_, i) => shiftMonth(current, -i));

  return (
    <>
      <PageHeader
        title="Data Prospek"
        description="Cari, filter, edit, dan hapus prospek. Perubahan otomatis disinkronkan ke Google Sheets."
        actions={
          <Link className="btn btn-primary" href="/prospek/tambah">
            Tambah Prospek
          </Link>
        }
      />

      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" method="get">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="q">
            Cari nama / nomor telepon
          </label>
          <input id="q" name="q" defaultValue={filters.q} className="input" placeholder="mis. Budi atau 0812…" />
        </div>
        <div>
          <label className="label" htmlFor="month">
            Bulan laporan
          </label>
          <select id="month" name="month" defaultValue={filters.month ?? ""} className="input">
            <option value="">Semua bulan</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabelId(m)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="date">
            Tanggal laporan
          </label>
          <input id="date" name="date" type="date" defaultValue={filters.date} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="region">
            Wilayah
          </label>
          <select id="region" name="region" defaultValue={filters.region ?? ""} className="input">
            <option value="">Semua wilayah</option>
            {REPORTING_REGIONS.map((r) => (
              <option key={r}>{r}</option>
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
        <div>
          <label className="label" htmlFor="sync">
            Status sinkronisasi
          </label>
          <select id="sync" name="sync" defaultValue={filters.sync ?? ""} className="input">
            <option value="">Semua status</option>
            <option value="success">Tersinkron</option>
            <option value="pending">Menunggu</option>
            <option value="failed">Gagal</option>
          </select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button className="btn btn-primary">Terapkan filter</button>
          <Link className="btn btn-secondary" href="/prospek">
            Reset
          </Link>
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="table min-w-[960px]">
          <thead>
            <tr>
              <th>Tgl laporan</th>
              <th>Nama / Telepon</th>
              <th>Domisili / Wilayah</th>
              <th>Dealer / Unit</th>
              <th>Source</th>
              <th>Disubmit</th>
              <th>Sheets</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={8}>Tidak ada prospek yang cocok dengan filter.</EmptyRow>}
            {rows.map((lead) => (
              <tr key={lead.id}>
                <td className="whitespace-nowrap">{formatDateShort(lead.reportDate)}</td>
                <td>
                  <span className="font-medium text-neutral-900">{lead.name}</span>
                  <span className="block text-neutral-600">{lead.phone}</span>
                </td>
                <td>
                  {lead.domicile}
                  <span className="block text-xs text-neutral-500">
                    {lead.reportingRegion} · {CLASSIFICATION_LABELS[lead.classificationStatus]}
                  </span>
                </td>
                <td>
                  {lead.dealerName}
                  <span className="block text-xs text-neutral-500">{lead.unit}</span>
                </td>
                <td>{lead.source}</td>
                <td className="text-xs whitespace-nowrap text-neutral-600">{formatTimestampId(lead.createdAt)}</td>
                <td>
                  <SyncBadge status={lead.sync?.status} title={lead.sync?.error} />
                  {lead.sync?.status === "failed" && lead.sync.error && (
                    <span className="mt-1 block max-w-[200px] text-xs break-words text-red-700">{lead.sync.error}</span>
                  )}
                </td>
                <td className="text-right">
                  <LeadRowActions leadId={lead.id} name={lead.name} canResync={lead.sync?.status !== "success"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        hrefFor={(p) => withParams("/prospek", { ...filters, dealer: filters.dealerId, dealerId: undefined, page: p })}
      />
    </>
  );
}
