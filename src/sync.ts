import type { ActualClient, ActualTransaction } from "#actual/client.ts"
import { storyToTransaction } from "#actual/mapper.ts"
import type { Config } from "#config.ts"
import type { Logger } from "#logger.ts"
import { defaultState } from "#state.ts"
import type { State } from "#state.ts"
import type { VenmoClient } from "#venmo/client.ts"
import type { VenmoStory } from "#venmo/types.ts"

const MAX_PAGES = 100
const PAGE_SIZE = 50

export interface SyncResult {
  fetched: number
  added: number
  updated: number
  durationMs: number
  newLastSeenStoryId: string | null
}

export interface SyncOptions {
  dryRun?: boolean
  // Ignore the saved cursor and reimport the full backfill window. Actual
  // dedupes on imported_id, so existing transactions are matched, not duplicated.
  force?: boolean
}

interface CollectResult {
  stories: VenmoStory[]
  pages: number
  newestStoryId: string | null
  totalReturned: number
  skippedPending: number
  skippedOlderThanCutoff: number
  skippedNonPayment: number
  statusCounts: Record<string, number>
  typeCounts: Record<string, number>
}

type StoryDecision = "collect" | "skip-non-payment" | "skip-pending"

const classifyStory = (story: VenmoStory, isLastSeen: boolean, importPending: boolean): StoryDecision => {
  // Only process peer payments + refunds. Transfers/top-ups/atm/etc. have no counterparty.
  if (story.type !== "payment" && story.type !== "refund" && !isLastSeen) return "skip-non-payment"
  // Skip pending stories if disabled. Always include settled (and lastSeen itself).
  if (!importPending && story.payment?.status !== "settled" && !isLastSeen) return "skip-pending"
  return "collect"
}

const tallyStats = (
  stories: VenmoStory[],
  statusCounts: Record<string, number>,
  typeCounts: Record<string, number>,
): void => {
  for (const s of stories) {
    const status = s.payment?.status ?? "(none)"
    statusCounts[status] = (statusCounts[status] ?? 0) + 1
    typeCounts[s.type] = (typeCounts[s.type] ?? 0) + 1
  }
}

const collectStories = async (opts: {
  venmo: VenmoClient
  lastSeenStoryId: string | null
  cutoff: Date | null
  importPending: boolean
  log: Logger
}): Promise<CollectResult> => {
  const { venmo, lastSeenStoryId, cutoff, importPending, log } = opts
  const stories: VenmoStory[] = []
  const seenIds = new Set<string>()
  let cursor: string | undefined
  let pages = 0
  let newestStoryId: string | null = null
  let totalReturned = 0
  let skippedPending = 0
  let skippedOlderThanCutoff = 0
  let skippedNonPayment = 0
  const statusCounts: Record<string, number> = {}
  const typeCounts: Record<string, number> = {}

  while (pages < MAX_PAGES) {
    const page = await venmo.getStories({
      beforeId: cursor ?? "",
      limit: PAGE_SIZE,
    })
    log.debug("venmo.page", {
      index: pages,
      returned: page.data.length,
      cursor,
    })
    if (page.data.length === 0) break
    totalReturned += page.data.length

    tallyStats(page.data, statusCounts, typeCounts)

    if (pages === 0 && page.data[0]) newestStoryId = page.data[0].id

    let hitLastSeen = false
    let reachedCutoff = false
    for (const story of page.data) {
      if (cutoff !== null && new Date(story.date_created).getTime() < cutoff.getTime()) {
        skippedOlderThanCutoff += page.data.length - page.data.indexOf(story)
        reachedCutoff = true
        break
      }

      const isLastSeen = lastSeenStoryId !== null && story.id === lastSeenStoryId

      const decision = classifyStory(story, isLastSeen, importPending)
      if (decision === "skip-non-payment") {
        skippedNonPayment++
        continue
      }
      if (decision === "skip-pending") {
        skippedPending++
        continue
      }

      if (!seenIds.has(story.id)) {
        stories.push(story)
        seenIds.add(story.id)
      }

      if (isLastSeen) {
        hitLastSeen = true
        break
      }
    }

    if (reachedCutoff || hitLastSeen) break
    cursor = page.pagination?.older_id
    if (!cursor) break
    pages++
  }

  return {
    stories,
    pages: pages + 1,
    newestStoryId,
    totalReturned,
    skippedPending,
    skippedOlderThanCutoff,
    skippedNonPayment,
    statusCounts,
    typeCounts,
  }
}

const truncate = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1)}…`)

const printDryRun = (txns: ActualTransaction[]): void => {
  if (txns.length === 0) {
    console.log("(no transactions to import)")
    return
  }
  console.log("\nDry run — would import the following transactions:")
  console.log("-".repeat(110))
  console.log(["date".padEnd(12), "amount".padStart(10), "cleared".padEnd(8), "payee".padEnd(30), "notes"].join("  "))
  console.log("-".repeat(110))
  for (const t of txns) {
    const amount = (t.amount / 100).toFixed(2).padStart(10)
    const cleared = t.cleared ? "yes" : "no"
    console.log(
      [
        t.date.padEnd(12),
        amount,
        cleared.padEnd(8),
        truncate(t.payee_name, 30).padEnd(30),
        truncate(t.notes ?? "", 50),
      ].join("  "),
    )
  }
  console.log("-".repeat(110))
}

export const runSync = async (deps: {
  venmo: VenmoClient
  actual: ActualClient
  config: Config
  state: State
  meId: string
  venmoAccountId: string
  logger: Logger
  options?: SyncOptions
}): Promise<{ result: SyncResult; nextState: State }> => {
  const { venmo, actual, config, state, meId, venmoAccountId, logger } = deps
  const dryRun = deps.options?.dryRun === true
  const force = deps.options?.force === true
  const startedAt = Date.now()
  const log = logger.child({ phase: "sync" })

  const lastSeenStoryId = force ? null : state.lastSeenStoryId
  const cutoff = lastSeenStoryId ? null : new Date(Date.now() - config.initialBackfillDays * 86_400_000)

  log.info("sync.start", {
    incremental: lastSeenStoryId !== null,
    lastSeenStoryId,
    cutoff: cutoff?.toISOString(),
    dryRun,
    force,
  })

  const collected = await collectStories({
    venmo,
    lastSeenStoryId,
    cutoff,
    importPending: config.importPending,
    log,
  })
  const newestStoryId = collected.newestStoryId ?? state.lastSeenStoryId

  log.info("venmo.collected", {
    collected: collected.stories.length,
    totalReturned: collected.totalReturned,
    skippedNonPayment: collected.skippedNonPayment,
    skippedPending: collected.skippedPending,
    skippedOlderThanCutoff: collected.skippedOlderThanCutoff,
    pages: collected.pages,
    statusCounts: collected.statusCounts,
    typeCounts: collected.typeCounts,
  })

  // Reverse to oldest-first so a partial crash doesn't advance the cursor over unimported items.
  collected.stories.reverse()

  const transactions: ActualTransaction[] = []
  for (const story of collected.stories) {
    try {
      transactions.push(storyToTransaction(story, meId, venmoAccountId))
    } catch (error: unknown) {
      log.warn("mapper.skip", {
        storyId: story.id,
        err: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (dryRun) {
    log.info("sync.dry_run", { mapped: transactions.length })
    printDryRun(transactions)
    return {
      result: {
        fetched: collected.stories.length,
        added: 0,
        updated: 0,
        durationMs: Date.now() - startedAt,
        newLastSeenStoryId: newestStoryId,
      },
      nextState: state,
    }
  }

  log.info("actual.import.sending", { count: transactions.length })
  const importResult = await actual.importTransactions(venmoAccountId, transactions)

  const nextState: State = {
    ...defaultState(),
    lastSeenStoryId: newestStoryId ?? state.lastSeenStoryId,
    lastRunAt: new Date().toISOString(),
  }

  return {
    result: {
      fetched: collected.stories.length,
      added: importResult.added.length,
      updated: importResult.updated.length,
      durationMs: Date.now() - startedAt,
      newLastSeenStoryId: nextState.lastSeenStoryId,
    },
    nextState,
  }
}
