import config from '../config.js';

export default function autoview(sock) {
  if (config.AutoViewStatus !== 'on') return;

  const viewed = new Set();

  async function viewStatus(msg) {
    try {
      if (!msg?.key) return;

      const { key, pushName } = msg;

      if (key.remoteJid !== 'status@broadcast') return;
      if (key.fromMe) return;

      const id = key.id;
      if (viewed.has(id)) return;

      viewed.add(id);

      const name = pushName || 'Tanpa Nama';
      console.log(`👀 Melihat story dari: ${name}`);

      await new Promise(r => setTimeout(r, 800));
      await sock.readMessages([key]);

    } catch (err) {
      console.error('❌ AutoView error:', err);
    }
  }

  // EVENT 1
  sock.ev.on('messages.upsert', async (m) => {
    if (!m.messages) return;

    for (const msg of m.messages) {
      const message =
        msg.message?.ephemeralMessage?.message ||
        msg.message;

      if (!message) continue;

      await viewStatus(msg);
    }
  });

  // EVENT 2
  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      const key = update.key;

      if (!key) continue;
      if (key.remoteJid !== 'status@broadcast') continue;

      await viewStatus({ key });
    }
  });

}
