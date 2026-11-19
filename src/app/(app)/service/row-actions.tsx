"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteServiceAction, resyncServiceAction } from "../prospek/service-actions";

export function ServiceRowActions({ serviceId, name, canResync }: { serviceId: string; name: string; canResync: boolean }) {
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
        <Link className="btn btn-secondary btn-sm" href={`/service/${serviceId}/edit`}>
          Edit
        </Link>
        {canResync && (
          <button className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => resyncServiceAction(serviceId))}>
            Sinkron ulang
          </button>
        )}
        <button
          className="btn btn-danger btn-sm"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Hapus data service "${name}"? Data juga akan dihapus dari blok SERVICE di Google Sheets.`)) {
              run(() => deleteServiceAction(serviceId));
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
