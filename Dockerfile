FROM node:24

WORKDIR /app

# Aktifkan corepack (Node 24 support)
RUN corepack enable

COPY package.json yarn.lock ./

RUN yarn install --production --network-timeout 600000

COPY . .

ENV DOCKER=true
ENV NORTHFLANK=true
ENV NODE_ENV=production

CMD ["node", "main.js"]
