import type { Logger } from "../logger.ts";
import { API_BASE, APP_HEADERS } from "./constants.ts";
import type { VenmoSession } from "./session.ts";
import {
	VenmoApiError,
	VenmoAuthError,
	type VenmoStoriesResponse,
	type VenmoUser,
} from "./types.ts";

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

export class VenmoClient {
	private readonly session: VenmoSession;
	private readonly logger: Logger;

	constructor(opts: { session: VenmoSession; logger: Logger }) {
		this.session = opts.session;
		this.logger = opts.logger.child({ module: "venmo" });
	}

	async getMe(): Promise<VenmoUser> {
		const data = (await this.request("GET", "/v1/account")) as {
			data?: { user?: VenmoUser };
		};
		const user = data.data?.user;
		if (!user?.id)
			throw new VenmoApiError("GET /v1/account missing data.user.id", 200);
		return user;
	}

	async getStories(
		opts: { beforeId?: string; limit?: number } = {},
	): Promise<VenmoStoriesResponse> {
		const params = new URLSearchParams();
		params.set("limit", String(opts.limit ?? 50));
		if (opts.beforeId) params.set("before_id", opts.beforeId);
		const path = `/v1/stories/target-or-actor/${encodeURIComponent(this.session.userId)}?${params.toString()}`;
		return (await this.request("GET", path)) as VenmoStoriesResponse;
	}

	private async request(method: string, path: string): Promise<unknown> {
		const url = `${API_BASE}${path}`;
		const headers: Record<string, string> = {
			...APP_HEADERS,
			Authorization: `Bearer ${this.session.accessToken}`,
			"device-id": this.session.deviceId,
		};

		let lastErr: unknown;
		for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
			try {
				const res = await fetch(url, { method, headers });

				if (res.status === 401) {
					const body = await res.text();
					throw new VenmoAuthError(
						`Venmo rejected token (401). Re-run \`auth\` to refresh. Body: ${body.slice(0, 200)}`,
					);
				}

				if (res.status === 429 || res.status === 503 || res.status >= 500) {
					const delay = RETRY_DELAYS_MS[attempt];
					if (delay === undefined) {
						const body = await res.text();
						throw new VenmoApiError(
							`${method} ${path} failed after retries: ${res.status}`,
							res.status,
							body.slice(0, 500),
						);
					}
					this.logger.warn("venmo.retry", {
						method,
						path,
						status: res.status,
						delayMs: delay,
					});
					await sleep(delay);
					continue;
				}

				if (!res.ok) {
					const body = await res.text();
					throw new VenmoApiError(
						`${method} ${path} failed: ${res.status} ${res.statusText}`,
						res.status,
						body.slice(0, 500),
					);
				}

				return await res.json();
			} catch (err: unknown) {
				if (err instanceof VenmoAuthError || err instanceof VenmoApiError)
					throw err;
				lastErr = err;
				const delay = RETRY_DELAYS_MS[attempt];
				if (delay === undefined) break;
				this.logger.warn("venmo.network_retry", {
					method,
					path,
					delayMs: delay,
					err: err instanceof Error ? err.message : String(err),
				});
				await sleep(delay);
			}
		}
		throw lastErr ?? new Error(`${method} ${path} failed without throwing`);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
