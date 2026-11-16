import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getAdminDb } from "@/lib/db/admin";
import { listDealers, listGroups } from "@/lib/master/service";
import { LeadForm } from "../lead-form";

export const metadata: Metadata = { title: "Tambah Prospek" };

export default async function AddLeadPage() {
  await requireUser();
  const db = getAdminDb();
  const [dealers, groups] = await Promise.all([listDealers(db, { activeOnly: true }), listGroups(db)]);
  return (
    <>
      <PageHeader
        title="Tambah Prospek"
        description="Data disimpan ke Supabase lalu disinkronkan ke tab bulanan Google Sheets DIPO LEAD REPORT."
      />
      <LeadForm dealers={dealers} groups={groups} />
    </>
  );
}
