"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteLeadAction, resyncLeadAction } from "./actions";

export function LeadRowActions({ leadId, name, canResync }: { leadId: string; name: string; canResync: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      try {
        const res = await fn();
        setMessage({ ok: res.ok, text: res.message });
        router.refresh();
      } catch {
        setMessage({ ok: false, text: "Permintaan gagal. Coba lagi." });
      }
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1">
        <Link className="btn btn-secondary btn-sm" href={`/handover/${leadId}`}>
          Handover
        </Link>
        <Link className="btn btn-secondary btn-sm" href={`/prospek/${leadId}/edit`}>
          Edit
        </Link>
        {canResync && (
          <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => resyncLeadAction(leadId))}>
            Sinkron ulang
          </button>
        )}
        <button
          className="btn btn-danger btn-sm"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Hapus prospek "${name}"? Data juga akan dihapus dari laporan Google Sheets.`)) {
              run(() => deleteLeadAction(leadId));
            }
          }}
        >
          Hapus
        </button>
      </div>
      {message && <p className={`max-w-xs text-right text-xs ${message.ok ? "text-emerald-700" : "text-red-700"}`}>{message.text}</p>}
    </div>
  );
}
