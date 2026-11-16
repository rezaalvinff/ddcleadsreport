import { describe, expect, it } from "vitest";
import { allowedEmails, ConfigurationError, decodePrivateKey, readEnv, requireEnv } from "@/lib/env";

const sheets = {
  GOOGLE_SHEETS_SPREADSHEET_ID: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "dipo-sync@project.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
};

describe("environment validation", () => {
  it("lists every missing variable", () => {
    const result = readEnv("supabase", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toEqual([
        "NEXT_PUBLIC_SUPABASE_URL belum diisi",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY belum diisi",
        "SUPABASE_SERVICE_ROLE_KEY belum diisi",
      ]);
    }
  });

  it("rejects malformed values", () => {
    const result = readEnv("sheets", { ...sheets, GOOGLE_SERVICE_ACCOUNT_EMAIL: "nope", GOOGLE_PRIVATE_KEY: "secret" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(" ")).toMatch(/GOOGLE_SERVICE_ACCOUNT_EMAIL.*GOOGLE_PRIVATE_KEY/);
    expect(readEnv("gemini", { GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini 2.5; drop" }).ok).toBe(false);
    expect(readEnv("cron", { CRON_SECRET: "short" }).ok).toBe(false);
  });

  it("accepts valid values and throws a ConfigurationError otherwise", () => {
    expect(requireEnv("sheets", sheets).GOOGLE_SHEETS_SPREADSHEET_ID).toBe(sheets.GOOGLE_SHEETS_SPREADSHEET_ID);
    expect(() => requireEnv("gemini", {})).toThrow(ConfigurationError);
  });

  it("decodes escaped newlines in the private key", () => {
    expect(decodePrivateKey(sheets.GOOGLE_PRIVATE_KEY)).toBe("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----");
  });

  it("parses the login allowlist case-insensitively and fails closed when empty", () => {
    expect([...allowedEmails({ ALLOWED_EMAILS: " Admin@Example.com, b@example.com ," })]).toEqual(["admin@example.com", "b@example.com"]);
    expect(allowedEmails({}).size).toBe(0);
  });
});
