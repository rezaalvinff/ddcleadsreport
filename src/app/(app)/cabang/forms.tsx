"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { REPORTING_REGIONS } from "@/lib/constants";
import { matchLocation } from "@/lib/location/match";
import type { Dealer, WhatsappGroup } from "@/lib/master/types";
import { deleteMasterAction, saveDealerAction, saveGroupAction, setActiveAction, type FormState } from "./actions";

const INITIAL: FormState = { ok: false, message: null };

function useResetOnSave(state: FormState, reset: boolean) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (reset && state.ok && state.savedAt) ref.current?.reset();
  }, [state, reset]);
  return ref;
}

function StateMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <p className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>;
}

export function DealerForm({ dealer }: { dealer?: Dealer }) {
  const [state, action, pending] = useActionState(saveDealerAction, INITIAL);
  const ref = useResetOnSave(state, !dealer);
  const [region, setRegion] = useState<string>(dealer?.reporting_region ?? "");
  const [province, setProvince] = useState(dealer?.province ?? "");
  const [hint, setHint] = useState<string | null>(null);

  // Suggest province/region from the dealer city using the deterministic dataset.
  const suggest = (city: string) => {
    const match = matchLocation(city);
    if (match.kind === "resolved" && match.place.region) {
      if (!region) setRegion(match.place.region);
      if (!province && match.place.province) setProvince(match.place.province);
      setHint(`Saran: ${match.place.province ?? ""} → ${match.place.region}`);
    } else {
      setHint(city.trim() ? "Kota tidak dikenali otomatis; pilih wilayah secara manual." : null);
    }
  };

  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] lg:items-end">
      {dealer && <input type="hidden" name="id" value={dealer.id} />}
      <div>
        <label className="label">Nama dealer</label>
        <input name="dealer_name" required defaultValue={dealer?.dealer_name} className="input" maxLength={120} />
      </div>
      <div>
        <label className="label">Kota</label>
        <input name="city" required defaultValue={dealer?.city} className="input" maxLength={120} onBlur={(e) => suggest(e.target.value)} />
      </div>
      <div>
        <label className="label">Provinsi</label>
        <input name="province" value={province} onChange={(e) => setProvince(e.target.value)} className="input" maxLength={120} />
      </div>
      <div>
        <label className="label">Wilayah pelaporan</label>
        <select name="reporting_region" required value={region} onChange={(e) => setRegion(e.target.value)} className="input">
          <option value="">— Pilih —</option>
          {REPORTING_REGIONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <button className="btn btn-primary" disabled={pending}>
        {dealer ? "Simpan" : "Tambah dealer"}
      </button>
      <div className="sm:col-span-2 lg:col-span-5">
        {hint && <p className="hint">{hint}</p>}
        <StateMessage state={state} />
      </div>
    </form>
  );
}

export function GroupForm({ group, dealers }: { group?: WhatsappGroup; dealers: Dealer[] }) {
  const [state, action, pending] = useActionState(saveGroupAction, INITIAL);
  const ref = useResetOnSave(state, !group);
  const [region, setRegion] = useState<string>(group?.reporting_region ?? "");

  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1.2fr_1fr_1.6fr_auto] lg:items-end">
      {group && <input type="hidden" name="id" value={group.id} />}
      <div>
        <label className="label">Nama grup</label>
        <input name="group_name" required defaultValue={group?.group_name} className="input" maxLength={120} />
      </div>
      <div>
        <label className="label">Dealer / cabang</label>
        <select
          name="dealer_id"
          defaultValue={group?.dealer_id ?? ""}
          className="input"
          onChange={(e) => {
            const d = dealers.find((x) => x.id === e.target.value);
            if (d) setRegion(d.reporting_region);
          }}
        >
          <option value="">Tanpa dealer</option>
          {dealers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.dealer_name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Wilayah</label>
        <select name="reporting_region" required value={region} onChange={(e) => setRegion(e.target.value)} className="input">
          <option value="">— Pilih —</option>
          {REPORTING_REGIONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Link undangan (opsional)</label>
        <input name="group_link" defaultValue={group?.group_link ?? ""} className="input" placeholder="https://chat.whatsapp.com/…" />
      </div>
      <button className="btn btn-primary" disabled={pending}>
        {group ? "Simpan" : "Tambah grup"}
      </button>
      <div className="sm:col-span-2 lg:col-span-5">
        <StateMessage state={state} />
      </div>
    </form>
  );
}

export function RowControls({ kind, id, name, active }: { kind: "dealer" | "group"; id: string; name: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const run = (fn: () => Promise<FormState>) =>
    start(async () => {
      try {
        const res = await fn();
        setMessage(res.ok ? null : res.message);
        router.refresh();
      } catch {
        setMessage("Permintaan gagal.");
      }
    });
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => setActiveAction(kind, id, !active))}>
          {active ? "Nonaktifkan" : "Aktifkan"}
        </button>
        <button
          className="btn btn-danger btn-sm"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Hapus "${name}"? Data yang sudah dipakai tidak bisa dihapus; nonaktifkan saja.`)) {
              run(() => deleteMasterAction(kind, id));
            }
          }}
        >
          Hapus
        </button>
      </div>
      {message && <p className="max-w-xs text-right text-xs text-red-700">{message}</p>}
    </div>
  );
}
