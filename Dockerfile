FROM node:24

WORKDIR /app

# Copy dependency dulu biar cache kepake
COPY package*.json ./

# Install dependency production
RUN npm install --production

# Copy semua source
COPY . .

# Tanda kalau jalan di Docker (buat matiin auto update kalau perlu)
ENV DOCKER=true

# Jalankan bot
CMD ["node", "main.js"]
