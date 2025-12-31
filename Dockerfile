FROM node:24

WORKDIR /app

COPY package*.json ./
RUN npm install 

COPY . .

# Supaya process dianggap "aktif"
CMD ["node", "main.js"]
