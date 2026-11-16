import { randomUUID } from "node:crypto";
import type pg from "pg";

export async function insertDealer(pool: pg.Pool, name = "DIPO Test Bandung", region = "JAWA BARAT"): Promise<string> {
  const r = await pool.query(
    "insert into public.dealers (dealer_name, city, province, reporting_region) values ($1, 'Bandung', 'Jawa Barat', $2) returning id",
    [name, region],
  );
  return r.rows[0].id;
}

export interface LeadFields {
  name?: string;
  phone?: string;
  domicile?: string;
  region?: string;
  leadDate?: string | null;
  createdAt?: string;
  source?: string;
  followUp?: string | null;
  unit?: string;
}

export async function insertLead(pool: pg.Pool, dealerId: string, f: LeadFields = {}): Promise<{ id: string; report_date: string }> {
  const r = await pool.query(
    `insert into public.leads (submission_id, name, phone, domicile, reporting_region, classification_status, lead_date,
                               dealer_id, unit, follow_up_date, source, created_at)
     values ($1, $2, $3, $4, $5, 'mapped', $6, $7, $8, $9, $10, coalesce($11::timestamptz, now()))
     returning id, to_char(report_date, 'YYYY-MM-DD') as report_date`,
    [
      randomUUID(),
      f.name ?? "Budi Santoso",
      f.phone ?? "081234567890",
      f.domicile ?? "Bandung",
      f.region ?? "JAWA BARAT",
      f.leadDate ?? null,
      dealerId,
      f.unit ?? "Xpander",
      f.followUp ?? null,
      f.source ?? "META",
      f.createdAt ?? null,
    ],
  );
  return r.rows[0];
}

export async function syncRow(pool: pg.Pool, leadId: string) {
  const r = await pool.query("select * from public.spreadsheet_sync_logs where lead_id = $1", [leadId]);
  return r.rows[0] as
    | { sync_status: string; spreadsheet_month: string; retry_count: number; change_seq: string; error_message: string | null; synced_at: Date | null }
    | undefined;
}

export async function monthRow(pool: pg.Pool, monthKey: string) {
  const r = await pool.query("select * from public.sheet_months where month_key = $1", [monthKey]);
  return r.rows[0] as { revision: string; synced_revision: string; last_error: string | null; sheet_id: string | null } | undefined;
}
