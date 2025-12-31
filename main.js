import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from "@whiskeysockets/baileys";

import fs from "fs";
import path from "path";
import qrcode from "qrcode-terminal";
import { Boom } from "@hapi/boom";
import pino from "pino";
import chalk from "chalk";

import config from "./config.js";
import handleMessage from "./lib/xenovia.js";
import { cloneOrUpdateRepo } from "./lib/cekUpdate.js";
import { mylog, warnlog, errorlog, successlog, infolog, banner } from "./lib/color.js";

/* =======================
   ENV FLAGS (IMPORTANT)
======================= */
const IS_DOCKER = process.env.DOCKER === "true";
const IS_NORTHFLANK = process.env.NORTHFLANK === "true";
const PHONE = process.env.PHONE_NUMBER || config.phone_number_bot;

const delay = ms => new Promise(res => setTimeout(res, ms));

process.on("uncaughtException", err => {
  console.log(errorlog("💥 Uncaught Exception:"), err);
});

process.on("unhandledRejection", err => {
  console.log(errorlog("💥 Unhandled Rejection:"), err);
});

/* =======================
   BOOT
======================= */
console.clear();
console.log(banner("Xenovia AI"));
console.log(successlog("🚀 Bot sedang dijalankan...\n"));

main().catch(err => console.log(errorlog("❌ Error utama:"), err));

/* =======================
   MAIN
======================= */
async function main() {
  await checkAndUpdate();
  await connectToWhatsApp();

  // Keep-alive buat container platform
  setInterval(() => {
    console.log("🟢 Bot alive", new Date().toISOString());
  }, 60_000);
}

/* =======================
   UPDATE CHECK (SAFE)
======================= */
async function checkAndUpdate() {
  if (!IS_DOCKER && config.AutoUpdate === "on") {
    console.log(infolog("[🔄] Mengecek update dari GitHub..."));
    await cloneOrUpdateRepo();
    console.log(successlog("[✅] Update selesai."));
  } else {
    console.log(warnlog("[ℹ️] AutoUpdate dimatikan (Docker/Platform)."));
  }

  const sessionDir = path.join(process.cwd(), "sessions");
  const credsPath = path.join(sessionDir, "creds.json");

  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  if (fs.existsSync(credsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(credsPath));
      if (!parsed || typeof parsed !== "object" || !parsed.noiseKey) {
        throw new Error("creds.json tidak valid");
      }
    } catch {
      console.log(warnlog("🧨 Session rusak → reset"));
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  }
}

/* =======================
   WHATSAPP CONNECTION
======================= */
async function connectToWhatsApp() {
  const sessionDir = path.join(process.cwd(), "sessions");
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
    },
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    printQRInTerminal: false,
    syncFullHistory: false
  });

  global.sock = sock;

  /* ===== Pairing Code ===== */
  if (
    !sock.authState.creds.registered &&
    config.type_connection.toLowerCase() === "pairing"
  ) {
    try {
      console.log(infolog("🕓 Menyiapkan pairing code..."));
      await delay(5000);

      const code = await sock.requestPairingCode(PHONE.trim());
      console.log(chalk.blue("🔗 PHONE:"), chalk.yellow(PHONE));
      console.log(chalk.green("🔐 CODE:"), chalk.yellow(code));
    } catch (err) {
      console.log(errorlog("❌ Gagal pairing:"), err?.message || err);
      console.log(warnlog("⏳ Menunggu retry pairing..."));
      return;
    }
  }

  /* ===== EVENTS ===== */
  sock.ev.on("connection.update", update =>
    handleConnectionUpdate(sock, update)
  );

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      if (!messages?.[0]) return;

      const msg = messages[0];
      const fromMe = msg.key.fromMe;

      if (config.SelfMode === "on" && !fromMe) return;

      await handleMessage(sock, msg);
    } catch (err) {
      console.log(errorlog("🧨 Gagal handle pesan:"), err);
    }
  });

  setFilePermissions(sessionDir);

  sock.reply = (from, text, msg) =>
    sock.sendMessage(from, { text }, { quoted: msg });

  sock.sendMessageFromContent = async (jid, content) =>
    sock.relayMessage(jid, content.message, {
      messageId: content.key.id
    });

  import("./lib/motiv.js").then(m => m.default(sock));
  import("./lib/tagabsen.js").then(m => m.default(sock));
  import("./lib/autoview.js").then(m => m.default(sock));

  process.on("SIGINT", () => {
    console.log(warnlog("🛑 Bot dimatikan manual (SIGINT)..."));
    process.exit(0);
  });
}

/* =======================
   CONNECTION HANDLER
======================= */
function handleConnectionUpdate(sock, { connection, lastDisconnect, qr }) {
  if (qr && config.type_connection.toLowerCase() === "qr") {
    console.clear();
    console.log(banner("Xenovia AI"));
    console.log(successlog("📲 Scan QR berikut:\n"));
    qrcode.generate(qr, { small: true });
  }

  if (connection === "open") {
    console.log(successlog("✅ Terhubung ke WhatsApp!"));
  }

  if (connection === "close") {
    const boom = new Boom(lastDisconnect?.error);
    const code =
      boom?.output?.statusCode ||
      lastDisconnect?.error?.output?.statusCode;

    const reason = {
      [DisconnectReason.badSession]: "Sesi rusak",
      [DisconnectReason.connectionClosed]: "Koneksi tertutup",
      [DisconnectReason.connectionLost]: "Koneksi hilang",
      [DisconnectReason.connectionReplaced]: "Sesi digantikan",
      [DisconnectReason.loggedOut]: "Logout",
      [DisconnectReason.restartRequired]: "Restart perlu",
      [DisconnectReason.timedOut]: "Timeout"
    };

    console.log(
      errorlog(`❌ Koneksi putus: ${reason[code] || "Unknown"} (${code})`)
    );

    if (code === DisconnectReason.loggedOut) {
      console.log(warnlog("⚠️ Logout → perlu pairing ulang"));
      return;
    }

    console.log(warnlog("🔁 Reconnect dalam 5 detik..."));
    setTimeout(() => connectToWhatsApp(), 5000);
  }
}

/* =======================
   PERMISSIONS
======================= */
function setFilePermissions(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.chmodSync(dir, 0o755);
  fs.readdir(dir, (err, files) => {
    if (!err) {
      for (const file of files) {
        fs.chmod(path.join(dir, file), 0o644, () => {});
      }
    }
  });
    }
