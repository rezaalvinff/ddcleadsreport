import Link from "next/link";
import type { SyncStatus } from "@/lib/constants";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const SYNC_STYLES: Record<SyncStatus, { label: string; className: string }> = {
  success: { label: "Tersinkron", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  pending: { label: "Menunggu", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  failed: { label: "Gagal", className: "bg-red-50 text-red-700 ring-red-200" },
};

export function SyncBadge({ status, title }: { status: SyncStatus | null | undefined; title?: string | null }) {
  const style = status ? SYNC_STYLES[status] : { label: "Belum ada", className: "bg-neutral-50 text-neutral-600 ring-neutral-200" };
  return (
    <span title={title ?? undefined} className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}>
      {style.label}
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "warning" | "error"; children: React.ReactNode }) {
  const tones = {
    info: "border-neutral-200 bg-neutral-50 text-neutral-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-800",
  };
  return <div className={`rounded-md border px-3 py-2 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Pagination({ page, total, pageSize, hrefFor }: { page: number; total: number; pageSize: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
      <span>
        Halaman {page} dari {pages} · {total} data
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className="btn btn-secondary btn-sm" href={hrefFor(page - 1)}>
            Sebelumnya
          </Link>
        ) : null}
        {page < pages ? (
          <Link className="btn btn-secondary btn-sm" href={hrefFor(page + 1)}>
            Berikutnya
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-8 text-center text-sm text-neutral-500">
        {children}
      </td>
    </tr>
  );
}
