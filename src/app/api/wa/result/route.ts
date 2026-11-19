import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isAuthorizedCron } from "@/lib/cron";
import { getAdminDb } from "@/lib/db/admin";
import { readEnv } from "@/lib/env";
import { finishSend } from "@/lib/whatsapp/queue";

export const dynamic = "force-dynamic";

const body = z.object({
  results: z
    .array(
      z.object({
        handoverId: z.uuid(),
        ok: z.boolean(),
        error: z.string().max(500).nullable().default(null),
      }),
    )
    .min(1)
    .max(20),
});

/** The worker reports what actually happened; nothing is marked sent otherwise. */
export async function POST(request: NextRequest) {
  const env = readEnv("waWorker");
  if (!env.ok) return NextResponse.json({ error: "WA_WORKER_SECRET is not configured" }, { status: 503 });
  if (!isAuthorizedCron(request.headers.get("authorization"), env.value.WA_WORKER_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const db = getAdminDb();
    for (const result of parsed.data.results) {
      await finishSend(db, result.handoverId, result.ok, result.error);
    }
    return NextResponse.json({ recorded: parsed.data.results.length });
  } catch (error) {
    console.error("[wa result]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Report failed" }, { status: 500 });
  }
}
