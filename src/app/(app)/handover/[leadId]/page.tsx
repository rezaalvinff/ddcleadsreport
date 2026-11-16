import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader, SyncBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateShort, sheetTitleForMonth } from "@/lib/dates";
import { getAdminDb } from "@/lib/db/admin";
import { listLeadHandovers } from "@/lib/handover/service";
import { getLead } from "@/lib/leads/service";
import { listGroups } from "@/lib/master/service";
import { param, type SearchParams } from "@/lib/search-params";
import { buildHandoverMessage } from "@/lib/whatsapp/message";
import { HandoverPanel } from "./handover-panel";

export const metadata: Metadata = { title: "Handover" };

export default async function HandoverPage({ params, searchParams }: { params: Promise<{ leadId: string }>; searchParams: Promise<SearchParams> }) {
  await requireUser();
  const { leadId } = await params;
  const justSaved = param(await searchParams, "saved") === "1";
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) notFound();
  const db = getAdminDb();
  const [lead, handovers, groups] = await Promise.all([getLead(db, leadId), listLeadHandovers(db, leadId), listGroups(db, { activeOnly: true })]);
  if (!lead) notFound();

  const handoverLead = { name: lead.name, domicile: lead.domicile, unit: lead.unit, source: lead.source };
  return (
    <>
      <PageHeader
        title={`Handover — ${lead.name}`}
        description={`${lead.domicile} · ${lead.reportingRegion} · ${lead.dealerName} · tanggal laporan ${formatDateShort(lead.reportDate)}`}
        actions={
          <Link className="btn btn-secondary" href={`/prospek/${lead.id}/edit`}>
            Edit prospek
          </Link>
        }
      />
      <div className="mb-4">
        <Notice tone={lead.sync?.status === "success" ? "success" : lead.sync?.status === "failed" ? "error" : "info"}>
          {justSaved && "Prospek tersimpan di database. "}
          Google Sheets: <SyncBadge status={lead.sync?.status} />{" "}
          {lead.sync?.status === "success" && `tab ${sheetTitleForMonth(lead.sync.month)}.`}
          {lead.sync?.status === "pending" && `Menunggu dikirim ke tab ${sheetTitleForMonth(lead.sync.month)}; tekan "Kirim sekarang" di Dashboard.`}
          {lead.sync?.status === "failed" && `${lead.sync.error ?? ""} Coba kirim lagi dari Dashboard atau Laporan Bulanan.`}
        </Notice>
      </div>
      <HandoverPanel leadId={lead.id} lead={handoverLead} message={buildHandoverMessage(handoverLead)} handovers={handovers} groups={groups} />
    </>
  );
}
