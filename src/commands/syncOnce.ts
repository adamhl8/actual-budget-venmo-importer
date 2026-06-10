import { ActualClient } from "../actual/client.ts";
import { type Config, requireActualSync } from "../config.ts";
import type { Logger } from "../logger.ts";
import { readState, writeState } from "../state.ts";
import { runSync } from "../sync.ts";
import { VenmoClient } from "../venmo/client.ts";
import { loadSession } from "../venmo/session.ts";
import { VenmoAuthError } from "../venmo/types.ts";

export async function runSyncOnceCommand(
	config: Config,
	logger: Logger,
	options: { dryRun: boolean },
): Promise<number> {
	const sync = requireActualSync(config);
	const session = await loadSession(config.dataDir);
	const venmo = new VenmoClient({ session, logger });
	const actual = new ActualClient({ config: sync, logger });

	try {
		if (!options.dryRun) {
			await actual.connect();
		}
		const state = await readState(config.dataDir);
		const { result, nextState } = await runSync({
			venmo,
			actual,
			config,
			state,
			meId: session.userId,
			venmoAccountId: sync.venmoAccountId,
			logger,
			options: { dryRun: options.dryRun },
		});
		if (
			!options.dryRun &&
			nextState.lastSeenStoryId !== state.lastSeenStoryId
		) {
			await writeState(config.dataDir, nextState);
		}
		logger.info("sync.done", {
			fetched: result.fetched,
			added: result.added,
			updated: result.updated,
			durationMs: result.durationMs,
			newLastSeenStoryId: result.newLastSeenStoryId,
			dryRun: options.dryRun,
		});
		return 0;
	} catch (err: unknown) {
		if (err instanceof VenmoAuthError) {
			logger.error("venmo.auth_failed", {
				msg: "Venmo token rejected. Run `bun run auth` (or `docker compose run --rm actual-budget-venmo-importer auth`) to re-authenticate.",
			});
			return 2;
		}
		throw err;
	} finally {
		if (!options.dryRun) await actual.shutdown();
	}
}
