import ytSearch from 'yt-search';
import ytdlp from 'yt-dlp-exec';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

ffmpeg.setFfmpegPath(ffmpegPath);

const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

const cookiesPath = path.join(__dirname, 'cookies.txt');
const MAX_DURATION_MINUTES = 15; // 🔥 limit durasi

function generateId() {
  return Date.now() + "_" + Math.random().toString(36).slice(2);
}

function isYouTubeUrl(query) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(query);
}

function parseDurationToMinutes(timestamp) {
  if (!timestamp) return 0;
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 2) {
    return parts[0];
  }
  return 0;
}

async function resolveVideo(query) {
  if (!isYouTubeUrl(query)) {
    const search = await ytSearch(query);
    if (!search.videos?.length) throw new Error('Video tidak ditemukan.');
    return search.videos[0];
  }

  const search = await ytSearch(query);
  if (!search.videos?.length) throw new Error('Video tidak ditemukan.');
  return search.videos[0];
}

function buildYtdlpOptions(output) {
  const options = {
    output,
    format: 'bestaudio[ext=m4a]/bestaudio/best',
    userAgent: 'Mozilla/5.0',
    noCheckCertificates: true
  };

  if (fs.existsSync(cookiesPath)) {
    options.cookies = cookiesPath;
  }

  return options;
}

/**
 * 🎵 Download OPUS (WA voice ready)
 */
export async function downloadMp3(query) {
  const id = generateId();
  const tempFile = path.join(tmpDir, `${id}.mp4`);
  const outputFile = path.join(tmpDir, `${id}.opus`);

  try {
    const video = await resolveVideo(query);

    const minutes = parseDurationToMinutes(video.timestamp);
    if (minutes > MAX_DURATION_MINUTES) {
      throw new Error(`Durasi maksimal ${MAX_DURATION_MINUTES} menit.`);
    }

    await ytdlp(video.url, buildYtdlpOptions(tempFile));

    await new Promise((resolve, reject) => {
      ffmpeg(tempFile)
        .audioCodec('libopus')
        .audioBitrate('128')
        .audioFrequency(48000)
        .toFormat('opus')
        .save(outputFile)
        .on('end', resolve)
        .on('error', reject);
    });

    const buffer = fs.readFileSync(outputFile);

    return {
      title: video.title,
      duration: video.timestamp,
      buffer,
      thumbnail: video.thumbnail,
      mimetype: 'audio/ogg; codecs=opus'
    };

  } finally {
    [tempFile, outputFile].forEach(file => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
  }
}

/**
 * 📹 Download MP4 (limited)
 */
export async function downloadMp4(query) {
  const id = generateId();
  const tempFile = path.join(tmpDir, `${id}_raw.mp4`);
  const outputFile = path.join(tmpDir, `${id}.mp4`);

  try {
    const video = await resolveVideo(query);

    const minutes = parseDurationToMinutes(video.timestamp);
    if (minutes > MAX_DURATION_MINUTES) {
      throw new Error(`Durasi maksimal ${MAX_DURATION_MINUTES} menit.`);
    }

    await ytdlp(video.url, {
      output: tempFile,
      format: 'bestvideo[height<=720]+bestaudio/best',
      userAgent: 'Mozilla/5.0',
      noCheckCertificates: true
    });

    await new Promise((resolve, reject) => {
      ffmpeg(tempFile)
        .videoBitrate('800k')
        .audioBitrate('128k')
        .save(outputFile)
        .on('end', resolve)
        .on('error', reject);
    });

    const buffer = fs.readFileSync(outputFile);

    return {
      title: video.title,
      duration: video.timestamp,
      buffer,
      thumbnail: video.thumbnail
    };

  } finally {
    [tempFile, outputFile].forEach(file => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
  }
}
