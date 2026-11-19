"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Notice } from "@/components/ui";
import { formatTimestampId } from "@/lib/dates";
import type { HandoverRow } from "@/lib/handover/service";
import type { WhatsappGroup } from "@/lib/master/types";
import { copyHandoverMessage, handoverTarget, type HandoverLead } from "@/lib/whatsapp/message";
import { markCopiedAction, markOpenedAction, setSentAction, updateHandoverGroupsAction } from "../actions";

interface Props {
  leadId: string;
  lead: HandoverLead;
  message: string;
  handovers: HandoverRow[];
  groups: WhatsappGroup[];
}

export function HandoverPanel({ leadId, lead, message, handovers, groups }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copyState, setCopyState] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(handovers.length === 0);
  const [selected, setSelected] = useState(handovers.map((h) => h.groupId));

  const call = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      try {
        const res = await fn();
        if (!res.ok) setError(res.message ?? "Gagal.");
        else after?.();
        router.refresh();
      } catch {
        setError("Permintaan ke server gagal.");
      }
    });

  const copy = async () => {
    try {
      await copyHandoverMessage(navigator.clipboard, lead);
      setCopyState({ ok: true, text: "Pesan disalin ke clipboard." });
      if (handovers.length > 0) call(() => markCopiedAction(leadId));
    } catch {
      setCopyState({ ok: false, text: "Browser menolak akses clipboard. Blok teks pesan di atas lalu salin manual (Ctrl+C)." });
    }
  };

  const open = (h: HandoverRow) => {
    const target = handoverTarget({ group_name: h.groupName, group_link: h.groupLink });
    window.open(target.url, "_blank", "noopener,noreferrer");
    call(() => markOpenedAction(h.id));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <section className="card p-5">
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Pesan</h2>
          <textarea readOnly value={message} rows={7} className="input font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={copy}>
              Salin Pesan
            </button>
            {copyState && <span className={`text-sm ${copyState.ok ? "text-emerald-700" : "text-red-700"}`}>{copyState.text}</span>}
          </div>
        </section>

        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-neutral-900">Grup Tujuan</h2>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing((e) => !e)}>
              {editing ? "Tutup" : "Ubah grup"}
            </button>
          </div>
          {error && (
            <div className="mb-3">
              <Notice tone="error">{error}</Notice>
            </div>
          )}

          {editing && (
            <div className="mb-4 rounded-md border border-neutral-200 p-3">
              {groups.length === 0 ? (
                <p className="text-sm text-neutral-600">Belum ada grup aktif. Tambahkan di Master Cabang.</p>
              ) : (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {groups.map((g) => (
                    <label key={g.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-brand-600"
                        checked={selected.includes(g.id)}
                        onChange={() => setSelected((s) => (s.includes(g.id) ? s.filter((x) => x !== g.id) : [...s, g.id]))}
                      />
                      <span>
                        {g.group_name}
                        <span className="block text-xs text-neutral-500">
                          {g.dealer_name ?? "Tanpa dealer"} · {g.reporting_region}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="btn btn-primary btn-sm mt-3"
                disabled={pending}
                onClick={() => call(() => updateHandoverGroupsAction(leadId, selected), () => setEditing(false))}
              >
                Simpan grup
              </button>
            </div>
          )}

          {handovers.length === 0 ? (
            <p className="text-sm text-neutral-600">Belum ada grup tujuan untuk prospek ini.</p>
          ) : (
            <ul className="space-y-3">
              {handovers.map((h) => {
                const target = handoverTarget({ group_name: h.groupName, group_link: h.groupLink });
                return (
                  <li key={h.id} className="rounded-md border border-neutral-200 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-neutral-900">{h.groupName}</p>
                        <p className="text-xs text-neutral-500">
                          {h.groupDealerName ?? "Tanpa dealer"} · {h.groupRegion}
                        </p>
                      </div>
                      <HandoverStatus h={h} />
                    </div>
                    <p className="mt-2 text-xs text-neutral-600">{target.instruction}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(h)}>
                        {target.label}
                      </button>
                      {h.sentMarkedAt ? (
                        <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => call(() => setSentAction(h.id, false))}>
                          Batalkan tanda terkirim
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={pending}
                          onClick={() => {
                            if (window.confirm(`Konfirmasi: Anda sudah mengirim pesan ini sendiri ke grup "${h.groupName}"?`)) {
                              call(() => setSentAction(h.id, true));
                            }
                          }}
                        >
                          Saya sudah mengirim
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <aside className="card h-fit p-4 text-sm text-neutral-700">
        <h2 className="mb-2 font-semibold text-neutral-900">Cara mengirim</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Klik Salin Pesan.</li>
          <li>Buka link grup, atau buka WhatsApp Web lalu pilih grup secara manual.</li>
          <li>Tempel pesan dan kirim sendiri dari WhatsApp.</li>
          <li>Klik &ldquo;Saya sudah mengirim&rdquo; agar riwayat tercatat.</li>
        </ol>
        <p className="mt-3 text-xs text-neutral-500">
          Aplikasi ini tidak mengirim pesan WhatsApp otomatis dan tidak terhubung ke nomor WhatsApp Business Anda. Status &ldquo;terkirim&rdquo; hanya
          berdasarkan konfirmasi Anda.
        </p>
      </aside>
    </div>
  );
}

export function HandoverStatus({
  h,
}: {
  h: Pick<HandoverRow, "sentMarkedAt" | "openedAt" | "copiedAt" | "autoStatus" | "autoError" | "autoAttempts">;
}) {
  if (h.autoStatus === "failed") {
    return (
      <span className="text-xs text-red-700">
        Kirim otomatis gagal ({h.autoAttempts}x){h.autoError ? `: ${h.autoError}` : ""}. Kirim manual di bawah.
      </span>
    );
  }
  if (h.autoStatus === "queued" || h.autoStatus === "sending") {
    return <span className="text-xs text-amber-700">Menunggu worker WhatsApp mengirim…</span>;
  }
  if (h.autoStatus === "sent" && h.sentMarkedAt) {
    return <span className="text-xs font-medium text-emerald-700">Terkirim otomatis · {formatTimestampId(h.sentMarkedAt)}</span>;
  }
  if (h.sentMarkedAt)
    return <span className="text-xs font-medium text-emerald-700">Ditandai terkirim · {formatTimestampId(h.sentMarkedAt)}</span>;
  if (h.openedAt) return <span className="text-xs text-amber-700">WhatsApp dibuka {formatTimestampId(h.openedAt)} · belum dikonfirmasi</span>;
  if (h.copiedAt) return <span className="text-xs text-amber-700">Pesan disalin {formatTimestampId(h.copiedAt)} · belum dikonfirmasi</span>;
  return <span className="text-xs text-neutral-500">Belum dikirim</span>;
}
