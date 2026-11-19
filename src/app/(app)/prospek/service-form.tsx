"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Notice } from "@/components/ui";
import { LEAD_SOURCES, UNIT_OPTIONS } from "@/lib/constants";
import { formatDateShort, jakartaDate, monthKeyOf, sheetTitleForMonth, todayJakarta } from "@/lib/dates";
import type { FieldErrors } from "@/lib/leads/schema";
import type { Dealer } from "@/lib/master/types";
import { saveServiceAction, type SaveServiceResponse } from "./service-actions";

export interface ServiceFormValues {
  dealerId: string;
  name: string;
  location: string;
  unit: string;
  source: string;
  entryDate: string;
  finalNote: string;
}

const EMPTY: ServiceFormValues = {
  dealerId: "",
  name: "",
  location: "",
  unit: "",
  source: "",
  entryDate: "",
  finalNote: "",
};

interface Props {
  dealers: Dealer[];
  entry?: { id: string; createdAt: string; values: ServiceFormValues };
}

function Field({ label, error, hint, children, required }: { label: string; error?: string; hint?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <span className="label">
        {label}
        {required && <span className="text-brand-600"> *</span>}
      </span>
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function ServiceForm({ dealers, entry }: Props) {
  const router = useRouter();
  const isEdit = Boolean(entry);
  const [values, setValues] = useState<ServiceFormValues>(entry?.values ?? EMPTY);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<Extract<SaveServiceResponse, { status: "saved" }> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const today = todayJakarta();

  const set = <K extends keyof ServiceFormValues>(key: K, value: ServiceFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const reportDate = values.entryDate || (entry ? jakartaDate(new Date(entry.createdAt)) : today);
  const reportTab = /^\d{4}-\d{2}-\d{2}$/.test(reportDate) ? sheetTitleForMonth(monthKeyOf(reportDate)) : "-";

  const reset = () => {
    setValues(EMPTY);
    setErrors({});
    setFormError(null);
    setSubmissionId(crypto.randomUUID());
  };

  const submit = () => {
    if (submitting.current) return;
    submitting.current = true;
    setFormError(null);
    startTransition(async () => {
      try {
        const res = await saveServiceAction({ ...values, submissionId }, entry?.id);
        if (res.status === "invalid") {
          setErrors(res.errors);
          if (res.errors.form) setFormError(res.errors.form);
        } else if (res.status === "error") {
          setFormError(res.message);
        } else {
          setResult(res);
          if (isEdit) router.refresh();
          else reset();
        }
      } catch {
        setFormError("Koneksi ke server gagal. Periksa Data Service sebelum mengirim ulang.");
      } finally {
        submitting.current = false;
      }
    });
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {result && (
        <Notice tone="success">
          <p className="font-medium">
            {result.replayed
              ? "Data service ini sudah tersimpan sebelumnya."
              : isEdit
                ? "Perubahan tersimpan di database."
                : "Data service tersimpan di database."}
          </p>
          <p className="mt-1">
            Masuk antrean untuk tab <strong>{sheetTitleForMonth(result.month)}</strong>, blok SERVICE. Total{" "}
            <strong>{result.pending.total}</strong> entri menunggu dikirim ke Google Sheets.
          </p>
          <p className="mt-2 flex flex-wrap gap-3">
            <Link className="link" href="/">
              Kirim sekarang
            </Link>
            <Link className="link" href="/service">
              Lihat Data Service
            </Link>
          </p>
        </Notice>
      )}
      {formError && <Notice tone="error">{formError}</Notice>}

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Dealer" required error={errors.dealerId}>
          {dealers.length === 0 ? (
            <p className="text-sm text-neutral-600">
              Belum ada dealer.{" "}
              <Link className="link" href="/cabang">
                Tambahkan di Master Cabang
              </Link>
              .
            </p>
          ) : (
            <select
              className={`input ${errors.dealerId ? "input-error" : ""}`}
              value={values.dealerId}
              onChange={(e) => set("dealerId", e.target.value)}
            >
              <option value="">— Pilih dealer —</option>
              {dealers
                .filter((d) => d.is_active || d.id === values.dealerId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.dealer_name}
                  </option>
                ))}
            </select>
          )}
        </Field>

        <Field label="Nama" required error={errors.name} hint="Nama customer atau perusahaan.">
          <input
            className={`input ${errors.name ? "input-error" : ""}`}
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength={160}
            autoFocus={!isEdit}
          />
        </Field>

        <Field label="Location" required error={errors.location} hint="Area customer. Contoh: Rawamangun, Serpong, Bandung.">
          <input
            className={`input ${errors.location ? "input-error" : ""}`}
            value={values.location}
            onChange={(e) => set("location", e.target.value)}
            maxLength={160}
          />
        </Field>

        <Field label="Unit" required error={errors.unit} hint="Boleh varian lengkap, mis. Xpander Exceed Tourer.">
          <input
            className={`input ${errors.unit ? "input-error" : ""}`}
            value={values.unit}
            onChange={(e) => set("unit", e.target.value)}
            maxLength={80}
            list="service-units"
          />
          <datalist id="service-units">
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>

        <Field
          label="Tanggal"
          error={errors.entryDate}
          hint={`Kosongkan untuk memakai tanggal submit (${formatDateShort(today)}). Menentukan tab laporan dan mengisi kolom FOLLOW UP.`}
        >
          <input type="date" className="input" value={values.entryDate} max={today} onChange={(e) => set("entryDate", e.target.value)} />
        </Field>

        <Field label="Source" required error={errors.source}>
          <div className="flex gap-2">
            {LEAD_SOURCES.map((s) => (
              <label
                key={s}
                className={`flex-1 cursor-pointer rounded-md border px-3 py-2 text-center text-sm ${
                  values.source === s ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-neutral-300 hover:bg-neutral-50"
                }`}
              >
                <input type="radio" name="source" value={s} checked={values.source === s} onChange={() => set("source", s)} className="sr-only" />
                {s}
              </label>
            ))}
          </div>
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Final"
            error={errors.finalNote}
            hint="Opsional. Keterangan hasil, mis. BOOKING SERVICE TGL 12/11/2026. Mengisi kolom FINAL di spreadsheet."
          >
            <textarea
              className={`input ${errors.finalNote ? "input-error" : ""}`}
              rows={2}
              maxLength={500}
              value={values.finalNote}
              onChange={(e) => set("finalNote", e.target.value)}
            />
          </Field>
        </div>

        <p className="text-xs text-neutral-500 sm:col-span-2">
          Masuk ke tab <strong>{reportTab}</strong>, blok SERVICE. Data service tidak punya pesan WhatsApp dan tidak masuk tabel wilayah.
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Menyimpan…" : isEdit ? "Simpan Perubahan" : "Submit Service"}
        </button>
        {isEdit ? (
          <Link className="btn btn-secondary" href="/service">
            Batal
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => {
              reset();
              setResult(null);
            }}
          >
            Reset Form
          </button>
        )}
      </div>
    </form>
  );
}
