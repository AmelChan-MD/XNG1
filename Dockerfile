FROM node:20

WORKDIR /app

RUN apt-get update && apt-get install -y \
  ffmpeg \
  curl \
  python3 \
  python-is-python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --omit=dev --legacy-peer-deps

COPY . .

CMD ["node", "main.js"]
