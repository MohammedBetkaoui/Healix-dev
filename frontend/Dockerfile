# syntax=docker/dockerfile:1

# HealixDz frontend: Next.js standalone server (output: "standalone" in
# next.config.ts). Build context: frontend/.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
# NEXT_PUBLIC_* values are written into the JavaScript at build time, for
# the browser and for the server alike: changing one means rebuilding this
# image. They are public by nature (an URL, a path), never a secret.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api
ARG NEXT_PUBLIC_ADMIN_GATE_PATH=/hzdz-control-gate-2026
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_ADMIN_GATE_PATH=${NEXT_PUBLIC_ADMIN_GATE_PATH} \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx next build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# The standalone server does not copy the static files and public/ itself.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# "node" (uid 1000) of the base image, by number for runAsNonRoot checks.
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then((r) => process.exit(r.status < 500 ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
