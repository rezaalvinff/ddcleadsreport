import type { ClassificationMethod, ReportingRegion } from "../constants";
import type { AiLocationResult } from "./gemini";
import { matchLocation, normalizeLocation, regionForProvince, type LocationPlace } from "./match";

export type ConfirmationReason =
  | "ambiguous"
  | "outside"
  | "province_only"
  | "partial"
  | "low_confidence"
  | "not_found"
  | "ai_unavailable"
  | "ai_error";

export type Classification =
  | {
      status: "resolved";
      method: ClassificationMethod;
      region: ReportingRegion;
      city: string | null;
      province: string | null;
      message: string;
    }
  | {
      status: "needs_confirmation";
      reason: ConfirmationReason;
      message: string;
      /** Best guess shown to the user; never applied automatically. */
      suggestion: LocationPlace | null;
      candidates: LocationPlace[];
    };

export interface LearnedMapping {
  normalizedName: string;
  city: string | null;
  province: string | null;
  region: ReportingRegion | null;
  source: "ai" | "manual";
  confidence: "high" | "medium" | "low" | null;
}

export interface ClassifyDeps {
  findLearned(normalizedName: string): Promise<LearnedMapping | null>;
  saveLearned?(mapping: LearnedMapping): Promise<void>;
  /** Omitted when Gemini is not configured or must not be called (e.g. server-side re-validation). */
  resolveWithAi?(domicile: string): Promise<AiLocationResult>;
}

function needs(
  reason: ConfirmationReason,
  message: string,
  suggestion: LocationPlace | null = null,
  candidates: LocationPlace[] = [],
): Classification {
  return { status: "needs_confirmation", reason, message, suggestion, candidates };
}

function describe(place: LocationPlace): string {
  return [place.city, place.province].filter(Boolean).join(", ") || "lokasi";
}

function fromLearned(learned: LearnedMapping, partial: LocationPlace | null): Classification {
  const place: LocationPlace = { city: learned.city, province: learned.province, region: learned.region };
  if (learned.source === "manual" && learned.region) {
    return {
      status: "resolved",
      method: "manual",
      region: learned.region,
      city: learned.city,
      province: learned.province,
      message: "Sesuai konfirmasi manual sebelumnya untuk domisili ini.",
    };
  }
  if (learned.region === null && learned.province) {
    return needs("outside", `${describe(place)} berada di luar 5 wilayah pelaporan. Pilih wilayah secara manual.`, null, [place]);
  }
  if (learned.region && learned.confidence === "high" && (!partial || partial.region === learned.region)) {
    return {
      status: "resolved",
      method: "ai",
      region: learned.region,
      city: learned.city,
      province: learned.province,
      message: `Dikenali oleh Gemini sebelumnya: ${describe(place)}.`,
    };
  }
  return needs("low_confidence", "Hasil sebelumnya belum pasti. Konfirmasi wilayah secara manual.", learned.region ? place : null);
}

/**
 * Evaluates a Gemini answer with our own region rules. The model's region is
 * only accepted when it agrees with the region derived from its province.
 */
export function evaluateAiResult(
  ai: AiLocationResult,
  normalizedName: string,
  partial: LocationPlace | null,
): { classification: Classification; learned: LearnedMapping | null } {
  if (!ai.recognized || !ai.province) {
    return {
      classification: needs("not_found", "Gemini tidak dapat mengenali lokasi ini. Pilih wilayah secara manual.", partial),
      learned: null,
    };
  }
  const city = ai.city ? (ai.city_type === "kota" ? `Kota ${ai.city}` : ai.city_type === "kabupaten" ? `Kabupaten ${ai.city}` : ai.city) : null;
  const computed = regionForProvince(ai.province, ai.city);
  const learned = (region: ReportingRegion | null, confidence: LearnedMapping["confidence"]): LearnedMapping => ({
    normalizedName,
    city,
    province: ai.province,
    region,
    source: "ai",
    confidence,
  });

  if (computed === undefined) {
    const suggestion = { city, province: ai.province, region: null };
    return {
      classification: needs("low_confidence", `Gemini menyarankan ${describe(suggestion)}, tetapi wilayahnya tidak dapat dipastikan.`, suggestion),
      learned: null,
    };
  }
  const place: LocationPlace = { city, province: ai.province, region: computed };
  if (computed === null) {
    return {
      classification: needs("outside", `${describe(place)} berada di luar 5 wilayah pelaporan. Pilih wilayah secara manual.`, null, [place]),
      learned: ai.confidence === "high" ? learned(null, "high") : null,
    };
  }
  if (ai.reporting_region !== computed) {
    return {
      classification: needs("low_confidence", `Hasil Gemini tidak konsisten (${describe(place)}). Konfirmasi wilayah secara manual.`, place),
      learned: learned(computed, "low"),
    };
  }
  if (partial && partial.region !== computed) {
    return {
      classification: needs("ambiguous", "Database lokasi dan Gemini memberi wilayah berbeda. Pilih wilayah yang benar.", null, [partial, place]),
      learned: null,
    };
  }
  if (ai.confidence !== "high") {
    return {
      classification: needs("low_confidence", `Gemini kurang yakin (${describe(place)}). Konfirmasi wilayah secara manual.`, place),
      learned: learned(computed, ai.confidence),
    };
  }
  return {
    classification: {
      status: "resolved",
      method: "ai",
      region: computed,
      city,
      province: ai.province,
      message: `Dikenali oleh Gemini: ${describe(place)}.`,
    },
    learned: learned(computed, "high"),
  };
}

/**
 * Order: built-in dataset (exact) -> learned mappings cache -> Gemini -> manual.
 * Gemini is never called for locations the dataset resolves exactly, nor for
 * inputs that are inherently ambiguous.
 */
export async function classifyDomicile(domicile: string, deps: ClassifyDeps): Promise<Classification> {
  const normalizedName = normalizeLocation(domicile);
  if (normalizedName.length < 2) return needs("not_found", "Isi domisili terlebih dahulu.");

  const det = matchLocation(domicile);
  if (det.kind === "resolved" && det.exact) {
    return {
      status: "resolved",
      method: "mapped",
      region: det.place.region!,
      city: det.place.city,
      province: det.place.province,
      message: `Ditemukan di database lokasi: ${describe(det.place)}.`,
    };
  }
  if (det.kind === "ambiguous") {
    return needs("ambiguous", "Nama lokasi ini cocok dengan beberapa wilayah. Pilih wilayah yang benar.", null, det.places);
  }
  if (det.kind === "province_only") {
    return needs("province_only", `${det.province} mencakup lebih dari satu wilayah pelaporan. Sebutkan kota/kabupaten atau pilih manual.`);
  }

  const partial = det.kind === "resolved" ? det.place : null;
  const learned = await deps.findLearned(normalizedName);
  if (learned) return fromLearned(learned, partial);

  if (det.kind === "outside") {
    const place = det.places[0]!;
    return needs("outside", `${describe(place)} berada di luar 5 wilayah pelaporan. Pilih wilayah secara manual.`, null, det.places);
  }

  if (!deps.resolveWithAi) {
    return partial
      ? needs("partial", `Kemungkinan ${describe(partial)}, tetapi teks domisili tidak sepenuhnya dikenali. Konfirmasi wilayah.`, partial)
      : needs("ai_unavailable", "Lokasi tidak ada di database lokasi. Pilih wilayah secara manual.");
  }

  let ai: AiLocationResult;
  try {
    ai = await deps.resolveWithAi(domicile);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return needs("ai_error", `Gemini gagal dihubungi (${detail}). Pilih wilayah secara manual.`, partial);
  }

  const evaluated = evaluateAiResult(ai, normalizedName, partial);
  if (evaluated.learned && deps.saveLearned) {
    try {
      await deps.saveLearned(evaluated.learned);
    } catch (error) {
      // Caching is an optimisation; the classification itself is still valid.
      console.error("Gagal menyimpan cache lokasi:", error);
    }
  }
  return evaluated.classification;
}

/**
 * Server-side decision for a submitted lead. The client only submits the chosen
 * region; method/city/province are re-derived here so they cannot be forged.
 */
export function resolveSubmittedRegion(
  server: Classification,
  chosenRegion: ReportingRegion,
): {
  method: ClassificationMethod;
  city: string | null;
  province: string | null;
  /** Mapping to remember when the user confirmed an otherwise unresolved location. */
  learnManual: boolean;
} {
  if (server.status === "resolved" && server.region === chosenRegion) {
    return { method: server.method, city: server.city, province: server.province, learnManual: false };
  }
  const options =
    server.status === "resolved"
      ? [{ city: server.city, province: server.province, region: server.region }]
      : [...server.candidates, ...(server.suggestion ? [server.suggestion] : [])];
  const matching = options.filter((p) => p.region === chosenRegion);
  const place = matching.length === 1 ? matching[0]! : null;
  const learnManual =
    server.status === "needs_confirmation" &&
    ["outside", "partial", "low_confidence", "not_found", "ai_unavailable", "ai_error"].includes(server.reason);
  return { method: "manual", city: place?.city ?? null, province: place?.province ?? null, learnManual };
}
