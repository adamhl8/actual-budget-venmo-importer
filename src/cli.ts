import { runAuthCommand } from "./commands/auth.ts";
import { runListAccountsCommand } from "./commands/listAccounts.ts";
import { runStartCommand } from "./commands/start.ts";
import { runSyncOnceCommand } from "./commands/syncOnce.ts";
import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";

const USAGE = `Usage: actual-budget-venmo-importer <command> [options]

Commands:
  start                       Long-running cron service (default)
  auth                        Interactive Venmo bootstrap (username, password, OTP)
  sync-once [--dry-run]       Run a single sync immediately
  list-accounts               Print Actual accounts (use to find ACTUAL_VENMO_ACCOUNT_ID)
  --help, -h                  Show this help
`;

async function main(): Promise<number> {
	const args = process.argv.slice(2);
	const cmd = args[0] ?? "start";

	if (cmd === "--help" || cmd === "-h") {
		console.log(USAGE);
		return 0;
	}

	const config = loadConfig();
	const logger = createLogger(config.logLevel);

	switch (cmd) {
		case "start": {
			await runStartCommand(config, logger);
			return 0;
		}
		case "auth": {
			await runAuthCommand(config, logger);
			return 0;
		}
		case "sync-once": {
			const dryRun = args.includes("--dry-run");
			return await runSyncOnceCommand(config, logger, { dryRun });
		}
		case "list-accounts": {
			await runListAccountsCommand(config, logger);
			return 0;
		}
		default: {
			console.error(`Unknown command: ${cmd}\n`);
			console.error(USAGE);
			return 1;
		}
	}
}

main()
	.then((code) => process.exit(code))
	.catch((err: unknown) => {
		const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
		console.error(msg);
		process.exit(1);
	});
