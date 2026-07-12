import { z } from "zod"

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : /^(?:1|true|yes|on)$/iv.test(v)))

const intFromString = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "number" ? v : Math.trunc(Number(v))))
  .pipe(z.number().int().nonnegative())

const ConfigSchema = z.object({
  ACTUAL_SERVER_URL: z.url().optional(),
  ACTUAL_SERVER_PASSWORD: z.string().min(1).optional(),
  ACTUAL_SYNC_ID: z.string().min(1).optional(),
  ACTUAL_VENMO_ACCOUNT_ID: z.string().min(1).optional(),
  VENMO_DEVICE_ID: z.string().min(1).optional(),
  SYNC_CRON: z.string().min(1).default("0 4 * * *"),
  INITIAL_BACKFILL_DAYS: intFromString.default(30),
  IMPORT_PENDING: boolFromString.default(true),
  SYNC_ON_BOOT: boolFromString.default(false),
  DATA_DIR: z.string().min(1).default("/data"),
  ACTUAL_CACHE_DIR: z.string().min(1).default("/app/actual-cache"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
})

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

export const loadConfig = (
  // oxlint-disable-next-line node/no-process-env
  env: Record<string, string | undefined> = process.env,
): Config => {
  const parsed = ConfigSchema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")
    throw new Error(`Invalid configuration:\n${issues}`)
  }
  const c = parsed.data
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
