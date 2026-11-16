import "server-only";
import { dbError, type Db } from "../db/admin";

export interface HandoverRow {
  id: string;
  leadId: string;
  groupId: string;
  groupName: string;
  groupLink: string | null;
  groupDealerName: string | null;
  groupRegion: string;
  copiedAt: string | null;
  openedAt: string | null;
  sentMarkedAt: string | null;
  createdAt: string;
  lead: { name: string; domicile: string; unit: string; source: string; reportDate: string; dealerName: string } | null;
}

const HANDOVER_SELECT =
  "id, lead_id, whatsapp_group_id, copied_at, opened_at, sent_marked_at, created_at, group:whatsapp_groups(group_name, group_link, reporting_region, dealer:dealers(dealer_name)), lead:leads(name, domicile, unit, source, report_date, dealer:dealers(dealer_name))";

type Row = {
  id: string;
  lead_id: string;
  whatsapp_group_id: string;
  copied_at: string | null;
  opened_at: string | null;
  sent_marked_at: string | null;
  created_at: string;
  group: { group_name: string; group_link: string | null; reporting_region: string; dealer: { dealer_name: string } | null } | null;
  lead: { name: string; domicile: string; unit: string; source: string; report_date: string; dealer: { dealer_name: string } | null } | null;
};

function toHandover(r: Row): HandoverRow {
  return {
    id: r.id,
    leadId: r.lead_id,
    groupId: r.whatsapp_group_id,
    groupName: r.group?.group_name ?? "-",
    groupLink: r.group?.group_link ?? null,
    groupDealerName: r.group?.dealer?.dealer_name ?? null,
    groupRegion: r.group?.reporting_region ?? "-",
    copiedAt: r.copied_at,
    openedAt: r.opened_at,
    sentMarkedAt: r.sent_marked_at,
    createdAt: r.created_at,
    lead: r.lead
      ? {
          name: r.lead.name,
          domicile: r.lead.domicile,
          unit: r.lead.unit,
          source: r.lead.source,
          reportDate: r.lead.report_date,
          dealerName: r.lead.dealer?.dealer_name ?? "-",
        }
      : null,
  };
}

export async function listLeadHandovers(db: Db, leadId: string): Promise<HandoverRow[]> {
  const { data, error } = await db.from("lead_handovers").select(HANDOVER_SELECT).eq("lead_id", leadId).order("created_at");
  if (error) throw dbError("Gagal membaca handover", error);
  return (data as unknown as Row[]).map(toHandover);
}

export const HANDOVER_PAGE_SIZE = 30;

export async function listHandoverHistory(
  db: Db,
  filters: { status?: string },
  page: number,
): Promise<{ rows: HandoverRow[]; total: number }> {
  let q = db.from("lead_handovers").select(HANDOVER_SELECT, { count: "exact" });
  if (filters.status === "sent") q = q.not("sent_marked_at", "is", null);
  if (filters.status === "open") q = q.is("sent_marked_at", null);
  const from = (page - 1) * HANDOVER_PAGE_SIZE;
  const { data, error, count } = await q.order("created_at", { ascending: false }).range(from, from + HANDOVER_PAGE_SIZE - 1);
  if (error) throw dbError("Gagal membaca riwayat handover", error);
  return { rows: (data as unknown as Row[]).map(toHandover), total: count ?? 0 };
}

export async function markHandoversCopied(db: Db, leadId: string): Promise<void> {
  const { error } = await db.from("lead_handovers").update({ copied_at: new Date().toISOString() }).eq("lead_id", leadId);
  if (error) throw dbError("Gagal mencatat penyalinan pesan", error);
}

export async function markHandoverOpened(db: Db, handoverId: string): Promise<void> {
  const { error } = await db.from("lead_handovers").update({ opened_at: new Date().toISOString() }).eq("id", handoverId);
  if (error) throw dbError("Gagal mencatat pembukaan WhatsApp", error);
}

/** Only ever set by an explicit user confirmation that they sent the message. */
export async function setHandoverSent(db: Db, handoverId: string, sent: boolean): Promise<void> {
  const { error } = await db
    .from("lead_handovers")
    .update({ sent_marked_at: sent ? new Date().toISOString() : null })
    .eq("id", handoverId);
  if (error) throw dbError("Gagal memperbarui status handover", error);
}
