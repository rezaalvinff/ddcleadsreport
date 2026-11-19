import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isAuthorizedCron } from "@/lib/cron";
import { getAdminDb } from "@/lib/db/admin";
import { readEnv } from "@/lib/env";
import { claimSends } from "@/lib/whatsapp/queue";

export const dynamic = "force-dynamic";

const body = z.object({ limit: z.number().int().min(1).max(20).default(5) });

/**
 * The WhatsApp worker pulls its work from here, so it needs no public address
 * of its own and runs the same on a laptop or the office VPS.
 */
export async function POST(request: NextRequest) {
  const env = readEnv("waWorker");
  if (!env.ok) return NextResponse.json({ error: "WA_WORKER_SECRET is not configured" }, { status: 503 });
  if (!isAuthorizedCron(request.headers.get("authorization"), env.value.WA_WORKER_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const sends = await claimSends(getAdminDb(), parsed.data.limit);
    return NextResponse.json({ sends });
  } catch (error) {
    console.error("[wa poll]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Poll failed" }, { status: 500 });
  }
}
