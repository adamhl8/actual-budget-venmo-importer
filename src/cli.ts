import { runAuthCommand } from "#commands/auth.ts"
import { runListAccountsCommand } from "#commands/list-accounts.ts"
import { runStartCommand } from "#commands/start.ts"
import { runSyncOnceCommand } from "#commands/sync-once.ts"
import { loadConfig } from "#config.ts"
import { createLogger } from "#logger.ts"

const USAGE = `Usage: actual-budget-venmo-importer <command> [options]

Commands:
  start                       Long-running cron service (default)
  auth                        Interactive Venmo bootstrap (username, password, OTP)
  sync-once [--dry-run] [--force]
                              Run a single sync immediately. --force ignores the
                              saved cursor and reimports the full backfill window
                              (Actual dedupes on imported_id)
  list-accounts               Print Actual accounts (use to find ACTUAL_VENMO_ACCOUNT_ID)
  --help, -h                  Show this help
`

const main = async (): Promise<number> => {
  const args = process.argv.slice(2)
  const cmd = args[0] ?? "start"

  if (cmd === "--help" || cmd === "-h") {
    console.log(USAGE)
    return 0
  }

  const config = loadConfig()
  const logger = createLogger(config.logLevel)

  switch (cmd) {
    case "start": {
      await runStartCommand(config, logger)
      return 0
    }
    case "auth": {
      await runAuthCommand(config, logger)
      return 0
    }
    case "sync-once": {
      const dryRun = args.includes("--dry-run")
      const force = args.includes("--force")
      return runSyncOnceCommand(config, logger, { dryRun, force })
    }
    case "list-accounts": {
      await runListAccountsCommand(config, logger)
      return 0
    }
    default: {
      console.error(`Unknown command: ${cmd}\n`)
      console.error(USAGE)
      return 1
    }
  }
}

try {
  const code = await main()
  process.exit(code)
} catch (error: unknown) {
  const msg = error instanceof Error ? (error.stack ?? error.message) : String(error)
  console.error(msg)
  process.exit(1)
}
