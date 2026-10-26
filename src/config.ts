import { parseEnv } from "@adamhl8/configs/env"

export interface Config {
  actual: {
    serverUrl: string | undefined
    serverPassword: string | undefined
    syncId: string | undefined
    venmoAccountId: string | undefined
    cacheDir: string
  }
  dataDir: string
  syncCron: string
  initialBackfillDays: number
  logLevel: "debug" | "info" | "warn" | "error"
  importPending: boolean
  syncOnBoot: boolean
  venmoDeviceId: string | undefined
}

export interface ActualConnection {
  serverUrl: string
  serverPassword: string
  syncId: string
  cacheDir: string
}

export interface ActualSyncConfig extends ActualConnection {
  venmoAccountId: string
}

export const loadConfig = (): Config => {
  const c = parseEnv({
    "ACTUAL_SERVER_URL?": "string.url",
    "ACTUAL_SERVER_PASSWORD?": "string > 0",
    "ACTUAL_SYNC_ID?": "string > 0",
    "ACTUAL_VENMO_ACCOUNT_ID?": "string > 0",
    "VENMO_DEVICE_ID?": "string > 0",
    SYNC_CRON: "string > 0 = '0 4 * * *'",
    INITIAL_BACKFILL_DAYS: "number.integer >= 0 = 30",
    IMPORT_PENDING: "boolean = true",
    SYNC_ON_BOOT: "boolean = false",
    DATA_DIR: "string > 0 = '/data'",
    ACTUAL_CACHE_DIR: "string > 0 = '/app/actual-cache'",
    LOG_LEVEL: "'debug' | 'info' | 'warn' | 'error' = 'info'",
  })
  return {
    actual: {
      serverUrl: c.ACTUAL_SERVER_URL,
      serverPassword: c.ACTUAL_SERVER_PASSWORD,
      syncId: c.ACTUAL_SYNC_ID,
      venmoAccountId: c.ACTUAL_VENMO_ACCOUNT_ID,
      cacheDir: c.ACTUAL_CACHE_DIR,
    },
    dataDir: c.DATA_DIR,
    syncCron: c.SYNC_CRON,
    initialBackfillDays: c.INITIAL_BACKFILL_DAYS,
    logLevel: c.LOG_LEVEL,
    importPending: c.IMPORT_PENDING,
    syncOnBoot: c.SYNC_ON_BOOT,
    venmoDeviceId: c.VENMO_DEVICE_ID,
  }
}

export const requireActualConnection = (c: Config): ActualConnection => {
  const missing: string[] = []
  if (!c.actual.serverUrl) missing.push("ACTUAL_SERVER_URL")
  if (!c.actual.serverPassword) missing.push("ACTUAL_SERVER_PASSWORD")
  if (!c.actual.syncId) missing.push("ACTUAL_SYNC_ID")
  if (missing.length > 0) throw new Error(`Missing required environment variables: ${missing.join(", ")}`)

  return {
    serverUrl: c.actual.serverUrl ?? "",
    serverPassword: c.actual.serverPassword ?? "",
    syncId: c.actual.syncId ?? "",
    cacheDir: c.actual.cacheDir,
  }
}

export const requireActualSync = (c: Config): ActualSyncConfig => {
  const base = requireActualConnection(c)
  if (!c.actual.venmoAccountId)
    throw new Error("Missing required environment variable: ACTUAL_VENMO_ACCOUNT_ID (run `list-accounts` to find it)")

  return { ...base, venmoAccountId: c.actual.venmoAccountId }
}
