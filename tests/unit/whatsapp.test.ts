import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildHandoverMessage, copyHandoverMessage, handoverTarget, isValidGroupInviteLink, WHATSAPP_WEB_URL } from "@/lib/whatsapp/message";

const lead = {
  name: "Budi Santoso",
  phone: "081234567890",
  domicile: "Muara Bungo",
  unit: "Pajero Sport",
  source: "TIKTOK",
};

const CLOSING = "Mohon untuk segera di follow up ya, terimakasih\u263A\uFE0F\uD83D\uDE4F\uD83C\uDFFB";

const EXPECTED = `Halo, saya mau info leads baru lagi berikut data customernya :

Source : TIKTOK
Nama : Budi Santoso
Nomer WA : 081234567890
Tipe unit : Pajero Sport
Domisili : Muara Bungo

${CLOSING}`;

describe("handover message", () => {
  it("follows the template exactly when there is no customer note", () => {
    expect(buildHandoverMessage(lead)).toBe(EXPECTED);
    expect(buildHandoverMessage({ ...lead, customerNote: null })).toBe(EXPECTED);
    expect(buildHandoverMessage({ ...lead, customerNote: "   " })).toBe(EXPECTED);
  });

  it("leads the closing sentence with the customer note", () => {
    const note = "Cust terakhir minta info angsuran untuk DP 50 juta";
    expect(buildHandoverMessage({ ...lead, customerNote: note })).toBe(
      EXPECTED.replace(CLOSING, `${note}, ${CLOSING}`),
    );
  });

  it("drops punctuation the note ends with, so the comma reads correctly", () => {
    for (const written of ["Minta brosur.", "Minta brosur,", "Minta brosur ", "Minta brosur;"]) {
      expect(buildHandoverMessage({ ...lead, customerNote: written })).toContain(`Minta brosur, ${CLOSING}`);
    }
  });

  it("includes the prospect phone number so the branch can call them", () => {
    expect(buildHandoverMessage(lead)).toContain("Nomer WA : 081234567890");
  });

  it("puts exactly the message on the clipboard", async () => {
    const clipboard = { writeText: vi.fn(async () => {}) };
    await copyHandoverMessage(clipboard, lead);
    expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith(EXPECTED);
  });

  it("propagates clipboard failures instead of reporting success", async () => {
    const clipboard = { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) };
    await expect(copyHandoverMessage(clipboard, lead)).rejects.toThrow("denied");
  });
});

describe("destination", () => {
  it("opens a valid official invite link", () => {
    expect(handoverTarget({ group_name: "DIPO Bekasi", group_link: "https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv" })).toMatchObject({
      kind: "invite",
      url: "https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv",
    });
  });

  it("falls back to WhatsApp Web with a manual-selection instruction", () => {
    const target = handoverTarget({ group_name: "DIPO Bekasi", group_link: null });
    expect(target).toMatchObject({ kind: "web", url: WHATSAPP_WEB_URL });
    expect(target.instruction).toContain("DIPO Bekasi");
    expect(target.instruction).toContain("manual");
  });

  it("never treats a group name or another URL as a link", () => {
    expect(isValidGroupInviteLink("DIPO Bekasi")).toBe(false);
    expect(isValidGroupInviteLink("https://wa.me/6281234567890")).toBe(false);
    expect(isValidGroupInviteLink("https://chat.whatsapp.com.evil.com/AbCdEfGhIjKl")).toBe(false);
    expect(handoverTarget({ group_name: "X", group_link: "javascript:alert(1)" }).kind).toBe("web");
  });
});

describe("the Vercel app never talks to WhatsApp itself", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

  const UNOFFICIAL = [
    "baileys",
    "@whiskeysockets/baileys",
    "whatsapp-web.js",
    "venom-bot",
    "@wppconnect-team/wppconnect",
    "@open-wa/wa-automate",
    "puppeteer",
    "playwright",
    "selenium-webdriver",
  ];

  it("keeps every WhatsApp client out of the deployed app's dependencies", () => {
    // The optional sender lives in worker/, with its own package.json, and runs
    // outside Vercel. Nothing it uses may leak into the app that is deployed.
    expect(deps.filter((d) => UNOFFICIAL.includes(d))).toEqual([]);
  });

  it("only references official WhatsApp URLs in the app source", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) files.push(p);
      }
    };
    walk(path.join(root, "src"));
    const source = files.map((f) => readFileSync(f, "utf8")).join("\n");
    const hosts = new Set([...source.matchAll(/https?:\/\/([a-z0-9.-]*whatsapp[a-z0-9.-]*|wa\.me)/gi)].map((m) => m[1]!.toLowerCase()));
    expect([...hosts].sort()).toEqual(["chat.whatsapp.com", "web.whatsapp.com"]);
  });

  it("imports no WhatsApp client anywhere under src/", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) files.push(p);
      }
    };
    walk(path.join(root, "src"));
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const mod of UNOFFICIAL) {
        expect(source.includes(`from "${mod}"`), `${path.relative(root, file)} imports ${mod}`).toBe(false);
      }
    }
  });

  it("confines the optional sender to worker/, with the risks written down", () => {
    const workerPkg = JSON.parse(readFileSync(path.join(root, "worker/package.json"), "utf8"));
    expect(Object.keys(workerPkg.dependencies)).toContain("baileys");
    const readme = readFileSync(path.join(root, "worker/README.md"), "utf8");
    expect(readme).toMatch(/tidak resmi/i);
    expect(readme).toMatch(/Ketentuan Layanan WhatsApp/i);
    expect(readme).toMatch(/diblokir/i);
  });
});
