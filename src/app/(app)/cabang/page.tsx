import type { Metadata } from "next";
import { EmptyRow, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getAdminDb } from "@/lib/db/admin";
import { listDealers, listGroups } from "@/lib/master/service";
import { DealerForm, GroupForm, RowControls } from "./forms";

export const metadata: Metadata = { title: "Master Cabang" };

export default async function MasterPage() {
  await requireUser();
  const db = getAdminDb();
  const [dealers, groups] = await Promise.all([listDealers(db), listGroups(db)]);

  return (
    <>
      <PageHeader title="Master Cabang" description="Dealer/cabang dan grup WhatsApp tujuan handover." />

      <section className="mb-8">
        <h2 className="mb-2 text-base font-semibold text-neutral-900">Dealer</h2>
        <div className="card mb-3 p-4">
          <DealerForm />
        </div>
        <div className="card overflow-x-auto">
          <table className="table min-w-[720px]">
            <thead>
              <tr>
                <th>Dealer</th>
                <th>Kota / Provinsi</th>
                <th>Wilayah</th>
                <th>Status</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {dealers.length === 0 && <EmptyRow colSpan={5}>Belum ada dealer. Tambahkan dealer/cabang DIPO di atas.</EmptyRow>}
              {dealers.map((d) => (
                <tr key={d.id} className={d.is_active ? "" : "text-neutral-400"}>
                  <td colSpan={4} className="p-0">
                    <details>
                      <summary className="grid cursor-pointer grid-cols-4 gap-3 px-3 py-2">
                        <span className="font-medium">{d.dealer_name}</span>
                        <span>
                          {d.city}
                          {d.province ? `, ${d.province}` : ""}
                        </span>
                        <span>{d.reporting_region}</span>
                        <span>{d.is_active ? "Aktif" : "Nonaktif"}</span>
                      </summary>
                      <div className="border-t border-neutral-100 bg-neutral-50 px-3 py-3">
                        <DealerForm dealer={d} />
                      </div>
                    </details>
                  </td>
                  <td className="text-right">
                    <RowControls kind="dealer" id={d.id} name={d.dealer_name} active={d.is_active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint mt-2">Klik baris untuk mengedit.</p>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold text-neutral-900">Grup WhatsApp</h2>
        <div className="card mb-3 p-4">
          <GroupForm dealers={dealers.filter((d) => d.is_active)} />
          <p className="hint mt-2">
            Hanya link undangan resmi (https://chat.whatsapp.com/…) yang bisa dibuka langsung. Tanpa link, aplikasi membuka WhatsApp Web dan
            Anda memilih grup secara manual.
          </p>
        </div>
        <div className="card overflow-x-auto">
          <table className="table min-w-[720px]">
            <thead>
              <tr>
                <th>Grup</th>
                <th>Dealer</th>
                <th>Wilayah</th>
                <th>Link</th>
                <th className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && <EmptyRow colSpan={5}>Belum ada grup WhatsApp.</EmptyRow>}
              {groups.map((g) => (
                <tr key={g.id} className={g.is_active ? "" : "text-neutral-400"}>
                  <td colSpan={4} className="p-0">
                    <details>
                      <summary className="grid cursor-pointer grid-cols-4 gap-3 px-3 py-2">
                        <span className="font-medium">
                          {g.group_name}
                          {!g.is_active && " (nonaktif)"}
                        </span>
                        <span>{g.dealer_name ?? "—"}</span>
                        <span>{g.reporting_region}</span>
                        <span>{g.group_link ? "Ada link undangan" : "Tanpa link"}</span>
                      </summary>
                      <div className="border-t border-neutral-100 bg-neutral-50 px-3 py-3">
                        <GroupForm group={g} dealers={dealers} />
                      </div>
                    </details>
                  </td>
                  <td className="text-right">
                    <RowControls kind="group" id={g.id} name={g.group_name} active={g.is_active} />
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
