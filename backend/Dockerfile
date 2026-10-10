# syntax=docker/dockerfile:1

# HealixDz backend: NestJS API, Prisma migrations, Chromium for the PDF
# reports. Build context: backend/. No secret is read at build time: every
# setting comes from the environment when the container starts.

ARG NODE_VERSION=22

# 1. Build: every dependency, then the TypeScript build (src/ and the seed,
#    prisma/seed.ts -> dist/prisma/seed.js).
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# 2. Runtime packages: the production dependencies only. The Prisma CLI,
#    needed for "prisma migrate deploy", stays: it is a peer dependency of
#    @prisma/client, so the lockfile does not mark it as dev. The test makes
#    the build fail if that ever changes.
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
 && test -x node_modules/.bin/prisma \
 && npm cache clean --force
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

# 3. Runtime image.
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    UPLOAD_ROOT=/app/uploads \
    AI_EVALUATION_REPORT_PATH=/app/evaluation/brain-latest.json \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
# Chromium at the exact version the playwright package expects, with its
# system libraries (installed as root, readable by the "node" user).
RUN npx playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*
COPY prisma ./prisma
COPY prisma.config.ts ./
# Fonts embedded in the PDF reports (read from <cwd>/assets/fonts/inter).
COPY assets ./assets
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./
# A Windows checkout may hold the script with CRLF line endings.
RUN sed -i 's/\r$//' docker-entrypoint.sh \
 && chmod 0755 docker-entrypoint.sh \
 && mkdir -p /app/uploads /app/evaluation \
 && chown node:node /app/uploads
# "node" (uid 1000) of the base image, by number for runAsNonRoot checks.
# /app/uploads (documents, masks, reports) is a named volume in compose.
USER 1000:1000
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Pending migrations first, then the given command (the API by default).
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
