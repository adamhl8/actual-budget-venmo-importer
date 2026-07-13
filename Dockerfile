FROM node:24-slim AS deps

WORKDIR /app

COPY --from=oven/bun:latest /usr/local/bin/bun /usr/local/bin/bun

# node-gyp fallback, used only if no prebuilt better-sqlite3 binary matches this platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock bunfig.toml ./

# `prepare` runs `just prepare`, which installs git hooks and syncs configs off devDependencies:
# dev-machine setup that can't run here (--production omits those bins, and .git is dockerignored).
# Drop it rather than passing --ignore-scripts, which would also skip better-sqlite3's install
# script and leave better_sqlite3.node missing. The runtime stage copies the pristine package.json.
RUN npm pkg delete scripts.prepare

RUN bun install --production

FROM node:24-slim AS runtime

LABEL org.opencontainers.image.source=https://github.com/adamhl8/actual-budget-venmo-importer

WORKDIR /app
ENV NODE_ENV="production"

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# node:24-slim already ships a `node` user at 1000:1000; the ARGs let you remap it to a
# different host UID/GID (--build-arg PUID=... PGID=...) so bind mounts stay writable.
ARG PUID=1000
ARG PGID=1000
RUN groupmod -o -g "${PGID}" node \
  && usermod -o -u "${PUID}" -g "${PGID}" node \
  && mkdir -p /data /app/actual-cache \
  && chown -R node:node /app /data

USER node

# Node strips TypeScript types natively, so there's no build step.
ENTRYPOINT ["node", "src/cli.ts"]
CMD ["start"]
