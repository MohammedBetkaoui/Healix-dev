# syntax=docker/dockerfile:1

# The OHIF Viewer (https://github.com/OHIF/Viewers), built from its source at
# an exact commit and served under /viewer/ by nginx. Build context: viewer/.
#
# Why not the official ohif/app image: its base path (PUBLIC_URL) is fixed
# when it is built ("baked into the build and cannot be changed without
# rebuilding the image", OHIF's Docker documentation), and the application
# must live under /viewer/, next to the HealixDz pages. This file follows
# OHIF's own Dockerfile (same Node, same pnpm, same nginx base), with:
#  - the source fetched at a commit, not a tag that can be moved;
#  - a frozen lockfile (pnpm install --frozen-lockfile);
#  - our configuration built in (viewer/app-config.js), and mounted over it
#    when the container runs;
#  - the inline scripts of index.html moved to files (the page's CSP forbids
#    inline scripts), and the service worker, which loads Workbox from
#    storage.googleapis.com, replaced by a stub that registers nothing.
# The build needs several gigabytes of memory (OHIF's own build is the same).

ARG NODE_VERSION=24.15.0
ARG NGINX_VERSION=1.30.6

# 1. Build.
FROM node:${NODE_VERSION}-slim AS build
# OHIF v3.13.13, and the commit that tag points to (checked below).
ARG OHIF_VERSION=v3.13.13
ARG OHIF_COMMIT=1fa151f5133934c953a2ab4c0056ca91f929c32f
# The packageManager of OHIF's package.json at that commit.
ARG PNPM_VERSION=12.8.1
ARG PUBLIC_URL=/viewer/

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential ca-certificates git python3 \
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@${PNPM_VERSION}

WORKDIR /usr/src/ohif
RUN git init -q . \
 && git remote add origin https://github.com/OHIF/Viewers.git \
 && git fetch -q --depth 1 origin ${OHIF_COMMIT} \
 && git checkout -q FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "${OHIF_COMMIT}" \
 && grep -q "\"version\": \"${OHIF_VERSION#v}\"" platform/app/package.json

# Nothing here runs the browser tests: no Cypress binary, no git hooks.
ENV CYPRESS_INSTALL_BINARY=0 \
    HUSKY=0
RUN pnpm install --frozen-lockfile

# Our configuration is the one the build copies to app-config.js.
COPY app-config.js platform/app/public/config/healixdz.js
ENV QUICK_BUILD=true \
    APP_CONFIG=config/healixdz.js \
    PUBLIC_URL=${PUBLIC_URL}
RUN pnpm run build

COPY externalize-inline-scripts.mjs init-service-worker.js /tmp/viewer/
RUN node /tmp/viewer/externalize-inline-scripts.mjs platform/app/dist ${PUBLIC_URL} \
 && cp /tmp/viewer/init-service-worker.js platform/app/dist/init-service-worker.js \
 && rm -f platform/app/dist/sw.js \
 && find platform/app/dist -name '*.map' -delete \
 && ! grep -rIl "storage.googleapis.com" platform/app/dist/index.html platform/app/dist/init-service-worker.js

# 2. Serve. nginx-unprivileged: no root, port 8080.
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine
ARG PUBLIC_URL=/viewer/
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /usr/src/ohif/platform/app/dist /usr/share/nginx/html${PUBLIC_URL}
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/healthz"]
