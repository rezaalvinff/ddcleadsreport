import { z } from "zod";

type EnvSource = Record<string, string | undefined>;

const nonEmpty = z.string().trim().min(1);

const schemas = {
  supabase: z.object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
    SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
  }),
  auth: z.object({
    ALLOWED_EMAILS: nonEmpty,
  }),
  sheets: z.object({
    GOOGLE_SHEETS_SPREADSHEET_ID: z.string().trim().regex(/^[A-Za-z0-9_-]{20,}$/, "format ID spreadsheet tidak valid"),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: z.email(),
    GOOGLE_PRIVATE_KEY: z.string().includes("PRIVATE KEY", { message: "bukan private key PEM" }),
  }),
  gemini: z.object({
    GEMINI_API_KEY: nonEmpty,
    GEMINI_MODEL: z.string().trim().regex(/^[a-z0-9.-]+$/, "nama model tidak valid"),
  }),
  cron: z.object({
    CRON_SECRET: z.string().min(16, "minimal 16 karakter"),
  }),
  waWorker: z.object({
    WA_WORKER_SECRET: z.string().min(24, "minimal 24 karakter"),
  }),
} as const;

export type EnvGroup = keyof typeof schemas;
export type EnvOf<G extends EnvGroup> = z.infer<(typeof schemas)[G]>;

export type EnvResult<G extends EnvGroup> =
  | { ok: true; value: EnvOf<G> }
  | { ok: false; problems: string[] };

export class ConfigurationError extends Error {
  constructor(group: EnvGroup, problems: string[]) {
    super(`Konfigurasi ${group} belum lengkap: ${problems.join("; ")}`);
    this.name = "ConfigurationError";
  }
}

export function readEnv<G extends EnvGroup>(group: G, source: EnvSource = process.env): EnvResult<G> {
  const schema = schemas[group];
  const input = Object.fromEntries(Object.keys(schema.shape).map((key) => [key, source[key] || undefined]));
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data as EnvOf<G> };
  return {
    ok: false,
    problems: parsed.error.issues.map((issue) => {
      const key = String(issue.path[0] ?? group);
      return input[key] === undefined ? `${key} belum diisi` : `${key}: ${issue.message}`;
    }),
  };
}

export function requireEnv<G extends EnvGroup>(group: G, source: EnvSource = process.env): EnvOf<G> {
  const result = readEnv(group, source);
  if (!result.ok) throw new ConfigurationError(group, result.problems);
  return result.value;
}

/** Vercel stores multi-line secrets with literal "\n" sequences. */
export function decodePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

export function allowedEmails(source: EnvSource = process.env): Set<string> {
  const result = readEnv("auth", source);
  if (!result.ok) return new Set();
  return new Set(
    result.value.ALLOWED_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}
