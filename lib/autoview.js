import config from '../config.js';

export default function autoview(sock) {
  // Cek konfigurasi, kalau OFF langsung pulang
  if (config.AutoViewStatus !== 'on') return;

  const viewed = new Set(); // Penyimpanan ID status yang udah dilihat
  const queue = [];         // Antrian status yang menunggu diproses
  let processing = false;   // Flag biar gak proses ganda

  // Fungsi tidur ala kadarnya
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Fungsi inti buat nandai status sebagai "dibaca"
   * Pakai format standar official Baileys
   */
  async function readStatus(key) {
    const participant = key.participant;
    if (!participant) return; // Kalau gak ada participant, skip (takut error)

    const payload = {
      remoteJid: 'status@broadcast',
      id: key.id,
      participant: participant,
      fromMe: false
    };

    try {
      await sock.readMessages([payload]);
    } catch (err) {
      // Silent error biar gak spam console kalau gagal read
      // console.error('Gagal read status:', err.message);
    }
  }

  /**
   * Processor antrian (Worker)
   * Jalanin satu-satu dengan delay biar kayak manusia
   */
  async function processQueue() {
    if (processing) return; // Kalau lagi proses, jangan ganggu
    processing = true;

    while (queue.length > 0) {
      const msg = queue.shift(); // Ambil depan antrian

      try {
        const { key, pushName } = msg;
        // Validasi dasar
        if (!key) continue;
        if (key.remoteJid !== 'status@broadcast') continue;
        if (key.fromMe) continue; // Skip status sendiri

        const id = key.id;
        if (!id || viewed.has(id)) continue; // Skip kalau udah pernah dilihat

        // Tandai sebagai dilihat
        viewed.add(id);

        // Format nama yang enak diliat
        const name = pushName || key.participant?.split('@')[0] || 'Unknown User';
        console.log(`👀 [AutoView] Melihat story dari: ${name}`);

        // 1. Update presence biar keliatan "Online/Aktif"
        await sock.sendPresenceUpdate('available');

        // 2. Delay acak (1.5s - 2.5s) biar natural
        const randomDelay = Math.floor(Math.random() * 1000) + 1500;
        await sleep(randomDelay);

        // 3. Kirim read receipt utama
        await readStatus(key);

        // 4. Delay & Retry (Jaga-jaga kalau server WA lag)
        await sleep(2000);
        await readStatus(key);

      } catch (err) {
        console.error('❌ [AutoView] Error saat proses:', err.message);
      }

      // 5. Delay antar status (1.2s) biar gak dianggap spam
      await sleep(1200);
    }

    processing = false; // Selesai, siap terima antrian baru
  }

  /**
   * Masukin status ke antrian
   */
  function addQueue(msg) {
    if (!msg?.key?.id) return;
    queue.push(msg);
    
    // Jalankan processor kalau belum jalan
    if (!processing) {
      processQueue();    }
  }

  // ---------------------------------------------------------
  // EVENT LISTENER 1: Pesan Baru Masuk (Upsert)
  // ---------------------------------------------------------
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    if (!Array.isArray(m.messages)) return;

    for (const msg of m.messages) {
      // Unwrap struktur pesan (ephemeral/viewOnce)
      const message =
        msg.message?.ephemeralMessage?.message ||
        msg.message?.viewOnceMessage?.message ||
        msg.message;

      if (!message) continue;

      // Cek apakah ini Status WhatsApp
      if (msg.key?.remoteJid === 'status@broadcast') {
        addQueue(msg);
      }
    }
  });

  // ---------------------------------------------------------
  // EVENT LISTENER 2: Update Pesan (Fallback)
  // ---------------------------------------------------------
  sock.ev.on('messages.update', async (updates) => {
    if (!Array.isArray(updates)) return;

    for (const update of updates) {
      const key = update.key;
      if (!key) continue;
      if (key.remoteJid !== 'status@broadcast') continue;

      // Kalau belum dilihat, masukin antrian (hati-hati loop)
      if (!viewed.has(key.id)) {
        addQueue({ key, pushName: null }); 
      }
    }
  });

  // ---------------------------------------------------------
  // CATATAN PENTING:
  // Fitur 'fetchStatus' untuk scan backlog TIDAK ADA di 
  // Baileys Official. Kode ini difokuskan untuk Real-time only.
  // Jangan dipaksa pakai fungsi fork yang bakal error.
  // ---------------------------------------------------------  
  console.log('✅ [AutoView] Sistem aktif (Mode: Real-time Only)');
                      }
