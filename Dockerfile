FROM node:24-slim

WORKDIR /app

# Build deps for better-sqlite3 (used transitively by @actual-app/api).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY tsconfig.json ./
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

ENTRYPOINT ["npx", "tsx", "src/cli.ts"]
CMD ["start"]
