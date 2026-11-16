import type { Metadata } from "next";
import { EmptyRow, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatTimestampId } from "@/lib/dates";
import { getAdminDb } from "@/lib/db/admin";
import { allowedEmails, readEnv, type EnvGroup } from "@/lib/env";
import { CheckButton, DeleteMappingButton } from "./checks";

export const metadata: Metadata = { title: "Pengaturan" };

function EnvStatus({ group }: { group: EnvGroup }) {
  const result = readEnv(group);
  if (result.ok) return <span className="text-sm font-medium text-emerald-700">Terkonfigurasi</span>;
  return (
    <div className="text-sm text-red-700">
      Belum lengkap
      <ul className="list-disc pl-5 text-xs">
        {result.problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const db = getAdminDb();
  const { data: mappings, error } = await db
    .from("region_mappings")
    .select("id, normalized_name, city, province, reporting_region, source, confidence, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Gagal membaca cache lokasi: ${error.message}`);
  const gemini = readEnv("gemini");

  return (
    <>
      <PageHeader title="Pengaturan" description="Status integrasi dan data lokasi yang dipelajari." />

      <section className="card mb-6 divide-y divide-neutral-100">
        <div className="grid gap-2 p-4 sm:grid-cols-[220px_1fr]">
          <div>
            <p className="font-medium text-neutral-900">Supabase</p>
            <p className="text-xs text-neutral-500">Database utama (sumber kebenaran)</p>
          </div>
          <EnvStatus group="supabase" />
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-[220px_1fr]">
          <div>
            <p className="font-medium text-neutral-900">Akses pengguna</p>
            <p className="text-xs text-neutral-500">ALLOWED_EMAILS</p>
          </div>
          <p className="text-sm text-neutral-700">
            {allowedEmails().size} email diizinkan. Anda masuk sebagai {user.email}.
          </p>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-[220px_1fr]">
          <div>
            <p className="font-medium text-neutral-900">Google Sheets</p>
            <p className="text-xs text-neutral-500">Spreadsheet DIPO LEAD REPORT via service account</p>
          </div>
          <div className="space-y-2">
            <EnvStatus group="sheets" />
            {readEnv("sheets").ok && <CheckButton kind="sheets" />}
          </div>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-[220px_1fr]">
          <div>
            <p className="font-medium text-neutral-900">Gemini API</p>
            <p className="text-xs text-neutral-500">Cadangan klasifikasi domisili (hanya teks domisili yang dikirim)</p>
          </div>
          <div className="space-y-2">
            <EnvStatus group="gemini" />
            {gemini.ok && <p className="text-xs text-neutral-600">Model: {gemini.value.GEMINI_MODEL}</p>}
            {gemini.ok && <CheckButton kind="gemini" />}
            {!gemini.ok && <p className="text-xs text-neutral-500">Tanpa Gemini, domisili yang tidak ada di database lokasi wajib dikonfirmasi manual.</p>}
          </div>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-[220px_1fr]">
          <div>
            <p className="font-medium text-neutral-900">Retry otomatis (cron)</p>
            <p className="text-xs text-neutral-500">CRON_SECRET untuk /api/cron/sync</p>
          </div>
          <EnvStatus group="cron" />
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold text-neutral-900">Lokasi yang dipelajari</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Hasil Gemini dan konfirmasi manual untuk domisili yang tidak ada di database lokasi bawaan. Hapus entri yang salah agar diklasifikasi ulang.
        </p>
        <div className="card overflow-x-auto">
          <table className="table min-w-[720px]">
            <thead>
              <tr>
                <th>Teks domisili</th>
                <th>Kota / Provinsi</th>
                <th>Wilayah</th>
                <th>Sumber</th>
                <th>Diperbarui</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {mappings.length === 0 && <EmptyRow colSpan={6}>Belum ada lokasi yang dipelajari.</EmptyRow>}
              {mappings.map((m) => (
                <tr key={m.id}>
                  <td className="font-mono text-xs">{m.normalized_name}</td>
                  <td>{[m.city, m.province].filter(Boolean).join(", ") || "—"}</td>
                  <td>{m.reporting_region ?? "Di luar 5 wilayah"}</td>
                  <td>{m.source === "ai" ? `Gemini (${m.confidence ?? "-"})` : "Manual"}</td>
                  <td className="text-xs text-neutral-600">{formatTimestampId(m.updated_at)}</td>
                  <td className="text-right">
                    <DeleteMappingButton id={m.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
