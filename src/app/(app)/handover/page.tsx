import type { Metadata } from "next";
import Link from "next/link";
import { EmptyRow, PageHeader, Pagination } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateShort, formatTimestampId } from "@/lib/dates";
import { getAdminDb } from "@/lib/db/admin";
import { HANDOVER_PAGE_SIZE, listHandoverHistory } from "@/lib/handover/service";
import { pageParam, param, withParams, type SearchParams } from "@/lib/search-params";
import { HandoverStatus } from "./[leadId]/handover-panel";

export const metadata: Metadata = { title: "Riwayat Handover" };

export default async function HandoverHistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireUser();
  const sp = await searchParams;
  const status = ["open", "sent"].includes(param(sp, "status") ?? "") ? param(sp, "status") : undefined;
  const page = pageParam(sp);
  const { rows, total } = await listHandoverHistory(getAdminDb(), { status }, page);

  const tab = (value: string | undefined, label: string) => (
    <Link
      href={withParams("/handover", { status: value })}
      className={`rounded-md px-3 py-1.5 text-sm ${status === value ? "bg-brand-50 font-semibold text-brand-700" : "text-neutral-600 hover:bg-neutral-100"}`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader title="Riwayat Handover" description="Status pengiriman ke grup cabang. Status terkirim hanya berdasarkan konfirmasi manual Anda." />
      <div className="mb-3 flex gap-1">
        {tab(undefined, "Semua")}
        {tab("open", "Belum dikonfirmasi")}
        {tab("sent", "Ditandai terkirim")}
      </div>
      <div className="card overflow-x-auto">
        <table className="table min-w-[820px]">
          <thead>
            <tr>
              <th>Dibuat</th>
              <th>Prospek</th>
              <th>Unit / Source</th>
              <th>Grup tujuan</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={6}>Belum ada handover.</EmptyRow>}
            {rows.map((h) => (
              <tr key={h.id}>
                <td className="text-xs whitespace-nowrap text-neutral-600">{formatTimestampId(h.createdAt)}</td>
                <td>
                  <span className="font-medium text-neutral-900">{h.lead?.name ?? "-"}</span>
                  <span className="block text-xs text-neutral-500">
                    {h.lead?.domicile} · {h.lead ? formatDateShort(h.lead.reportDate) : ""}
                  </span>
                </td>
                <td>
                  {h.lead?.unit}
                  <span className="block text-xs text-neutral-500">{h.lead?.source}</span>
                </td>
                <td>
                  {h.groupName}
                  <span className="block text-xs text-neutral-500">{h.groupDealerName ?? h.groupRegion}</span>
                </td>
                <td>
                  <HandoverStatus h={h} />
                </td>
                <td className="text-right">
                  <Link className="btn btn-secondary btn-sm" href={`/handover/${h.leadId}`}>
                    Buka
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={total} pageSize={HANDOVER_PAGE_SIZE} hrefFor={(p) => withParams("/handover", { status, page: p })} />
    </>
  );
}
