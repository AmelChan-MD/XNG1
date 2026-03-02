import config from '../config.js';

export default function autoview(sock) {
  if (config.AutoViewStatus !== 'on') return;

  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (!Array.isArray(messages)) return;

    for (const msg of messages) {
      try {
        if (!msg?.key) continue;

        const { key, pushName } = msg;

        // Fokus hanya ke status
        if (key.remoteJid !== 'status@broadcast') continue;
        if (key.fromMe) continue;

        const name = pushName || 'Tanpa Nama';
        console.log(`👀 Melihat story dari: ${name}`);

        await sock.readMessages([key]);

      } catch (err) {
        console.error('❌ Gagal auto-view story:', err);
      }
    }
  });
}
