#!/usr/bin/env node
/**
 * WhatsApp sender for DDC Leads Report.
 *
 * Runs OUTSIDE Vercel, because an unofficial WhatsApp connection has to stay
 * open and keep its session on disk — neither of which a serverless function
 * can do. It PULLS work from the app, so it needs no public address and no
 * open port: the same file runs on a laptop today and on the office VPS later.
 *
 *   npm --prefix worker install
 *   APP_URL=https://… WA_WORKER_SECRET=… node worker/send-whatsapp.mjs
 *
 * The first run prints a QR code to scan from WhatsApp on the phone
 * (Settings -> Linked devices -> Link a device). The session is then kept in
 * worker/.wa-session/ and reused, so later runs start without scanning.
 *
 * This uses an unofficial library. WhatsApp does not permit it, and the number
 * can be banned. Read worker/README.md before pointing it at a real number.
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from "baileys";
import qrcode from "qrcode-terminal";

const APP_URL = (process.env.APP_URL ?? "").replace(/\/+$/, "");
const SECRET = process.env.WA_WORKER_SECRET ?? "";
const POLL_MS = Number(process.env.WA_POLL_SECONDS ?? 8) * 1000;
const BATCH = Number(process.env.WA_BATCH ?? 5);
/** WhatsApp dislikes bursts; leave a gap between messages. */
const GAP_MS = Number(process.env.WA_GAP_SECONDS ?? 4) * 1000;
const SESSION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), ".wa-session");

if (!APP_URL || !SECRET) {
  console.error("APP_URL dan WA_WORKER_SECRET wajib diisi. Lihat worker/README.md.");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Baileys logs a stack trace per retry; keep the operator's view readable. */
const quiet = { level: "silent", child: () => quiet, trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {} };
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

async function callApp(route, body) {
  const response = await fetch(`${APP_URL}/api/wa/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${route} -> HTTP ${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

/** Group subject -> JID, rebuilt on connect and whenever a name is missing. */
let groupsByName = new Map();

async function refreshGroups(sock) {
  const all = await sock.groupFetchAllParticipating();
  groupsByName = new Map(Object.values(all).map((g) => [g.subject.trim().toLowerCase(), g.id]));
  log(`Grup terlihat: ${groupsByName.size}`);
}

async function resolveGroup(sock, name) {
  const key = name.trim().toLowerCase();
  if (groupsByName.has(key)) return groupsByName.get(key);
  await refreshGroups(sock);
  return groupsByName.get(key) ?? null;
}

async function processOnce(sock) {
  const { sends } = await callApp("poll", { limit: BATCH });
  if (!sends?.length) return 0;

  const results = [];
  for (const send of sends) {
    try {
      const jid = await resolveGroup(sock, send.groupName);
      if (!jid) throw new Error(`Grup "${send.groupName}" tidak ditemukan di akun WhatsApp ini`);
      await sock.sendMessage(jid, { text: send.message });
      log(`Terkirim -> ${send.groupName}`);
      results.push({ handoverId: send.handoverId, ok: true, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`GAGAL -> ${send.groupName}: ${message}`);
      results.push({ handoverId: send.handoverId, ok: false, error: message });
    }
    await sleep(GAP_MS);
  }

  await callApp("result", { results });
  return results.length;
}

let reconnecting = false;

async function start() {
  reconnecting = false;
  if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const sock = makeWASocket({ auth: state, logger: quiet, printQRInTerminal: false, markOnlineOnConnect: false });

  sock.ev.on("creds.update", saveCreds);

  let polling = false;
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("\nScan QR ini dari WhatsApp di HP: Setelan -> Perangkat tertaut -> Tautkan perangkat\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      log("Tersambung ke WhatsApp.");
      await refreshGroups(sock).catch((e) => log("Gagal membaca daftar grup:", e.message));
      if (!polling) {
        polling = true;
        void pollLoop(sock);
      }
    }
    if (connection === "close") {
      const status = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = status === DisconnectReason.loggedOut;
      log(`Koneksi tertutup (${status ?? "?"}).`, loggedOut ? "Sesi dicabut — hapus worker/.wa-session lalu scan ulang." : "Menyambung ulang…");
      if (loggedOut) process.exit(1);
      // One reconnect at a time, or every failed attempt would start another.
      if (!reconnecting) {
        reconnecting = true;
        setTimeout(() => void start(), 3000);
      }
    }
  });
}

async function pollLoop(sock) {
  for (;;) {
    try {
      const done = await processOnce(sock);
      if (done > 0) log(`Selesai memproses ${done} antrean.`);
    } catch (error) {
      log("Gagal menghubungi aplikasi:", error instanceof Error ? error.message : error);
    }
    await sleep(POLL_MS);
  }
}

process.on("SIGINT", () => {
  log("Berhenti.");
  process.exit(0);
});

log(`Worker mulai. Aplikasi: ${APP_URL}`);
await start();
