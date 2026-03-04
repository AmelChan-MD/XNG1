import config from '../config.js';

export default function autoview(sock) {
  if (config.AutoViewStatus !== 'on') return;

  const viewed = new Set();
  const queue = [];
  let processing = false;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function processQueue() {
    if (processing) return;
    processing = true;

    while (queue.length) {
      const msg = queue.shift();

      try {
        const { key, pushName } = msg;

        if (!key) continue;
        if (key.remoteJid !== 'status@broadcast') continue;
        if (key.fromMe) continue;

        const id = key.id;
        if (!id || viewed.has(id)) continue;

        viewed.add(id);

        const owner = key.participant || key.remoteJid;
        const name = pushName || 'Tanpa Nama';

        console.log(`👀 Melihat story dari: ${name}`);

        await sock.sendPresenceUpdate('available');

        await sleep(1500);

        // read ke broadcast
        await sock.readMessages([key]);

        // read ke pemilik status (lebih stabil di Baileys baru)
        await sock.readMessages([
          {
            remoteJid: owner,
            id: key.id,
            participant: owner
          }
        ]);

        // retry
        await sleep(2000);
        await sock.readMessages([key]);

      } catch (err) {
        console.error('❌ AutoView error:', err);
      }

      await sleep(1200);
    }

    processing = false;
  }

  function addQueue(msg) {
    if (!msg?.key?.id) return;
    queue.push(msg);
    processQueue();
  }

  // EVENT status baru
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    if (!Array.isArray(m.messages)) return;

    for (const msg of m.messages) {

      const message =
        msg.message?.ephemeralMessage?.message ||
        msg.message?.viewOnceMessage?.message ||
        msg.message;

      if (!message) continue;

      if (msg.key?.remoteJid === 'status@broadcast') {
        addQueue(msg);
      }
    }
  });

  // EVENT update status
  sock.ev.on('messages.update', async (updates) => {
    if (!Array.isArray(updates)) return;

    for (const update of updates) {

      const key = update.key;

      if (!key) continue;
      if (key.remoteJid !== 'status@broadcast') continue;

      addQueue({ key });
    }
  });

  // scan status saat bot connect
  sock.ev.on('connection.update', async ({ connection }) => {
    if (connection !== 'open') return;

    console.log('📡 Scan status backlog...');

    await sleep(5000);

    try {
      const statuses = await sock.fetchStatus?.();

      if (!statuses) return;

      for (const s of statuses) {
        if (s?.key) addQueue(s);
      }

    } catch (err) {
      console.log('⚠️ fetchStatus tidak didukung versi Baileys ini');
    }
  });
  }
