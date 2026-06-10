import { mkdir } from "node:fs/promises";
import * as api from "@actual-app/api";
import type { ActualConnection } from "../config.ts";
import type { Logger } from "../logger.ts";

export interface ActualTransaction {
	account: string;
	date: string;
	amount: number;
	payee_name: string;
	notes?: string;
	imported_id: string;
	cleared: boolean;
}

export interface ActualAccount {
	id: string;
	name: string;
	offbudget: boolean | undefined;
	closed: boolean | undefined;
	balance_current: number | null | undefined;
}

export interface ImportResult {
	added: string[];
	updated: string[];
}

export class ActualClient {
	private readonly config: ActualConnection;
	private readonly logger: Logger;
	private connected = false;

	constructor(opts: { config: ActualConnection; logger: Logger }) {
		this.config = opts.config;
		this.logger = opts.logger.child({ module: "actual" });
	}

	async connect(): Promise<void> {
		if (this.connected) return;
		await mkdir(this.config.cacheDir, { recursive: true });
		this.logger.info("actual.init", { serverUrl: this.config.serverUrl });
		await api.init({
			dataDir: this.config.cacheDir,
			serverURL: this.config.serverUrl,
			password: this.config.serverPassword,
		});
		this.logger.info("actual.downloadBudget", { syncId: this.config.syncId });
		await api.downloadBudget(this.config.syncId);
		this.connected = true;
	}

	async getAccounts(): Promise<ActualAccount[]> {
		const accounts = await api.getAccounts();
		return accounts.map((a) => ({
			id: a.id,
			name: a.name,
			offbudget: a.offbudget,
			closed: a.closed,
			balance_current: a.balance_current,
		}));
	}

	async importTransactions(
		accountId: string,
		transactions: ActualTransaction[],
	): Promise<ImportResult> {
		if (transactions.length === 0) return { added: [], updated: [] };
		const res = await api.importTransactions(accountId, transactions);
		if (res.errors && res.errors.length > 0) {
			for (const e of res.errors)
				this.logger.warn("actual.import.error", { message: e.message });
		}
		return { added: res.added ?? [], updated: res.updated ?? [] };
	}

	async shutdown(): Promise<void> {
		try {
			await api.shutdown();
		} catch (err: unknown) {
			this.logger.warn("actual.shutdown.error", {
				err: err instanceof Error ? err.message : String(err),
			});
		} finally {
			this.connected = false;
		}
	}
}
