import { z } from "zod";
import { REPORTING_REGIONS } from "../constants";

/**
 * Gemini is only a fallback for domicile texts the deterministic dataset cannot
 * resolve reliably. Only the domicile text is sent — never names, phone numbers
 * or any other prospect data.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 12_000;

export const aiLocationSchema = z.object({
  recognized: z.boolean(),
  city: z.string().trim().min(1).nullable(),
  city_type: z.enum(["kota", "kabupaten"]).nullable(),
  province: z.string().trim().min(1).nullable(),
  reporting_region: z.enum([...REPORTING_REGIONS, "OUTSIDE", "UNKNOWN"]),
  confidence: z.enum(["high", "medium", "low"]),
  note: z.string().nullable().optional(),
});

export type AiLocationResult = z.infer<typeof aiLocationSchema>;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    recognized: { type: "BOOLEAN" },
    city: { type: "STRING", nullable: true },
    city_type: { type: "STRING", enum: ["kota", "kabupaten"], nullable: true },
    province: { type: "STRING", nullable: true },
    reporting_region: { type: "STRING", enum: [...REPORTING_REGIONS, "OUTSIDE", "UNKNOWN"] },
    confidence: { type: "STRING", enum: ["high", "medium", "low"] },
    note: { type: "STRING", nullable: true },
  },
  required: ["recognized", "city", "city_type", "province", "reporting_region", "confidence"],
};

export function buildLocationPrompt(domicile: string): string {
  return [
    "Anda mengklasifikasikan teks domisili di Indonesia untuk laporan internal.",
    "Tentukan kota/kabupaten (tanpa awalan 'Kota'/'Kabupaten'), jenisnya, dan provinsi resmi (38 provinsi).",
    "Wilayah pelaporan internal:",
    "- JABODETABEK: DKI Jakarta, Kota/Kabupaten Bogor, Kota Depok, Kota/Kabupaten Bekasi.",
    "- JAWA BARAT: kota/kabupaten lain di Provinsi Jawa Barat.",
    "- BANTEN: seluruh Provinsi Banten, termasuk Tangerang dan Tangerang Selatan.",
    "- JAWA TIMUR: seluruh Provinsi Jawa Timur.",
    "- SUMATERA & KALIMANTAN: seluruh provinsi di Pulau Sumatera dan Kalimantan.",
    "- OUTSIDE: provinsi lain di luar daftar di atas.",
    "Jika lokasi tidak dikenali, ambigu (nama yang sama ada di beberapa provinsi), atau Anda ragu,",
    "isi reporting_region = UNKNOWN dan confidence = low. Jangan menebak.",
    "confidence = high hanya bila Anda yakin lokasi tersebut ada dan tidak ambigu.",
    `Teks domisili: ${JSON.stringify(domicile)}`,
  ].join("\n");
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

export class GeminiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GeminiError";
  }
}

export async function resolveLocationWithGemini(domicile: string, config: GeminiConfig): Promise<AiLocationResult> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const response = await fetchImpl(`${API_BASE}/models/${encodeURIComponent(config.model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildLocationPrompt(domicile) }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = z.object({ error: z.object({ message: z.string() }) }).safeParse(body);
    throw new GeminiError(
      `Gemini API ${response.status}: ${message.success ? message.data.error.message : response.statusText}`,
      response.status,
    );
  }

  const text = z
    .object({
      candidates: z
        .array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string() })).min(1) }) }))
        .min(1),
    })
    .safeParse(body);
  if (!text.success) throw new GeminiError("Respons Gemini tidak berisi hasil.");

  let json: unknown;
  try {
    json = JSON.parse(text.data.candidates[0]!.content.parts[0]!.text);
  } catch {
    throw new GeminiError("Respons Gemini bukan JSON yang valid.");
  }
  const parsed = aiLocationSchema.safeParse(json);
  if (!parsed.success) throw new GeminiError("Struktur respons Gemini tidak sesuai skema.");
  return parsed.data;
}

export interface GeminiModelInfo {
  name: string;
  displayName: string | null;
  supportsGenerateContent: boolean;
  inputTokenLimit: number | null;
}

/** Confirms that the configured model exists for this API key. */
export async function getGeminiModelInfo(config: GeminiConfig): Promise<GeminiModelInfo> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const response = await fetchImpl(`${API_BASE}/models/${encodeURIComponent(config.model)}`, {
    headers: { "x-goog-api-key": config.apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = z.object({ error: z.object({ message: z.string() }) }).safeParse(body);
    throw new GeminiError(
      `Gemini API ${response.status}: ${message.success ? message.data.error.message : response.statusText}`,
      response.status,
    );
  }
  const info = z
    .object({
      name: z.string(),
      displayName: z.string().optional(),
      inputTokenLimit: z.number().optional(),
      supportedGenerationMethods: z.array(z.string()).optional(),
    })
    .parse(body);
  return {
    name: info.name,
    displayName: info.displayName ?? null,
    supportsGenerateContent: info.supportedGenerationMethods?.includes("generateContent") ?? false,
    inputTokenLimit: info.inputTokenLimit ?? null,
  };
}
