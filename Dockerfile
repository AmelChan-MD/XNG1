FROM node:24

# Set direktori kerja
WORKDIR /app

# Copy dependency dulu (biar cache Docker kepake)
COPY package*.json ./

# Install dependency production
RUN npm install --production

# Copy seluruh source code
COPY . .

# ENV flag buat kode lu
ENV DOCKER=true
ENV NORTHFLANK=true
ENV NODE_ENV=production

# Jalankan bot
CMD ["node", "main.js"]
