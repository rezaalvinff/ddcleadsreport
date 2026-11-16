import type { LeadSource } from "@/lib/constants";
import { formatDayDateId } from "@/lib/dates";
import type { DailyPoint, NamedCount } from "@/lib/dashboard";

/**
 * Server-rendered charts: plain elements plus CSS hover, so the dashboard needs
 * no client bundle. Colours are the validated categorical slots 1–3; every
 * series is also named in a legend and its value printed, so identity never
 * rests on colour alone.
 */

export const SOURCE_COLORS: Record<LeadSource, string> = {
  GOOGLE: "#2a78d6",
  META: "#eb6834",
  TIKTOK: "#1baf7a",
};

/** Summary order used by the spreadsheet, kept here so both read alike. */
const SOURCE_ORDER: readonly LeadSource[] = ["GOOGLE", "META", "TIKTOK"];

function percent(value: number, total: number): string {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : "0%";
}

export function ChartCard({
  title,
  subtitle,
  children,
  aside,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function SourceLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {SOURCE_ORDER.map((source) => (
        <li key={source} className="flex items-center gap-1.5 text-xs text-neutral-600">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SOURCE_COLORS[source] }} aria-hidden />
          {source}
        </li>
      ))}
    </ul>
  );
}

/** Daily stacked bars: one column per calendar day, segments per source. */
export function DailySourceChart({ daily, emptyLabel }: { daily: DailyPoint[]; emptyLabel: string }) {
  const max = Math.max(1, ...daily.map((d) => d.total));
  const anyData = daily.some((d) => d.total > 0);
  const ticks = [max, Math.round(max / 2), 0].filter((v, i, all) => all.indexOf(v) === i);

  if (!anyData) {
    return <p className="py-10 text-center text-sm text-neutral-500">{emptyLabel}</p>;
  }

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex h-40 w-7 shrink-0 flex-col justify-between py-0.5 text-right text-[10px] text-neutral-400 tabular-nums">
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((t) => (
              <span key={t} className="block border-t border-neutral-100" />
            ))}
          </div>
          <ol className="relative flex h-40 items-end gap-[2px]">
            {daily.map((point) => {
              const day = Number(point.date.slice(8, 10));
              return (
                <li key={point.date} className="group relative flex h-full flex-1 flex-col justify-end gap-[2px]">
                  {SOURCE_ORDER.map((source, i) => {
                    const value = point.bySource[source];
                    if (value === 0) return null;
                    const isTop = SOURCE_ORDER.slice(i + 1).every((s) => point.bySource[s] === 0);
                    return (
                      <span
                        key={source}
                        className={isTop ? "block rounded-t" : "block"}
                        style={{ height: `${(value / max) * 100}%`, background: SOURCE_COLORS[source], minHeight: "3px" }}
                      />
                    );
                  })}
                  {point.total === 0 && <span className="block h-[2px] rounded-sm bg-neutral-100" />}
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-left text-xs whitespace-nowrap shadow-lg group-hover:block"
                  >
                    <p className="font-medium text-neutral-900">{formatDayDateId(point.date)}</p>
                    {SOURCE_ORDER.map((source) => (
                      <p key={source} className="flex items-center gap-1.5 text-neutral-600">
                        <span className="h-2 w-2 rounded-sm" style={{ background: SOURCE_COLORS[source] }} aria-hidden />
                        {source}: <span className="tabular-nums">{point.bySource[source]}</span>
                      </p>
                    ))}
                    <p className="mt-0.5 border-t border-neutral-100 pt-0.5 font-medium text-neutral-900">
                      Total: <span className="tabular-nums">{point.total}</span>
                    </p>
                  </div>
                  <span className="sr-only">
                    {formatDayDateId(point.date)}: {point.total} prospek
                  </span>
                  <span
                    aria-hidden
                    className={`mt-1 block text-center text-[10px] tabular-nums ${
                      day % 5 === 0 || day === 1 ? "text-neutral-400" : "text-transparent"
                    }`}
                  >
                    {day}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

/** Horizontal ranking bars for one measure. */
export function RankBars({
  items,
  total,
  color,
  emptyLabel,
  hrefFor,
  limit,
}: {
  items: NamedCount[];
  total: number;
  color?: string | ((item: NamedCount) => string);
  emptyLabel: string;
  hrefFor?: (item: NamedCount) => string;
  limit?: number;
}) {
  const shown = limit ? items.slice(0, limit) : items;
  const max = Math.max(1, ...shown.map((i) => i.count));
  if (shown.length === 0) return <p className="py-6 text-center text-sm text-neutral-500">{emptyLabel}</p>;

  return (
    <ul className="space-y-2.5">
      {shown.map((item) => {
        const fill = typeof color === "function" ? color(item) : (color ?? "var(--color-brand-600)");
        const label = hrefFor ? (
          <a className="truncate hover:text-brand-700 hover:underline" href={hrefFor(item)}>
            {item.name}
          </a>
        ) : (
          <span className="truncate">{item.name}</span>
        );
        return (
          <li key={item.name}>
            <div className="flex items-baseline justify-between gap-3 text-sm text-neutral-700">
              {label}
              <span className="shrink-0 tabular-nums">
                <span className="font-medium text-neutral-900">{item.count}</span>{" "}
                <span className="text-xs text-neutral-500">{percent(item.count, total)}</span>
              </span>
            </div>
            <div className="mt-1 h-2 rounded-sm bg-neutral-100">
              <div
                className="h-2 rounded-sm"
                style={{ width: `${Math.max((item.count / max) * 100, item.count > 0 ? 2 : 0)}%`, background: fill }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function sourceItems(bySource: Record<LeadSource, number>): NamedCount[] {
  return SOURCE_ORDER.map((source) => ({ name: source, count: bySource[source] }));
}

export function sourceColor(item: NamedCount): string {
  return SOURCE_COLORS[item.name as LeadSource] ?? "var(--color-brand-600)";
}
