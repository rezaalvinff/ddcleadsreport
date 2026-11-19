import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getAdminDb } from "@/lib/db/admin";
import { listDealers, listGroups } from "@/lib/master/service";
import { param, type SearchParams } from "@/lib/search-params";
import { LeadForm } from "../lead-form";
import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Tambah Prospek" };

export default async function AddEntryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireUser();
  const isService = param(await searchParams, "jenis") === "service";
  const db = getAdminDb();
  const [dealers, groups] = await Promise.all([
    listDealers(db, { activeOnly: !isService }),
    isService ? Promise.resolve([]) : listGroups(db),
  ]);

  const tab = (href: string, label: string, active: boolean, hint: string) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex-1 rounded-lg border px-4 py-3 text-left transition-colors sm:flex-none sm:min-w-56 ${
        active ? "border-brand-600 bg-brand-50" : "border-neutral-200 bg-white hover:bg-neutral-50"
      }`}
    >
      <span className={`block text-sm font-semibold ${active ? "text-brand-700" : "text-neutral-900"}`}>{label}</span>
      <span className="mt-0.5 block text-xs text-neutral-500">{hint}</span>
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Tambah Prospek"
        description="Data disimpan ke Supabase lalu menunggu dikirim ke tab bulanan Google Sheets."
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {tab("/prospek/tambah", "Sales", !isService, "Masuk tabel wilayah + pesan WhatsApp")}
        {tab("/prospek/tambah?jenis=service", "Service", isService, "Masuk blok SERVICE, tanpa pesan WhatsApp")}
      </div>
      {isService ? <ServiceForm dealers={dealers} /> : <LeadForm dealers={dealers} groups={groups} />}
    </>
  );
}
