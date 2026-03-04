const baileys = (await import("@adiwajshing/baileys")
const makeWASocket = baileys.default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = baileys;

import fs from "fs";
import path from "path";
import { Boom } from "@hapi/boom";
import pino from "pino";
import chalk from "chalk";
import qrcode from "qrcode-terminal";

import config from "./config.js";
import handleMessage from "./lib/xenovia.js";
import autoview from "./lib/autoview.js";
import { cloneOrUpdateRepo } from "./lib/cekUpdate.js";
import { warnlog, errorlog, successlog, infolog, banner } from "./lib/color.js";

const delay = (ms) => new Promise(res => setTimeout(res, ms));

let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT = 20;

process.on("uncaughtException", err =>
  console.log(errorlog("💥 Uncaught Exception:"), err)
);

process.on("unhandledRejection", err =>
  console.log(errorlog("💥 Unhandled Rejection:"), err)
);

console.clear();
console.log(banner("Xenovia AI"));
console.log(successlog("🚀 Bot sedang dijalankan...\n"));

main().catch(err =>
  console.log(errorlog("❌ Error utama:"), err)
);

async function main() {
  await checkAndUpdate();
  await connectToWhatsApp();
}

async function checkAndUpdate() {
  if (config.AutoUpdate === "on") {
    console.log(infolog("[🔄] Mengecek update dari GitHub..."));
    await cloneOrUpdateRepo();
    console.log(successlog("[✅] Update selesai."));
  }

  const sessionDir = path.join(process.cwd(), "sessions");
  const credsPath = path.join(sessionDir, "creds.json");

  if (!fs.existsSync(sessionDir))
    fs.mkdirSync(sessionDir, { recursive: true });

  if (fs.existsSync(credsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(credsPath));
      if (!parsed?.noiseKey)
        throw new Error("creds.json tidak valid");
    } catch {
      console.log(warnlog("🧨 Sesi rusak. Reset..."));
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  }
}

async function connectToWhatsApp() {
  if (isConnecting) return;
  isConnecting = true;

  const sessionDir = path.join(process.cwd(), "sessions");

  const { state, saveCreds } =
    await useMultiFileAuthState(sessionDir);

  const { version } =
    await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino({ level: "silent" })
      )
    },

    browser: ["Ubuntu", "Chrome", "120.0.0"],
    printQRInTerminal: false,
    syncFullHistory: true,

    // 🔥 Anti 515 settings
    markOnlineOnConnect: false,
    keepAliveIntervalMs: 15000,
    connectTimeoutMs: 20000,
    defaultQueryTimeoutMs: 0
  });

  global.sock = sock;

  autoview(sock);

  if (
    !state.creds.registered &&
    config.type_connection.toLowerCase() === "pairing"
  ) {
    try {
      console.log(infolog("🕓 Menyiapkan pairing code..."));
      await delay(3000);
      const code =
        await sock.requestPairingCode(
          config.phone_number_bot.trim()
        );

      console.log(
        chalk.blue("🔗 PHONE:"),
        chalk.yellow(config.phone_number_bot)
      );
      console.log(
        chalk.green("🔐 CODE:"),
        chalk.yellow(code)
      );
    } catch (err) {
      console.log(
        errorlog("❌ Gagal pairing:"),
        err.message
      );
      fs.rmSync(sessionDir, {
        recursive: true,
        force: true
      });
      process.exit(1);
    }
  }

  sock.ev.on("connection.update", update =>
    handleConnectionUpdate(sock, update)
  );

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      if (!messages?.[0]) return;
      const msg = messages[0];

      if (
        config.SelfMode === "on" &&
        !msg.key.fromMe
      )
        return;

      await handleMessage(sock, msg);
    } catch (err) {
      console.log(
        errorlog("🧨 Gagal handle pesan:"),
        err
      );
    }
  });

  isConnecting = false;
  return sock;
}

function handleConnectionUpdate(
  sock,
  { connection, lastDisconnect, qr }
) {
  if (
    qr &&
    config.type_connection.toLowerCase() === "qr"
  ) {
    console.clear();
    console.log(banner("Xenovia AI"));
    console.log(
      successlog("📲 Scan QR berikut:\n")
    );
    qrcode.generate(qr, { small: true });
  }

  if (connection === "open") {
    reconnectAttempts = 0;
    console.log(
      successlog(
        "✅ Terhubung ke WhatsApp!"
      )
    );
  }

  if (connection === "close") {
    isConnecting = false;

    const boom = new Boom(
      lastDisconnect?.error
    );
    const code =
      boom?.output?.statusCode;

    console.log(
      errorlog(
        `❌ Koneksi putus (${code})`
      )
    );

    if (
      code === DisconnectReason.loggedOut
    ) {
      console.log(
        warnlog(
          "⚠️ Logout. Pairing ulang diperlukan."
        )
      );
      return;
    }

    if (
      reconnectAttempts >= MAX_RECONNECT
    ) {
      console.log(
        errorlog(
          "🚫 Max reconnect tercapai. Stop."
        )
      );
      return;
    }

    reconnectAttempts++;

    console.log(
      warnlog(
        `🔁 Reconnect dalam 3 detik... (${reconnectAttempts})`
      )
    );

    setTimeout(() => {
      connectToWhatsApp();
    }, 3000);
  }
    }
    
