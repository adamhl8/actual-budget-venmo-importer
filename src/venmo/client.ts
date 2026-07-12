import { setTimeout as sleep } from "node:timers/promises"

import type { Logger } from "#logger.ts"
import { API_BASE, APP_HEADERS } from "#venmo/constants.ts"
import type { VenmoSession } from "#venmo/session.ts"
import { VenmoApiError, VenmoAuthError } from "#venmo/types.ts"
import type { VenmoStoriesResponse, VenmoUser } from "#venmo/types.ts"

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16_000]

export class VenmoClient {
  private readonly session: VenmoSession
  private readonly logger: Logger

  public constructor(opts: { session: VenmoSession; logger: Logger }) {
    this.session = opts.session
    this.logger = opts.logger.child({ module: "venmo" })
  }

  public async getMe(): Promise<VenmoUser> {
    const data = await this.request<{ data?: { user?: VenmoUser } }>("GET", "/v1/account")
    const user = data.data?.user
    if (!user?.id) throw new VenmoApiError("GET /v1/account missing data.user.id", 200)
    return user
  }

  public async getStories(opts: { beforeId?: string; limit?: number } = {}): Promise<VenmoStoriesResponse> {
    const params = new URLSearchParams()
    params.set("limit", String(opts.limit ?? 50))
    if (opts.beforeId) params.set("before_id", opts.beforeId)
    const path = `/v1/stories/target-or-actor/${encodeURIComponent(this.session.userId)}?${params.toString()}`
    return this.request<VenmoStoriesResponse>("GET", path)
  }

  private async request<T>(method: string, path: string): Promise<T> {
    const url = `${API_BASE}${path}`
    const headers: Record<string, string> = {
      ...APP_HEADERS,
      Authorization: `Bearer ${this.session.accessToken}`,
      "device-id": this.session.deviceId,
    }

    let lastErr: unknown
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const res = await fetch(url, { method, headers })

        if (res.status === 401) {
          const body = await res.text()
          throw new VenmoAuthError(
            `Venmo rejected token (401). Re-run \`auth\` to refresh. Body: ${body.slice(0, 200)}`,
          )
        }

        if (res.status === 429 || res.status === 503 || res.status >= 500) {
          const delay = RETRY_DELAYS_MS[attempt]
          if (delay === undefined) {
            const body = await res.text()
            throw new VenmoApiError(
              `${method} ${path} failed after retries: ${res.status}`,
              res.status,
              body.slice(0, 500),
            )
          }
          this.logger.warn("venmo.retry", {
            method,
            path,
            status: res.status,
            delayMs: delay,
          })
          await sleep(delay)
          continue
        }

        if (!res.ok) {
          const body = await res.text()
          throw new VenmoApiError(
            `${method} ${path} failed: ${res.status} ${res.statusText}`,
            res.status,
            body.slice(0, 500),
          )
        }

        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        return (await res.json()) as T
      } catch (error: unknown) {
        if (error instanceof VenmoAuthError || error instanceof VenmoApiError) throw error
        lastErr = error
        const delay = RETRY_DELAYS_MS[attempt]
        if (delay === undefined) break
        this.logger.warn("venmo.network_retry", {
          method,
          path,
          delayMs: delay,
          err: error instanceof Error ? error.message : String(error),
        })
        await sleep(delay)
      }
    }
    if (lastErr !== undefined) throw new Error(`${method} ${path} failed`, { cause: lastErr })

    throw new Error(`${method} ${path} failed without throwing`)
  }
}
