FROM oven/bun:latest
LABEL org.opencontainers.image.source=https://github.com/adamhl8/actual-budget-venmo-importer
WORKDIR /app
ENV NODE_ENV="production"

COPY package.json bun.lock bunfig.toml ./

RUN bun install --ignore-scripts --production

COPY src ./src

# oven/bun already ships a `bun` user at 1000:1000. The ARGs let you remap it to a different host
# UID/GID (--build-arg PUID=... PGID=...) so bind mounts stay writable.
ARG PUID=1000
ARG PGID=1000
RUN groupmod -o -g "${PGID}" bun \
  && usermod -o -u "${PUID}" -g "${PGID}" bun \
  && mkdir -p /data /app/actual-cache \
  && chown -R bun:bun /app /data

USER bun

ENTRYPOINT ["bun", "./src/cli.ts"]
CMD ["start"]
