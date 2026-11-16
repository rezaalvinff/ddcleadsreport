"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resyncAllAction, resyncMonthAction, type SyncActionResult } from "./actions";

export function SyncButton({ monthKey, label, primary }: { monthKey?: string; label: string; primary?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SyncActionResult | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className={`btn ${primary ? "btn-primary" : "btn-secondary"} btn-sm`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              setResult(await (monthKey ? resyncMonthAction(monthKey) : resyncAllAction()));
            } catch {
              setResult({ ok: false, message: "Permintaan gagal." });
            }
            router.refresh();
          })
        }
      >
        {pending ? "Menyinkronkan…" : label}
      </button>
      {result && <p className={`max-w-md text-xs ${result.ok ? "text-emerald-700" : "text-red-700"}`}>{result.message}</p>}
    </div>
  );
}
