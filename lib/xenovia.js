import fs from 'fs';
import os from 'os';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

import { downloadMp3, downloadMp4 } from './yt.js';
import { getBufferFromUrl, uploadToCatbox } from './getBufferFromUrl.js';
import { writeExif } from './sticker.js';
import sendMenuButtons from './sendMenu.js';
import { checkIn, getStreak } from './checkin.js';
import { mylog } from './color.js';
import config from '../config.js';
const { BOT_NAME, OWNER_NAME, OWNER_NUMBER, packname, author } = config;
import { doTranslate } from './translate.js';

const imagePath = './icon.png';
const imageBuffer = fs.existsSync(imagePath) ? fs.readFileSync(imagePath) : null;

export default async function handleMessage(sock, msg) {
  
  const from = msg.key.remoteJid;
  const sender = msg.key.participant || from;
  if (msg.key.fromMe) return;

  const name = msg.pushName || 'Tanpa Nama';
  const group = from.endsWith('@g.us') ? ' (Group)' : '';

  const type = msg.message && Object.keys(msg.message)[0];

  let body =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    msg.message?.buttonsResponseMessage?.selectedButtonId ||
    msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.message?.templateButtonReplyMessage?.selectedId ||
    msg.message?.interactiveResponseMessage?.body?.text ||
    msg.message?.[type]?.text ||
    msg.message?.[type]?.caption ||
    msg.message?.[type]?.selectedId ||
    '';

  if (!body && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
    let quoted = msg.message.extendedTextMessage.contextInfo.quotedMessage;
    let qtype = Object.keys(quoted)[0];
    body = quoted[qtype]?.text || quoted[qtype]?.caption || '';
  }

  if (!body) return;

  console.log(mylog(`⚡ XenoviaAI → 📨 ${name}${group} 💬 ${body}`));

  const command = body.trim().split(/\s+/)[0].toLowerCase();
  const args = body.trim().split(/\s+/).slice(1);
  const teks = body.trim().toLowerCase();

  switch (command) {

    case 'm':
    case 'menu':
    case '.menu':
      await sendMenuButtons(sock, msg);
      break;

    case '.runtime':
    case 'r': {
      
      const formatTime = (sec) => {
        const d = Math.floor(sec / 86400);
        const h = Math.floor((sec % 86400) / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        return `${d}h ${h}j ${m}m ${s}s`;
      };

      const pingStart = Date.now();
      await sock.sendPresenceUpdate('composing', from);
      const ping = Date.now() - pingStart;

      const uptime = formatTime(process.uptime());
      const vpsUptime = formatTime(os.uptime());
      const ramFree = (os.freemem() / 1e9).toFixed(2);
      const ramTotal = (os.totalmem() / 1e9).toFixed(2);

      let storageDisplay = 'Unknown';
      try {
        const df = execSync('df -h --output=size,used,pcent / | tail -n 1')
          .toString().replace(/\s+/g, ' ').trim().split(' ');
        const [total, used, percent] = df;
        storageDisplay = `${total} (${percent})`;
      } catch (err) {
        storageDisplay = 'Error reading storage';
      }

      const info = `
Xenovia Server Status
━━━━━━━━━━━━━━━━━━━
🖥️  OS       : XenoviaOS v5.5
🧠  CPU      : AMD EPYC 9654P
🎮  GPU      : XENOVIA ZXA-1Polaris
💾  RAM      : ${ramFree} GB / ${ramTotal} GB
📶  Ping     : ${ping} ms
⏱️  Bot Up   : ${uptime}
📦  Storage  : ${storageDisplay}
🔁  VPS Uptime: ${vpsUptime}
📍 Location  : CN-GZ-XenoviaZone1
━━━━━━━━━━━━━━━━━━━`;

      await sock.sendMessage(from, { text: info }, { quoted: msg });
      break;
    }

    case 'cekin':
      await sock.sendMessage(from, { text: checkIn(sender) }, { quoted: msg });
      break;

    case 'streak':
      await sock.sendMessage(from, { text: getStreak(sender) }, { quoted: msg });
      break;

    case 'play': {
      if (!args.length) {
        return sock.sendMessage(from, { text: 'Masukkan judul atau link YouTube!' }, { quoted: msg });
      }

      try {
        const query = args.join(" ");
        const result = await downloadMp3(query, Date.now().toString());

        await sock.sendMessage(from, {
          audio: result.buffer,
          mimetype: result.mimetype,
          ptt: true,
          fileName: `${result.title}.opus`,
          contextInfo: {
            externalAdReply: {
              title: result.title,
              body: 'XenoviaCompany',
              thumbnail: await getBufferFromUrl(result.thumbnail),
              mediaType: 2,
              renderLargerThumbnail: true
            }
          }
        }, { quoted: msg });

      } catch (err) {
        await sock.sendMessage(from, { text: 'Gagal mengambil audio.' }, { quoted: msg });
      }
    }
    break;

    case 'mp4': {
      if (!args.length) {
        return sock.sendMessage(from, { text: 'Masukkan judul atau link YouTube!' }, { quoted: msg });
      }

      try {
        const result = await downloadMp4(args.join(' '));
        const thumb = await getBufferFromUrl(result.thumbnail);

        await sock.sendMessage(from, {
          video: result.buffer,
          mimetype: 'video/mp4',
          fileName: `${result.title}.mp4`,
          caption: `${result.title}\nDurasi: ${result.duration}`,
          jpegThumbnail: thumb
        }, { quoted: msg });

      } catch {
        await sock.sendMessage(from, { text: 'Gagal mengambil video.' }, { quoted: msg });
      }
    }
    break;

    case 'tr':
    case 'translate': {
      const text = args.join(' ');
      if (!text) {
        await sock.sendMessage(from, { text: '❌ Contoh: `.tr Hello world`' }, { quoted: msg });
        break;
      }

      try {
        const result = await doTranslate(text, 'id');
        await sock.sendMessage(from, { text: String(result) }, { quoted: msg });
      } catch {
        await sock.sendMessage(from, { text: '⚠️ Gagal translate teks.' }, { quoted: msg });
      }
    }
    break;

    case 'sticker':
    case 's': {
      try {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isQuoted = !!quoted;

        const mediaMsg = isQuoted
          ? { message: quoted, key: { remoteJid: msg.key.remoteJid, id: msg.message.extendedTextMessage.contextInfo.stanzaId, fromMe: false, participant: msg.message.extendedTextMessage.contextInfo.participant } }
          : msg;

        const msgType = isQuoted ? Object.keys(quoted)[0] : Object.keys(msg.message)[0];

        if (!['imageMessage', 'videoMessage'].includes(msgType)) {
          await sock.sendMessage(from, { text: '❌ Kirim atau reply foto/video untuk dijadikan stiker.' }, { quoted: msg });
          break;
        }

        const media = await downloadMediaMessage(mediaMsg, 'buffer', {}, {});
        const sticker = await writeExif(media, { packname, author });

        await sock.sendMessage(from, { sticker: { url: sticker } }, { quoted: msg });

        if (typeof sticker === 'string' && fs.existsSync(sticker)) fs.unlinkSync(sticker);

      } catch {
        await sock.sendMessage(from, { text: '⚠️ Gagal membuat stiker.' }, { quoted: msg });
      }
    }
    break;

    case 'touri':
    case 'tourl': {
      try {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const mediaMsg = quoted
          ? { message: quoted, key: { remoteJid: msg.key.remoteJid, id: msg.message.extendedTextMessage.contextInfo.stanzaId, fromMe: false, participant: msg.message.extendedTextMessage.contextInfo.participant } }
          : msg;

        const msgType = quoted ? Object.keys(quoted)[0] : Object.keys(msg.message)[0];

        if (!['imageMessage', 'videoMessage', 'documentMessage'].includes(msgType)) {
          await sock.sendMessage(from, { text: 'Reply atau kirim media.' }, { quoted: msg });
          break;
        }

        const media = await downloadMediaMessage(mediaMsg, 'buffer', {}, {});
        if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp');

        const extMap = { imageMessage: '.jpg', videoMessage: '.mp4', documentMessage: '.pdf' };
        const ext = extMap[msgType] || '.bin';
        const tmpFile = `./tmp/${Date.now()}${ext}`;

        fs.writeFileSync(tmpFile, media);
        const url = await uploadToCatbox(tmpFile);

        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);

        await sock.sendMessage(from, { text: url || 'Gagal upload.' }, { quoted: msg });

      } catch (e) {
        await sock.sendMessage(from, { text: 'Gagal upload.' }, { quoted: msg });
      }
    }
    break;

    case '.cekon':
    case 'cekon': {
      if (!from.endsWith('@g.us')) {
        await sock.sendMessage(from, { text: '❌ Command ini hanya bisa dipakai di grup.' }, { quoted: msg });
        return;
      }

      let metadata = await sock.groupMetadata(from);
      let onlineList = [];

      for (let p of metadata.participants) {
        let jid = p.id;
        let presence = sock.presences?.[from]?.[jid]?.lastKnownPresence;

        if (presence === 'available') {
          onlineList.push(`🟢 @${jid.split('@')[0]}`);
        }
      }

      let result =
        onlineList.length > 0
          ? `📡 *Member Online Sekarang:*\n\n${onlineList.join('\n')}`
          : '⚪ Tidak ada member online saat ini.';

      await sock.sendMessage(
        from,
        { text: result, mentions: metadata.participants.map((a) => a.id) },
        { quoted: msg }
      );
    }
    break;
  }
}
