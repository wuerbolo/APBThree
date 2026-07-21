# --- Stage 1: build the client with the full pnpm workspace ---
FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.4.0 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY shared ./shared

RUN pnpm install --frozen-lockfile

COPY client ./client
COPY server ./server

RUN pnpm --filter @bolo/client build

# --- Stage 2: slim runtime, server-only deps + built client assets ---
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# @bolo/shared is a local workspace package (zero external deps), not
# something npm's registry-based install understands -- "workspace:*" is a
# pnpm/Yarn protocol npm rejects outright (EUNSUPPORTEDPROTOCOL) when this
# package.json is installed standalone, outside the pnpm workspace. Strip
# it before `npm install`, then place the real package by hand.
COPY server/package.json ./server/package.json
RUN corepack enable && \
    node -e "const p=require('./server/package.json'); delete p.dependencies['@bolo/shared']; require('fs').writeFileSync('./server/package.json', JSON.stringify(p, null, 2));" && \
    npm install --prefix server --omit=dev
COPY shared ./server/node_modules/@bolo/shared

COPY server ./server
COPY --from=build /app/client/dist ./client/dist

WORKDIR /app/server
EXPOSE 3000
CMD ["node", "server.js"]
