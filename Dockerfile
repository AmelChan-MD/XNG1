FROM node:20

WORKDIR /app

# Install ffmpeg (biar aman kalau yt-dlp butuh system ffmpeg)
RUN apt-get update && apt-get install -y \
  ffmpeg \
  curl \
  python3 \
  && rm -rf /var/lib/apt/lists/*

# Copy package.json dulu biar caching optimal
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy semua file project
COPY . .

# Jalankan bot
CMD ["node", "main.js"]
