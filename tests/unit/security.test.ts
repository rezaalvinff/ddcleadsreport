import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "@/lib/cron";

const root = path.resolve(import.meta.dirname, "../..");

function files(dir: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p, pattern));
    else if (pattern.test(name)) out.push(p);
  }
  return out;
}

const sourceFiles = files(path.join(root, "src"), /\.(ts|tsx)$/);
const read = (f: string) => readFileSync(f, "utf8");

describe("server actions", () => {
  const actionFiles = sourceFiles.filter((f) => read(f).trimStart().startsWith('"use server"'));

  it("exist", () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(5);
  });

  it("all verify the signed-in user first (except the login actions)", () => {
    const offenders: string[] = [];
    for (const file of actionFiles) {
      if (file.endsWith(path.join("login", "actions.ts"))) continue;
      const source = read(file);
      const exported = [...source.matchAll(/export async function (\w+)/g)];
      expect(exported.length).toBeGreaterThan(0);
      for (const fn of exported) {
        // The body starts at the first "{" that ends a line after the signature.
        const bodyStart = source.indexOf("{\n", fn.index);
        const firstStatement = source.slice(bodyStart + 2).trimStart();
        if (!firstStatement.startsWith("await requireUser();")) offenders.push(`${path.relative(root, file)}:${fn[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("protects every app page with requireUser", () => {
    const pages = sourceFiles.filter((f) => f.includes(`${path.sep}(app)${path.sep}`) && /page\.tsx$|layout\.tsx$/.test(f));
    expect(pages.length).toBeGreaterThanOrEqual(8);
    expect(pages.filter((f) => !read(f).includes("await requireUser()")).map((f) => path.relative(root, f))).toEqual([]);
  });
});

describe("secrets stay on the server", () => {
  const clientFiles = sourceFiles.filter((f) => read(f).trimStart().startsWith('"use client"'));

  it("client components never import server-only modules at runtime", () => {
    const serverOnly = ["@/lib/db/admin", "@/lib/sheets/gateway", "@/lib/supabase/server", "@/lib/auth", "@/lib/env", "@/lib/sync/app", "@/lib/location/gemini"];
    const offenders = clientFiles.flatMap((f) =>
      [...read(f).matchAll(/^import (?!type )[^;]*from "([^"]+)";/gm)]
        .map((m) => m[1]!)
        .filter((mod) => serverOnly.includes(mod) || mod.endsWith("/service"))
        .map((mod) => `${path.relative(root, f)} -> ${mod}`),
    );
    expect(offenders).toEqual([]);
  });

  it("modules holding credentials are marked server-only", () => {
    for (const mod of ["db/admin.ts", "sheets/gateway.ts", "supabase/server.ts", "auth.ts", "sync/app.ts"]) {
      expect(read(path.join(root, "src/lib", mod))).toMatch(/^import "server-only";/);
    }
  });

  it("never exposes secret variables through NEXT_PUBLIC_", () => {
    const source = sourceFiles.map(read).join("\n");
    expect(source).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SERVICE_ROLE|PRIVATE|GEMINI|SECRET)/);
  });

  it("documents every required variable in .env.example without values", () => {
    const example = read(path.join(root, ".env.example"));
    for (const key of [
      "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY", "GEMINI_MODEL",
      "GOOGLE_SHEETS_SPREADSHEET_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "ALLOWED_EMAILS", "CRON_SECRET",
    ]) {
      expect(example).toMatch(new RegExp(`^${key}=`, "m"));
    }
    const secretLines = example.split("\n").filter((l) => /^(SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|GOOGLE_PRIVATE_KEY|CRON_SECRET)=/.test(l));
    expect(secretLines.every((l) => l.endsWith("="))).toBe(true);
  });
});

describe("cron endpoint authorisation", () => {
  const secret = "s3cret-value-1234567890";
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCron(null, secret)).toBe(false);
    expect(isAuthorizedCron(secret, secret)).toBe(false);
    expect(isAuthorizedCron(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedCron("Bearer ", secret)).toBe(false);
  });

  it("is excluded from the session proxy only because it checks CRON_SECRET itself", () => {
    expect(read(path.join(root, "src/app/api/cron/sync/route.ts"))).toContain("isAuthorizedCron(");
    expect(read(path.join(root, "src/proxy.ts"))).toContain("api/cron");
  });
});
