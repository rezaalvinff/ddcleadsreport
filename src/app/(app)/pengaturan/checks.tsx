"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteMappingAction, setSpreadsheetTitleAction, testGeminiAction, testSheetsAction, type CheckResult } from "./actions";

function Result({ result }: { result: CheckResult | null }) {
  if (!result) return null;
  return (
    <div className={`mt-2 text-sm ${result.ok ? "text-emerald-700" : "text-red-700"}`}>
      <p>{result.message}</p>
      {result.detail && result.detail.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs text-neutral-600">
          {result.detail.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CheckButton({ kind }: { kind: "sheets" | "gemini" }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CheckResult | null>(null);
  const run = (fn: () => Promise<CheckResult>) =>
    start(async () => {
      try {
        setResult(await fn());
      } catch {
        setResult({ ok: false, message: "Permintaan gagal." });
      }
    });
  return (
    <div>
      <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(kind === "sheets" ? testSheetsAction : testGeminiAction)}>
        {pending ? "Memeriksa…" : kind === "sheets" ? "Tes koneksi Google Sheets" : "Cek model Gemini"}
      </button>
      <Result result={result} />
      {result?.titleMismatch && (
        <button type="button" className="btn btn-secondary btn-sm mt-2" disabled={pending} onClick={() => run(setSpreadsheetTitleAction)}>
          Ubah judul menjadi &ldquo;DIPO LEAD REPORT&rdquo;
        </button>
      )}
    </div>
  );
}

export function DeleteMappingButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-danger btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await deleteMappingAction(id);
            setError(res.ok ? null : res.message);
            router.refresh();
          })
        }
      >
        Hapus
      </button>
      {error && <span className="ml-2 text-xs text-red-700">{error}</span>}
    </>
  );
}
