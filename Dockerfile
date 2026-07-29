FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        chromium \
        fonts-liberation \
        fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    CHROME_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/.wwebjs_auth /app/.data \
    && chown -R node:node /app

USER node

EXPOSE 3000

VOLUME ["/app/.wwebjs_auth", "/app/.data"]

CMD ["node", "src/server.js"]
