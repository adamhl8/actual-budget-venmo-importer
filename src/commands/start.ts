import { randomUUID } from "node:crypto"

import { Cron } from "croner"

import { ActualClient } from "#actual/client.ts"
import { requireActualSync } from "#config.ts"
import type { Config } from "#config.ts"
import type { Logger } from "#logger.ts"
import { readState, writeState } from "#state.ts"
import { runSync } from "#sync.ts"
import { VenmoClient } from "#venmo/client.ts"
import { loadSession } from "#venmo/session.ts"
import { VenmoApiError, VenmoAuthError } from "#venmo/types.ts"

export const runStartCommand = async (config: Config, logger: Logger): Promise<void> => {
  const sync = requireActualSync(config)

  // Validate session exists up front so we fail fast with an actionable message.
  await loadSession(config.dataDir)

  logger.info("start.scheduling", { cron: config.syncCron })

  let running = false
  let shuttingDown = false
  const runOnce = async (trigger: string): Promise<void> => {
    if (running) {
      logger.warn("sync.skipped_overlap", { trigger })
      return
    }
    running = true
    const runLogger = logger.child({ runId: randomUUID(), trigger })
    try {
      const session = await loadSession(config.dataDir)
      const venmo = new VenmoClient({ session, logger: runLogger })
      const actual = new ActualClient({ config: sync, logger: runLogger })
      try {
        await actual.connect()
        const state = await readState(config.dataDir)
        const { result, nextState } = await runSync({
          venmo,
          actual,
          config,
          state,
          meId: session.userId,
          venmoAccountId: sync.venmoAccountId,
          logger: runLogger,
        })
        if (nextState.lastSeenStoryId !== state.lastSeenStoryId) await writeState(config.dataDir, nextState)

        runLogger.info("sync.done", {
          fetched: result.fetched,
          added: result.added,
          updated: result.updated,
          durationMs: result.durationMs,
        })
      } finally {
        await actual.shutdown()
      }
    } catch (error: unknown) {
      if (error instanceof VenmoAuthError) {
        runLogger.error("venmo.auth_failed", {
          msg: "Venmo token rejected. Run `docker compose run --rm actual-budget-venmo-importer auth` to re-authenticate. Will retry on next cron tick.",
        })
      } else if (error instanceof VenmoApiError) {
        runLogger.error("venmo.api_error", {
          status: error.status,
          msg: error.message,
        })
      } else {
        runLogger.error("sync.error", {
          err: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        })
      }
    } finally {
      running = false
    }
  }

  const job = new Cron(config.syncCron, { protect: true, timezone: "UTC" }, async () => {
    if (shuttingDown) return
    await runOnce("cron")
  })
  logger.info("start.cron_next", {
    next: job.nextRun()?.toISOString(),
  })

  if (config.syncOnBoot) void runOnce("boot")

  // Bridge process signals into a promise so the CLI stays alive until shutdown.
  // oxlint-disable-next-line promise/avoid-new
  await new Promise<void>((resolve) => {
    const onSignal = (sig: string): void => {
      logger.info("start.signal", { sig })
      shuttingDown = true
      job.stop()
      const deadline = Date.now() + 60_000
      const tick = (): void => {
        if (!running || Date.now() > deadline) resolve()
        else setTimeout(tick, 250)
      }
      tick()
    }
    process.on("SIGINT", () => {
      onSignal("SIGINT")
    })
    process.on("SIGTERM", () => {
      onSignal("SIGTERM")
    })
  })
}
