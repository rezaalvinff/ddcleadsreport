import "server-only";
import { z } from "zod";
import { REPORTING_REGIONS } from "../constants";
import { dbError, type Db } from "../db/admin";
import { isValidGroupInviteLink } from "../whatsapp/message";
import type { Dealer, WhatsappGroup } from "./types";

export type { Dealer, WhatsappGroup } from "./types";

const name = (label: string) =>
  z.string().transform((v) => v.trim().replace(/\s+/g, " ")).pipe(z.string().min(2, `${label} minimal 2 karakter.`).max(120));

export const dealerSchema = z.object({
  dealer_name: name("Nama dealer"),
  city: name("Kota"),
  province: z.string().trim().max(120).transform((v) => v || null),
  reporting_region: z.enum(REPORTING_REGIONS, { error: "Pilih wilayah pelaporan." }),
});

export const groupSchema = z.object({
  group_name: name("Nama grup"),
  dealer_id: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable()),
  reporting_region: z.enum(REPORTING_REGIONS, { error: "Pilih wilayah pelaporan." }),
  group_link: z
    .string()
    .trim()
    .transform((v) => v || null)
    .refine((v) => v === null || isValidGroupInviteLink(v), "Link harus berupa link undangan resmi: https://chat.whatsapp.com/…"),
});

export async function listDealers(db: Db, opts: { activeOnly?: boolean } = {}): Promise<Dealer[]> {
  let q = db.from("dealers").select("id, dealer_name, city, province, reporting_region, is_active");
  if (opts.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q.order("dealer_name");
  if (error) throw dbError("Gagal membaca dealer", error);
  return data as Dealer[];
}

export async function listGroups(db: Db, opts: { activeOnly?: boolean } = {}): Promise<WhatsappGroup[]> {
  let q = db.from("whatsapp_groups").select("id, group_name, dealer_id, reporting_region, group_link, is_active, dealer:dealers(dealer_name)");
  if (opts.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q.order("group_name");
  if (error) throw dbError("Gagal membaca grup WhatsApp", error);
  return data.map(({ dealer, ...g }) => ({ ...g, dealer_name: dealer?.dealer_name ?? null })) as WhatsappGroup[];
}

/** Readable message for constraint violations from master-data writes. */
export function masterWriteError(error: { code?: string; message: string }, entity: string): string {
  if (error.code === "23505") return `${entity} dengan nama tersebut sudah ada.`;
  if (error.code === "23503") return `${entity} masih dipakai oleh data lain. Nonaktifkan saja.`;
  if (error.code === "23514") return `Data ${entity.toLowerCase()} tidak valid.`;
  return `Gagal menyimpan ${entity.toLowerCase()}: ${error.message}`;
}
