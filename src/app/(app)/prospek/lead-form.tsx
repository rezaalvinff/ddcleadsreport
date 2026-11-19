"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Notice } from "@/components/ui";
import {
  CLASSIFICATION_LABELS,
  LEAD_SOURCES,
  REPORTING_REGIONS,
  UNIT_OPTIONS,
  UNIT_OTHER,
  type ReportingRegion,
} from "@/lib/constants";
import { formatDateShort, jakartaDate, monthKeyOf, sheetTitleForMonth, todayJakarta } from "@/lib/dates";
import type { Classification } from "@/lib/location/classify";
import type { FieldErrors } from "@/lib/leads/schema";
import type { DuplicateMatch } from "@/lib/leads/service";
import { recommendGroups, type Dealer, type WhatsappGroup } from "@/lib/master/types";
import { normalizePhone } from "@/lib/phone";
import { buildHandoverMessage } from "@/lib/whatsapp/message";
import { checkPhoneAction, classifyDomicileAction, saveLeadAction, type DomicileLookup, type SaveLeadResponse } from "./actions";

export interface LeadFormValues {
  name: string;
  phone: string;
  domicile: string;
  leadDate: string;
  dealerId: string;
  unit: string;
  unitOther: string;
  source: string;
  reportingRegion: string;
  customerNote: string;
  groupIds: string[];
}

const EMPTY: LeadFormValues = {
  name: "",
  phone: "",
  domicile: "",
  leadDate: "",
  dealerId: "",
  unit: "",
  unitOther: "",
  source: "",
  reportingRegion: "",
  customerNote: "",
  groupIds: [],
};

type ClassifyState =
  | { state: "idle" }
  | { state: "loading"; text: string }
  | { state: "done"; text: string; result: DomicileLookup }
  | { state: "error"; text: string; message: string };

type Intent = "save" | "handover";

interface Props {
  dealers: Dealer[];
  groups: WhatsappGroup[];
  /** True when WA_WORKER_SECRET is set, so automatic sending can be offered. */
  autoSendAvailable?: boolean;
  /** Present when editing an existing lead. */
  lead?: { id: string; values: LeadFormValues; createdAt: string; classification: string };
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

export function LeadForm({ dealers, groups, lead, autoSendAvailable = false }: Props) {
  const router = useRouter();
  const isEdit = Boolean(lead);
  const [values, setValues] = useState<LeadFormValues>(lead?.values ?? EMPTY);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [classify, setClassify] = useState<ClassifyState>({ state: "idle" });
  const [regionTouched, setRegionTouched] = useState(isEdit);
  const [dealerTouched, setDealerTouched] = useState(isEdit);
  const [groupsTouched, setGroupsTouched] = useState(isEdit);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [autoSend, setAutoSend] = useState(autoSendAvailable);
  const [phoneMatches, setPhoneMatches] = useState<DuplicateMatch[]>([]);
  const [phoneCheckError, setPhoneCheckError] = useState<string | null>(null);
  const [duplicateConfirm, setDuplicateConfirm] = useState<{ intent: Intent; matches: DuplicateMatch[] } | null>(null);
  const [result, setResult] = useState<Extract<SaveLeadResponse, { status: "saved" }> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const today = todayJakarta();

  const set = <K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // --- Domicile classification (debounced) --------------------------------
  const domicile = values.domicile.trim();
  const domicileUnchanged = Boolean(lead) && domicile === lead?.values.domicile.trim();
  useEffect(() => {
    if (domicile.length < 2 || domicileUnchanged) return;
    const timer = setTimeout(async () => {
      setClassify({ state: "loading", text: domicile });
      try {
        const res = await classifyDomicileAction(domicile);
        if ("status" in res) setClassify({ state: "error", text: domicile, message: res.message });
        else setClassify({ state: "done", text: domicile, result: res });
      } catch {
        setClassify({ state: "error", text: domicile, message: "Klasifikasi gagal. Pilih wilayah secara manual." });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [domicile, domicileUnchanged]);

  const settled = (classify.state === "done" || classify.state === "error") && classify.text === domicile;
  const classifying = domicile.length >= 2 && !domicileUnchanged && !settled;
  const lookup = classify.state === "done" && classify.text === domicile ? classify.result : null;
  const classification = lookup?.classification ?? null;
  const panelState: ClassifyState = domicile.length < 2 ? { state: "idle" } : classify;

  // The region follows the classification until the user picks one manually.
  const effectiveRegion = regionTouched
    ? values.reportingRegion
    : domicileUnchanged
      ? (lead?.values.reportingRegion ?? "")
      : classification?.status === "resolved"
        ? classification.region
        : "";

  // The dealer follows the domicile's suggestion until the user picks one.
  const suggestion = lookup?.dealer ?? null;
  const effectiveDealerId = dealerTouched ? values.dealerId : (suggestion?.dealerId ?? values.dealerId);

  // --- Group recommendations ----------------------------------------------
  const region = (effectiveRegion || null) as ReportingRegion | null;
  const { dealerGroups, regionGroups } = useMemo(
    () => recommendGroups(groups, effectiveDealerId || null, region),
    [groups, effectiveDealerId, region],
  );
  // Groups of the selected dealer are preselected until the user changes the selection.
  const selectedGroupIds = groupsTouched ? values.groupIds : dealerGroups.map((g) => g.id);

  const toggleGroup = (id: string) => {
    setGroupsTouched(true);
    setValues((v) => ({
      ...v,
      groupIds: selectedGroupIds.includes(id) ? selectedGroupIds.filter((g) => g !== id) : [...selectedGroupIds, id],
    }));
  };
  const visibleGroupIds = new Set([...dealerGroups, ...regionGroups].map((g) => g.id));
  const otherGroups = groups.filter((g) => (g.is_active || selectedGroupIds.includes(g.id)) && !visibleGroupIds.has(g.id));

  // --- Duplicate phone check on blur --------------------------------------
  const checkPhone = async () => {
    setPhoneCheckError(null);
    const normalized = normalizePhone(values.phone);
    if (!normalized) {
      setPhoneMatches([]);
      if (values.phone.trim()) setErrors((e) => ({ ...e, phone: "Nomor telepon tidak valid. Contoh: 081234567890." }));
      return;
    }
    try {
      setPhoneMatches(await checkPhoneAction(normalized, lead?.id));
    } catch {
      setPhoneCheckError("Pemeriksaan nomor duplikat gagal; akan diperiksa lagi saat disimpan.");
    }
  };

  // --- Derived preview ------------------------------------------------------
  const dealer = dealers.find((d) => d.id === effectiveDealerId);
  const unitLabel = values.unit === UNIT_OTHER ? values.unitOther.trim() : values.unit;
  const reportDate = values.leadDate || (lead ? jakartaDate(new Date(lead.createdAt)) : today);
  const reportTab = /^\d{4}-\d{2}-\d{2}$/.test(reportDate) ? sheetTitleForMonth(monthKeyOf(reportDate)) : "-";
  const selectedGroups = groups.filter((g) => selectedGroupIds.includes(g.id));
  const message = buildHandoverMessage({
    name: values.name.trim() || "[NAMA]",
    phone: normalizePhone(values.phone) ?? (values.phone.trim() || "[NOMER WA]"),
    domicile: values.domicile.trim() || "[DOMISILI]",
    unit: unitLabel || "[UNIT]",
    source: values.source || "[SOURCE]",
    customerNote: values.customerNote,
  });
  const regionIsManual =
    regionTouched && Boolean(effectiveRegion) && !(classification?.status === "resolved" && classification.region === effectiveRegion);

  // --- Submit ---------------------------------------------------------------
  const submit = (intent: Intent, confirmDuplicate = false) => {
    if (submitting.current) return;
    if (!effectiveRegion) {
      setErrors((e) => ({ ...e, reportingRegion: "Pilih/konfirmasi wilayah pelaporan." }));
      return;
    }
    submitting.current = true;
    setFormError(null);
    setDuplicateConfirm(null);
    startTransition(async () => {
      try {
        const res = await saveLeadAction(
          {
            ...values,
            dealerId: effectiveDealerId,
            reportingRegion: effectiveRegion,
            groupIds: selectedGroupIds,
            autoSend: autoSend && autoSendAvailable && selectedGroupIds.length > 0,
            submissionId,
            confirmDuplicate,
          },
          lead?.id,
        );
        if (res.status === "invalid") {
          setErrors(res.errors);
          if (res.errors.form) setFormError(res.errors.form);
        } else if (res.status === "duplicate_phone") {
          setDuplicateConfirm({ intent, matches: res.matches });
        } else if (res.status === "error") {
          setFormError(res.message);
        } else if (intent === "handover") {
          router.push(`/handover/${res.leadId}?saved=1`);
        } else if (isEdit) {
          setResult(res);
          router.refresh();
        } else {
          setResult(res);
          resetForm();
        }
      } catch {
        setFormError("Koneksi ke server gagal. Periksa data di Data Prospek sebelum mengirim ulang.");
      } finally {
        submitting.current = false;
      }
    });
  };

  const resetForm = () => {
    setValues(EMPTY);
    setErrors({});
    setClassify({ state: "idle" });
    setRegionTouched(false);
    setDealerTouched(false);
    setGroupsTouched(false);
    setPhoneMatches([]);
    setDuplicateConfirm(null);
    setFormError(null);
    setSubmissionId(crypto.randomUUID());
  };

  const busy = pending || classifying;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit("save");
        }}
      >
        {result && (
          <Notice tone="success">
            <p className="font-medium">
              {result.replayed ? "Prospek ini sudah tersimpan sebelumnya." : isEdit ? "Perubahan tersimpan di database." : "Prospek tersimpan di database."}
            </p>
            <p className="mt-1">
              Masuk antrean untuk tab <strong>{sheetTitleForMonth(result.month)}</strong>. Total{" "}
              <strong>{result.pending.total}</strong> prospek menunggu dikirim ke Google Sheets.
            </p>
            {result.queuedSends !== null && (
              <p className="mt-1">
                {result.queuedSends > 0
                  ? `${result.queuedSends} grup masuk antrean kirim otomatis. Status per grup ada di halaman handover.`
                  : "Tidak ada grup yang diantrekan untuk kirim otomatis."}
              </p>
            )}
            {result.warnings.map((w) => (
              <p key={w} className="mt-1">
                {w}
              </p>
            ))}
            <p className="mt-2 flex flex-wrap gap-3">
              <Link className="link" href="/">
                Kirim sekarang
              </Link>
              <Link className="link" href={`/handover/${result.leadId}`}>
                Siapkan handover
              </Link>
              <Link className="link" href="/prospek">
                Lihat Data Prospek
              </Link>
            </p>
          </Notice>
        )}
        {formError && <Notice tone="error">{formError}</Notice>}

        <section className="card grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Nama Prospek" required error={errors.name}>
            <input className={`input ${errors.name ? "input-error" : ""}`} value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={120} autoFocus={!isEdit} />
          </Field>
          <Field label="Nomor Telepon" required error={errors.phone} hint="Contoh: 081234567890 atau +6281234567890">
            <input
              className={`input ${errors.phone ? "input-error" : ""}`}
              value={values.phone}
              inputMode="tel"
              onChange={(e) => {
                set("phone", e.target.value);
                setPhoneMatches([]);
              }}
              onBlur={checkPhone}
              maxLength={20}
            />
          </Field>
          {(phoneMatches.length > 0 || phoneCheckError) && (
            <div className="sm:col-span-2">
              {phoneCheckError ? (
                <Notice tone="warning">{phoneCheckError}</Notice>
              ) : (
                <Notice tone="warning">
                  Nomor ini sudah pernah dicatat:{" "}
                  {phoneMatches.map((m) => `${m.name} (${formatDateShort(m.reportDate)}, ${m.dealerName})`).join("; ")}. Anda tetap bisa
                  menyimpan bila ini prospek yang sah.
                </Notice>
              )}
            </div>
          )}

          <Field label="Domisili" required error={errors.domicile} hint="Contoh: Bandung, Balikpapan, Muara Bungo">
            <input className={`input ${errors.domicile ? "input-error" : ""}`} value={values.domicile} onChange={(e) => {
              setRegionTouched(false);
              set("domicile", e.target.value);
            }} maxLength={120} />
          </Field>
          <Field label="Wilayah Pelaporan" required error={errors.reportingRegion}>
            <select
              className={`input ${errors.reportingRegion ? "input-error" : ""}`}
              value={effectiveRegion}
              onChange={(e) => {
                setRegionTouched(true);
                set("reportingRegion", e.target.value);
              }}
            >
              <option value="">— Pilih wilayah —</option>
              {REPORTING_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <ClassificationPanel
              state={panelState}
              classification={classification}
              classifying={classifying}
              regionIsManual={regionIsManual}
              editClassification={domicileUnchanged ? lead?.classification : undefined}
              onChoose={(r) => {
                setRegionTouched(true);
                set("reportingRegion", r);
              }}
            />
          </div>

          <Field
            label="Tanggal Prospek"
            error={errors.leadDate}
            hint={`Kosongkan untuk memakai tanggal submit (${formatDateShort(today)}). Menentukan tab laporan dan mengisi kolom FOLLOW UP di spreadsheet.`}
          >
            <input type="date" className="input" value={values.leadDate} max={today} onChange={(e) => set("leadDate", e.target.value)} />
          </Field>

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
              <>
                <select
                  className={`input ${errors.dealerId ? "input-error" : ""}`}
                  value={effectiveDealerId}
                  onChange={(e) => {
                    setDealerTouched(true);
                    set("dealerId", e.target.value);
                  }}
                >
                  <option value="">— Pilih dealer —</option>
                  {dealers
                    .filter((d) => d.is_active || d.id === effectiveDealerId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.dealer_name} ({d.reporting_region})
                      </option>
                    ))}
                </select>
                {!dealerTouched && suggestion && suggestion.dealerId === effectiveDealerId && (
                  <p className="mt-1 text-xs text-brand-700">Dipilih otomatis. {suggestion.reason}</p>
                )}
                {dealerTouched && suggestion && suggestion.dealerId !== effectiveDealerId && (
                  <p className="mt-1 text-xs text-neutral-500">Saran dari domisili: {suggestion.dealerName}.</p>
                )}
              </>
            )}
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

          <Field label="Unit" required error={errors.unit}>
            <select className={`input ${errors.unit ? "input-error" : ""}`} value={values.unit} onChange={(e) => set("unit", e.target.value)}>
              <option value="">— Pilih unit —</option>
              {[...UNIT_OPTIONS, UNIT_OTHER].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          {values.unit === UNIT_OTHER ? (
            <Field label="Nama Unit Lainnya" required error={errors.unitOther}>
              <input className={`input ${errors.unitOther ? "input-error" : ""}`} value={values.unitOther} onChange={(e) => set("unitOther", e.target.value)} maxLength={60} />
            </Field>
          ) : (
            <div className="hidden sm:block" />
          )}

          <div className="sm:col-span-2">
            <Field
              label="Catatan Customer"
              error={errors.customerNote}
              hint="Opsional. Ditambahkan di awal kalimat penutup pesan WhatsApp. Contoh: Cust terakhir minta info angsuran untuk DP 50 juta"
            >
              <textarea
                className={`input ${errors.customerNote ? "input-error" : ""}`}
                rows={2}
                maxLength={500}
                value={values.customerNote}
                onChange={(e) => set("customerNote", e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="card p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-neutral-900">Grup WhatsApp Tujuan</h2>
            {errors.groupIds && <p className="field-error">{errors.groupIds}</p>}
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-neutral-600">
              Belum ada grup WhatsApp.{" "}
              <Link className="link" href="/cabang">
                Tambahkan di Master Cabang
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-3">
              <GroupList title="Grup dealer terpilih" items={dealerGroups} selected={selectedGroupIds} onToggle={toggleGroup} empty={values.dealerId ? "Dealer ini belum punya grup." : "Pilih dealer terlebih dahulu."} />
              <GroupList title={region ? `Grup lain di ${region}` : "Grup wilayah"} items={regionGroups} selected={selectedGroupIds} onToggle={toggleGroup} empty={region ? "Tidak ada grup lain di wilayah ini." : "Tentukan wilayah terlebih dahulu."} />
              {otherGroups.length > 0 && (
                <div>
                  <button type="button" className="text-xs text-neutral-600 underline" onClick={() => setShowAllGroups((s) => !s)}>
                    {showAllGroups ? "Sembunyikan grup lain" : `Tampilkan semua grup (${otherGroups.length} lainnya)`}
                  </button>
                  {showAllGroups && <GroupList title="Grup lainnya" items={otherGroups} selected={selectedGroupIds} onToggle={toggleGroup} empty="" />}
                </div>
              )}
            </div>
          )}
        </section>

        {autoSendAvailable && (
          <label className="card flex cursor-pointer items-start gap-3 p-4 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 accent-brand-600"
              checked={autoSend}
              onChange={(e) => setAutoSend(e.target.checked)}
            />
            <span>
              <span className="font-medium text-neutral-900">Kirim otomatis ke grup terpilih</span>
              <span className="mt-0.5 block text-xs text-neutral-500">
                Pesan diantrekan untuk worker WhatsApp. Kalau worker sedang mati atau pengiriman gagal, statusnya terlihat di
                halaman handover dan Anda tetap bisa mengirim manual.
              </span>
            </span>
          </label>
        )}

        {duplicateConfirm && (
          <Notice tone="warning">
            <p className="font-medium">Nomor telepon ini sudah ada di database:</p>
            <ul className="mt-1 list-disc pl-5">
              {duplicateConfirm.matches.map((m) => (
                <li key={m.id}>
                  {m.name} — tanggal laporan {formatDateShort(m.reportDate)}, {m.dealerName}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => submit(duplicateConfirm.intent, true)}>
                Tetap simpan
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDuplicateConfirm(null)}>
                Batal
              </button>
            </div>
          </Notice>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {pending ? "Menyimpan…" : isEdit ? "Simpan Perubahan" : "Submit Prospek"}
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => submit("handover")}>
            {isEdit ? "Simpan & Siapkan Handover" : "Submit & Prepare Handover"}
          </button>
          {isEdit ? (
            <Link className="btn btn-secondary" href="/prospek">
              Batal
            </Link>
          ) : (
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => { resetForm(); setResult(null); }}>
              Reset Form
            </button>
          )}
          {classifying && <span className="self-center text-xs text-neutral-500">Menentukan wilayah…</span>}
        </div>
      </form>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Pratinjau</h2>
          <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1.5 text-sm">
            <PreviewRow label="Nama" value={values.name} />
            <PreviewRow label="Telepon" value={normalizePhone(values.phone) ?? values.phone} />
            <PreviewRow label="Domisili" value={values.domicile} />
            <PreviewRow label="Wilayah" value={effectiveRegion ? `${effectiveRegion}${regionIsManual ? " (manual)" : ""}` : ""} />
            <PreviewRow label="Dealer" value={dealer?.dealer_name ?? ""} />
            <PreviewRow label="Unit" value={unitLabel} />
            <PreviewRow label="Source" value={values.source} />
            <PreviewRow label="Tgl laporan" value={/^\d{4}-\d{2}-\d{2}$/.test(reportDate) ? `${formatDateShort(reportDate)}${values.leadDate ? "" : " (otomatis)"}` : ""} />
            <PreviewRow label="Tab Sheets" value={reportTab} />
            <PreviewRow label="Catatan" value={values.customerNote.trim()} />
            <PreviewRow label="Grup tujuan" value={selectedGroups.map((g) => g.group_name).join(", ") || "—"} />
          </dl>
        </div>
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Pesan Handover</h2>
          <pre className="rounded-md bg-neutral-50 p-3 font-sans text-xs whitespace-pre-wrap text-neutral-800">{message}</pre>
          <p className="hint">Pesan disalin dan dikirim manual setelah prospek disimpan.</p>
        </div>
      </aside>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="break-words text-neutral-900">{value || <span className="text-neutral-400">—</span>}</dd>
    </>
  );
}

function GroupList({ title, items, selected, onToggle, empty }: { title: string; items: WhatsappGroup[]; selected: string[]; onToggle: (id: string) => void; empty: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">{title}</p>
      {items.length === 0 ? (
        empty ? <p className="text-sm text-neutral-500">{empty}</p> : null
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {items.map((g) => (
            <label key={g.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50">
              <input type="checkbox" className="mt-0.5 accent-brand-600" checked={selected.includes(g.id)} onChange={() => onToggle(g.id)} />
              <span>
                <span className="font-medium text-neutral-900">{g.group_name}</span>
                <span className="block text-xs text-neutral-500">
                  {g.dealer_name ?? "Tanpa dealer"} · {g.reporting_region} · {g.group_link ? "ada link undangan" : "tanpa link"}
                  {!g.is_active && " · nonaktif"}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function ClassificationPanel({
  state,
  classification,
  classifying,
  regionIsManual,
  editClassification,
  onChoose,
}: {
  state: ClassifyState;
  classification: Classification | null;
  classifying: boolean;
  regionIsManual: boolean;
  editClassification?: string;
  onChoose: (region: ReportingRegion) => void;
}) {
  if (editClassification) {
    return (
      <p className="text-xs text-neutral-500">
        Klasifikasi tersimpan: {CLASSIFICATION_LABELS[editClassification as keyof typeof CLASSIFICATION_LABELS] ?? editClassification}. Ubah domisili untuk
        mengklasifikasi ulang.
      </p>
    );
  }
  if (state.state === "idle") return <p className="text-xs text-neutral-500">Wilayah ditentukan otomatis dari domisili.</p>;
  if (classifying) return <p className="text-xs text-neutral-500">Menentukan wilayah dari domisili…</p>;
  if (state.state === "error") return <Notice tone="warning">{state.message}</Notice>;
  if (!classification) return null;

  if (classification.status === "resolved") {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <span className="font-semibold">{classification.region}</span> — {classification.message}{" "}
        <span className="text-xs text-emerald-700">({CLASSIFICATION_LABELS[classification.method]})</span>
        {regionIsManual && <p className="mt-1 text-xs text-amber-800">Wilayah dikoreksi manual.</p>}
      </div>
    );
  }
  const options = [...classification.candidates, ...(classification.suggestion ? [classification.suggestion] : [])].filter(
    (p, i, all) => p.region && all.findIndex((q) => q.region === p.region && q.city === p.city) === i,
  );
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="font-medium">Perlu konfirmasi manual</p>
      <p>{classification.message}</p>
      {options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {options.map((p) => (
            <button key={`${p.region}-${p.city}`} type="button" className="btn btn-secondary btn-sm" onClick={() => onChoose(p.region!)}>
              {[p.city, p.province].filter(Boolean).join(", ")} → {p.region}
            </button>
          ))}
        </div>
      )}
      {regionIsManual && <p className="mt-1 text-xs">Wilayah dipilih manual.</p>}
    </div>
  );
}
