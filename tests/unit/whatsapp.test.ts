import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildHandoverMessage, copyHandoverMessage, handoverTarget, isValidGroupInviteLink, WHATSAPP_WEB_URL } from "@/lib/whatsapp/message";

const lead = { name: "Budi Santoso", domicile: "Muara Bungo", unit: "Pajero Sport", source: "TIKTOK" };
const EXPECTED = `HOT PROSPEK MITSUBISHI DIPO
Nama: Budi Santoso
Domisili: Muara Bungo
Unit: Pajero Sport
Source: TIKTOK
Mohon segera ditindaklanjuti oleh PIC cabang terkait. Terima kasih.`;

describe("handover message", () => {
  it("follows the template exactly", () => {
    expect(buildHandoverMessage(lead)).toBe(EXPECTED);
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

describe("no unofficial WhatsApp automation", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

  it("has no WhatsApp automation or browser automation dependencies", () => {
    const banned = ["baileys", "@whiskeysockets/baileys", "whatsapp-web.js", "venom-bot", "@wppconnect-team/wppconnect", "@open-wa/wa-automate", "puppeteer", "playwright", "selenium-webdriver"];
    expect(deps.filter((d) => banned.includes(d))).toEqual([]);
  });

  it("only references official WhatsApp URLs in the source", () => {
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
    expect(source).not.toMatch(/evolution-api|waha|wwebjs|sendMessage\(/i);
  });
});
