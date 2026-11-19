import "server-only";
import { dbError, type Db } from "../db/admin";
import { buildHandoverMessage } from "./message";

/**
 * Queue of handover messages waiting for the WhatsApp worker.
 *
 * The app never connects to WhatsApp. It only marks handovers as queued and
 * records what the worker reports back, so manual sending always stays
 * available and a message is never reported as sent without confirmation.
 */

export interface ClaimedSend {
  handoverId: string;
  groupName: string;
  message: string;
}

/** Queues every destination group of a lead that is not sent yet. */
export async function queueHandoverSends(db: Db, leadId: string): Promise<number> {
  const { data, error } = await db
    .from("lead_handovers")
    .update({ auto_status: "queued", auto_queued_at: new Date().toISOString() })
    .eq("lead_id", leadId)
    .is("sent_marked_at", null)
    .select("id");
  if (error) throw dbError("Gagal mengantrekan pengiriman WhatsApp", error);
  return data.length;
}

export async function claimSends(db: Db, limit: number, staleSeconds = 120): Promise<ClaimedSend[]> {
  const { data, error } = await db.rpc("claim_whatsapp_sends", { p_limit: limit, p_stale_seconds: staleSeconds });
  if (error) throw dbError("Gagal mengambil antrean WhatsApp", error);
  return data.map((row) => ({
    handoverId: row.handover_id,
    groupName: row.group_name,
    // The template lives in one place; the worker only forwards the text.
    message: buildHandoverMessage({
      name: row.lead_name,
      phone: row.phone,
      domicile: row.domicile,
      unit: row.unit,
      source: row.source,
      customerNote: row.customer_note,
    }),
  }));
}

export async function finishSend(db: Db, handoverId: string, ok: boolean, error: string | null): Promise<void> {
  const result = await db.rpc("finish_whatsapp_send", { p_handover: handoverId, p_ok: ok, p_error: error });
  if (result.error) throw dbError("Gagal mencatat hasil pengiriman WhatsApp", result.error);
}

export interface AutoSendSummary {
  queued: number;
  sending: number;
  failed: number;
  sentToday: number;
}

export async function getAutoSendSummary(db: Db, sinceIso: string): Promise<AutoSendSummary> {
  const [open, sent] = await Promise.all([
    db.from("lead_handovers").select("auto_status").in("auto_status", ["queued", "sending", "failed"]),
    db.from("lead_handovers").select("id", { count: "exact", head: true }).eq("auto_status", "sent").gte("auto_updated_at", sinceIso),
  ]);
  if (open.error) throw dbError("Gagal membaca antrean WhatsApp", open.error);
  if (sent.error) throw dbError("Gagal membaca antrean WhatsApp", sent.error);
  const count = (status: string) => open.data.filter((r) => r.auto_status === status).length;
  return { queued: count("queued"), sending: count("sending"), failed: count("failed"), sentToday: sent.count ?? 0 };
}
