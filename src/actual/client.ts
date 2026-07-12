import { mkdir } from "node:fs/promises"

import {
  downloadBudget,
  getAccounts as apiGetAccounts,
  importTransactions as apiImportTransactions,
  init,
  shutdown as apiShutdown,
} from "@actual-app/api"

import type { ActualConnection } from "#config.ts"
import type { Logger } from "#logger.ts"

export interface ActualTransaction {
  account: string
  date: string
  amount: number
  payee_name: string
  notes?: string
  imported_id: string
  cleared: boolean
}

export interface ActualAccount {
  id: string
  name: string
  offbudget: boolean | undefined
  closed: boolean | undefined
  balance_current: number | null | undefined
}

export interface ImportResult {
  added: string[]
  updated: string[]
}

export class ActualClient {
  private readonly config: ActualConnection
  private readonly logger: Logger
  private connected = false

  public constructor(opts: { config: ActualConnection; logger: Logger }) {
    this.config = opts.config
    this.logger = opts.logger.child({ module: "actual" })
  }

  public async connect(): Promise<void> {
    if (this.connected) return
    await mkdir(this.config.cacheDir, { recursive: true })
    this.logger.info("actual.init", { serverUrl: this.config.serverUrl })
    await init({
      dataDir: this.config.cacheDir,
      serverURL: this.config.serverUrl,
      password: this.config.serverPassword,
    })
    this.logger.info("actual.downloadBudget", { syncId: this.config.syncId })
    await downloadBudget(this.config.syncId)
    this.connected = true
  }

  // oxlint-disable-next-line class-methods-use-this -- instance method by design, part of the client API
  public async getAccounts(): Promise<ActualAccount[]> {
    const accounts = await apiGetAccounts()
    return accounts.map((a) => ({
      id: a.id,
      name: a.name,
      offbudget: a.offbudget,
      closed: a.closed,
      balance_current: a.balance_current,
    }))
  }

  public async importTransactions(accountId: string, transactions: ActualTransaction[]): Promise<ImportResult> {
    if (transactions.length === 0) return { added: [], updated: [] }
    const res = await apiImportTransactions(accountId, transactions)
    if (res.errors.length > 0)
      for (const e of res.errors) this.logger.warn("actual.import.error", { message: e.message })

    return { added: res.added, updated: res.updated }
  }

  public async shutdown(): Promise<void> {
    try {
      await apiShutdown()
    } catch (error: unknown) {
      this.logger.warn("actual.shutdown.error", {
        err: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.connected = false
    }
  }
}
