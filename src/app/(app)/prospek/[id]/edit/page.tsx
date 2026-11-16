import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, SyncBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { UNIT_OPTIONS, UNIT_OTHER } from "@/lib/constants";
import { formatTimestampId } from "@/lib/dates";
import { getAdminDb } from "@/lib/db/admin";
import { listLeadHandovers } from "@/lib/handover/service";
import { getLead } from "@/lib/leads/service";
import { listDealers, listGroups } from "@/lib/master/service";
import { LeadForm } from "../../lead-form";

export const metadata: Metadata = { title: "Edit Prospek" };

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getAdminDb();
  const [lead, dealers, groups, handovers] = await Promise.all([getLead(db, id), listDealers(db), listGroups(db), listLeadHandovers(db, id)]);
  if (!lead) notFound();

  const knownUnit = (UNIT_OPTIONS as readonly string[]).includes(lead.unit);
  return (
    <>
      <PageHeader
        title={`Edit Prospek — ${lead.name}`}
        description={`Disubmit ${formatTimestampId(lead.createdAt)} (tidak berubah saat diedit). Terakhir diubah ${formatTimestampId(lead.updatedAt)}.`}
        actions={<SyncBadge status={lead.sync?.status} title={lead.sync?.error} />}
      />
      <LeadForm
        dealers={dealers}
        groups={groups}
        lead={{
          id: lead.id,
          createdAt: lead.createdAt,
          classification: lead.classificationStatus,
          values: {
            name: lead.name,
            phone: lead.phone,
            domicile: lead.domicile,
            leadDate: lead.leadDate ?? "",
            dealerId: lead.dealerId,
            unit: knownUnit ? lead.unit : UNIT_OTHER,
            unitOther: knownUnit ? "" : lead.unit,
            followUpDate: lead.followUpDate ?? "",
            source: lead.source,
            reportingRegion: lead.reportingRegion,
            customerNote: lead.customerNote ?? "",
            groupIds: handovers.map((h) => h.groupId),
          },
        }}
      />
    </>
  );
}
