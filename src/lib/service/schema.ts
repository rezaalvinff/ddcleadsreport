import { z } from "zod";
import { SERVICE_SOURCES } from "../constants";
import { isValidIsoDate, todayJakarta } from "../dates";

const text = (label: string, min: number, max: number) =>
  z
    .string({ error: `${label} wajib diisi.` })
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(min, `${label} minimal ${min} karakter.`).max(max, `${label} maksimal ${max} karakter.`));

/** Server-side validation of the service form (create and edit). */
export const serviceInputSchema = z.object({
  submissionId: z.uuid("ID pengiriman tidak valid."),
  dealerId: z.uuid("Pilih dealer."),
  name: text("Nama", 2, 160),
  location: text("Location", 2, 160),
  unit: text("Unit", 2, 80),
  source: z.enum(SERVICE_SOURCES, { error: "Pilih source." }),
  entryDate: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isValidIsoDate(v), "Tanggal tidak valid.")
    .refine((v) => v === null || v <= todayJakarta(), "Tanggal tidak boleh di masa depan."),
  finalNote: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim().replace(/[ \t]+/g, " "))
    .pipe(z.string().max(500, "Keterangan maksimal 500 karakter."))
    .transform((v) => v || null),
});

export type ServiceInputRaw = z.input<typeof serviceInputSchema>;
export type ServiceInput = z.output<typeof serviceInputSchema>;
