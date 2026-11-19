import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, SyncBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatTimestampId } from "@/lib/dates";
import { getAdminDb } from "@/lib/db/admin";
import { listDealers } from "@/lib/master/service";
import { getServiceEntry } from "@/lib/service/service";
import { ServiceForm } from "../../../prospek/service-form";

export const metadata: Metadata = { title: "Edit Service" };

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getAdminDb();
  const [entry, dealers] = await Promise.all([getServiceEntry(db, id), listDealers(db)]);
  if (!entry) notFound();

  return (
    <>
      <PageHeader
        title={`Edit Service — ${entry.name}`}
        description={`Disubmit ${formatTimestampId(entry.createdAt)} (tidak berubah saat diedit). Terakhir diubah ${formatTimestampId(entry.updatedAt)}.`}
        actions={<SyncBadge status={entry.sync?.status} title={entry.sync?.error} />}
      />
      <ServiceForm
        dealers={dealers}
        entry={{
          id: entry.id,
          createdAt: entry.createdAt,
          values: {
            dealerId: entry.dealerId,
            name: entry.name,
            location: entry.location,
            unit: entry.unit,
            source: entry.source,
            entryDate: entry.entryDate ?? "",
            finalNote: entry.finalNote ?? "",
          },
        }}
      />
    </>
  );
}
