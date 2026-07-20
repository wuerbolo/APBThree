# --- Stage 1: build the client with the full pnpm workspace ---
FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.4.0 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json

RUN pnpm install --frozen-lockfile

COPY client ./client
COPY server ./server

RUN pnpm --filter @bolo/client build

# --- Stage 2: slim runtime, server-only deps + built client assets ---
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY server/package.json ./server/package.json
RUN corepack enable && npm install --prefix server --omit=dev

COPY server ./server
COPY --from=build /app/client/dist ./client/dist

WORKDIR /app/server
EXPOSE 3000
CMD ["node", "server.js"]
