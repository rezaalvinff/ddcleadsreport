import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { readEnv } from "@/lib/env";
import { appSyncDeps } from "@/lib/sync/app";
import { syncDirtyMonths } from "@/lib/sync/service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Retries every month whose Google Sheets tab is behind the database. */
export async function GET(request: NextRequest) {
  const env = readEnv("cron");
  if (!env.ok) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!isAuthorizedCron(request.headers.get("authorization"), env.value.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const outcomes = await syncDirtyMonths(appSyncDeps());
    const failed = outcomes.filter((o) => o.status !== "success");
    return NextResponse.json({ synced: outcomes.length - failed.length, failed: failed.length, outcomes }, { status: failed.length ? 207 : 200 });
  } catch (error) {
    console.error("[cron sync]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sync failed" }, { status: 500 });
  }
}
