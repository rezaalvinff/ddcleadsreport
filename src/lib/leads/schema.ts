import { z } from "zod";
import { LEAD_SOURCES, REPORTING_REGIONS, UNIT_OPTIONS, UNIT_OTHER } from "../constants";
import { isValidIsoDate, todayJakarta } from "../dates";
import { normalizePhone } from "../phone";

const text = (label: string, min: number, max: number) =>
  z
    .string({ error: `${label} wajib diisi.` })
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(min, `${label} minimal ${min} karakter.`).max(max, `${label} maksimal ${max} karakter.`));

const optionalDate = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isValidIsoDate(v), `${label} tidak valid.`);

/** Server-side validation of the prospect form (create and edit). */
export const leadInputSchema = z
  .object({
    submissionId: z.uuid("ID pengiriman tidak valid."),
    name: text("Nama prospek", 2, 120),
    phone: z
      .string({ error: "Nomor telepon wajib diisi." })
      .transform((v, ctx) => {
        const normalized = normalizePhone(v);
        if (!normalized) {
          ctx.addIssue({ code: "custom", message: "Nomor telepon tidak valid. Contoh: 081234567890 atau +6281234567890." });
          return z.NEVER;
        }
        return normalized;
      }),
    domicile: text("Domisili", 2, 120),
    leadDate: optionalDate("Tanggal prospek"),
    dealerId: z.uuid("Pilih dealer."),
    unit: z.enum([...UNIT_OPTIONS, UNIT_OTHER], { error: "Pilih unit." }),
    unitOther: z.string().trim().max(60, "Unit maksimal 60 karakter.").optional(),
    followUpDate: optionalDate("Tanggal follow up"),
    source: z.enum(LEAD_SOURCES, { error: "Pilih source." }),
    reportingRegion: z.enum(REPORTING_REGIONS, { error: "Pilih wilayah pelaporan." }),
    groupIds: z.array(z.uuid()).max(20).default([]).transform((ids) => [...new Set(ids)]),
    confirmDuplicate: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.unit === UNIT_OTHER && (!v.unitOther || v.unitOther.length < 2)) {
      ctx.addIssue({ code: "custom", path: ["unitOther"], message: "Tulis nama unit lainnya." });
    }
    if (v.leadDate && v.leadDate > todayJakarta()) {
      ctx.addIssue({ code: "custom", path: ["leadDate"], message: "Tanggal prospek tidak boleh di masa depan." });
    }
  })
  .transform(({ unit, unitOther, ...rest }) => ({
    ...rest,
    unit: unit === UNIT_OTHER ? unitOther!.replace(/\s+/g, " ") : unit,
  }));

export type LeadInputRaw = z.input<typeof leadInputSchema>;
export type LeadInput = z.output<typeof leadInputSchema>;

export type FieldErrors = Partial<Record<string, string>>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
