# actual-budget-venmo-importer

Pulls your Venmo transactions on a schedule and imports them into [Actual Budget](https://actualbudget.org/). Designed to run as a Docker container alongside `actualbudget/actual-server` in a Compose stack.

TypeScript, run under Node 20 via [`tsx`](https://github.com/privatenumber/tsx). Uses an unofficial Venmo HTTP API (ported from [Integuru-AI/Venmo-Unofficial-API](https://github.com/Integuru-AI/Venmo-Unofficial-API)) and the official `@actual-app/api` package. Scheduling via [`croner`](https://github.com/Hexagon/croner).

> [!IMPORTANT]
> This image tracks the `nightly` release of `@actual-app/api`, so your Actual server should run the `actualbudget/actual-server` nightly image. Running it against a stable server can migrate your budget file forward and break older clients.

## Setup

### 1. Find your Actual Sync ID

In the Actual UI: **Settings → Show advanced settings → Sync ID**. It's a UUID.

### 2. Configure environment

Copy `.env.example` to `.env` and fill in:

```
ACTUAL_SERVER_URL=http://actualbudget:5006
ACTUAL_SERVER_PASSWORD=<your actual server password>
ACTUAL_SYNC_ID=<UUID from step 1>
# ACTUAL_VENMO_ACCOUNT_ID is filled in after step 4
```

### 3. Build the image

```sh
docker compose build actual-budget-venmo-importer
```

### 4. Authenticate with Venmo (one-time)

```sh
docker compose run --rm actual-budget-venmo-importer auth
```

You'll be prompted for username, password, and (if Venmo challenges you) a 6-digit SMS code. The resulting access token and a persistent `device-id` are written to `./venmo-data/session.json`. The `device-id` marks this "device" as trusted so subsequent runs don't re-trigger 2FA.

You only need to re-run `auth` if the token is revoked (e.g. you log out everywhere from the Venmo app).

### 5. Find your Venmo account ID in Actual

```sh
docker compose run --rm actual-budget-venmo-importer list-accounts
```

Copy the `id` of your Venmo account into `ACTUAL_VENMO_ACCOUNT_ID` in `.env`.

### 6. Dry run to verify

```sh
docker compose run --rm actual-budget-venmo-importer sync-once --dry-run
```

Prints what would be imported as a table. No writes.

### 7. Real one-shot import

```sh
docker compose run --rm actual-budget-venmo-importer sync-once
```

Verify the imported transactions in the Actual UI.

### 8. Start the scheduled service

```sh
docker compose up -d actual-budget-venmo-importer
docker compose logs -f actual-budget-venmo-importer
```

## Commands

| Command | What it does |
|---|---|
| `start` (default) | Long-running cron service. |
| `auth` | Interactive Venmo bootstrap. |
| `sync-once` | One-shot sync. Exit code 0 on success, 2 if token rejected. |
| `sync-once --dry-run` | Fetch + map + print as a table; no writes. |
| `list-accounts` | Print Actual accounts (id, name, status). |

Same image, different first argument. You can `docker exec` into a running container or use `docker compose run --rm` to spin up a one-off.

## Environment variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `ACTUAL_SERVER_URL` | yes | — | e.g. `http://actualbudget:5006` |
| `ACTUAL_SERVER_PASSWORD` | yes | — | |
| `ACTUAL_SYNC_ID` | yes | — | From Actual UI → Settings → Show advanced settings → Sync ID. |
| `ACTUAL_VENMO_ACCOUNT_ID` | yes (for sync) | — | UUID from `list-accounts` output. |
| `VENMO_DEVICE_ID` | no | (generated) | Pre-trusted device-id from a browser session — bypasses OAuth2 fingerprinting if first-time `auth` returns "OAuth2 Exception". |
| `SYNC_CRON` | no | `0 4 * * *` | 5-field, UTC. |
| `INITIAL_BACKFILL_DAYS` | no | `30` | First-run window only; ignored once state is established. |
| `IMPORT_PENDING` | no | `true` | Set `false` to skip pending stories. |
| `SYNC_ON_BOOT` | no | `false` | Run a sync immediately on `start`. |
| `DATA_DIR` | no | `/data` | Holds `session.json` + `state.json`. |
| `ACTUAL_CACHE_DIR` | no | `/app/actual-cache` | Actual SDK's local cache. |
| `LOG_LEVEL` | no | `info` | `debug`/`info`/`warn`/`error`. |
| `TZ` | no | `UTC` | Affects log timestamps; cron is always UTC. |

## How it works

1. `start` validates a session exists, registers a `Bun.cron` job, and waits.
2. On each tick: load session → fetch Venmo stories newest-first, paginating via `before_id`, stopping when we hit `lastSeenStoryId` (incremental) or `INITIAL_BACKFILL_DAYS` cutoff (first run).
3. Map each story to an Actual transaction:
   - `imported_id` = Venmo `story.id` — Actual dedups via this field, so re-imports update in place.
   - `amount` (cents, signed): negative when I'm the actor (sender), positive when I'm the target (recipient). Refunds invert this.
   - `payee_name` = the other party's `display_name` (with fallbacks to first+last, then username).
   - `date` = `date_completed` if present, else `date_created`, truncated to UTC `YYYY-MM-DD`.
   - `cleared` = `true` if `status === "settled"`.
4. Submit the batch to `importTransactions`. On success, persist `lastSeenStoryId`.

Pending transactions are imported with `cleared: false`. On a later run they re-appear in the lookback window; Actual reconciles via `imported_id` and updates the cleared flag in place.

## Known limitations

- **Cancelled pending transactions** linger in Actual as uncleared. Venmo doesn't return cancelled stories, so the service can't detect them.
- **Dates are UTC.** A 9 PM PT payment shows under the next day's date in Actual. A `USER_TZ` env var is a likely future addition.
- **Unofficial Venmo API.** The HTTP endpoints are reverse-engineered. Expect occasional breakage when Venmo changes things — the failure point is isolated to `src/venmo/`.
- **Originally planned for Bun**, but `@actual-app/api`'s native `better-sqlite3` dependency doesn't load under Bun. Switched to `node:20-slim` + `tsx`. Bun is still fine for local typecheck (`bun run typecheck`) or `bun install` if preferred.
- **TLS fingerprinting.** Vanilla `fetch` works today. If requests start returning 403s with empty bodies, swap in the [`impers`](https://github.com/lexiforest/impers) library inside `src/venmo/client.ts`.

## Troubleshooting

**`Venmo token rejected. Run ... auth to re-authenticate.`**
Your access token was revoked. Re-run the `auth` command.

**`Venmo login failed: 403 ... "OAuth2 Exception" (code 240)`**
Venmo's auth endpoint is blocking the request — usually because the device-id isn't recognized as trusted. Workaround: get a trusted device-id from a browser session.

1. Open https://venmo.com in your browser.
2. Open DevTools → Application → Cookies (or use the Network tab during login).
3. Log in normally. Find the cookie named `v_id` (or check the response from `https://account.venmo.com/api/auth` for `deviceId`).
4. Copy its value and set it as `VENMO_DEVICE_ID` in your environment, then re-run `auth`.

This device-id is already trusted by Venmo, so OAuth2 won't reject it. Once auth succeeds, the device-id is persisted in `session.json` and you can unset the env var.

**`Missing required environment variable: ACTUAL_VENMO_ACCOUNT_ID`**
Run `list-accounts` to find the UUID and set the env var.

**Build fails on `better-sqlite3`**
The Dockerfile uses `node:20-slim` with the required `python3 make g++` build deps. If you swapped to another base image, make sure those build tools are available, or use a prebuilt node-gyp binary.

**Want to re-import everything**
Stop the service, delete `./venmo-data/state.json`, set `INITIAL_BACKFILL_DAYS` to however many days back you want (e.g. `3650` for ten years), and run `sync-once`. Actual's `imported_id` dedup will absorb the overlap with what's already there.

## License

For personal use. The Venmo HTTP endpoints used here are unofficial; you assume the risk under Venmo's ToS.
