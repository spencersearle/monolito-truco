# Signalling only — this image never sees a card.
FROM node:22-alpine

WORKDIR /app

# Dependencies first so a code change doesn't reinstall them.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./

# Don't run as root.
USER node

ENV NODE_ENV=production
ENV PORT=9000
EXPOSE 9000

CMD ["node", "server.mjs"]
