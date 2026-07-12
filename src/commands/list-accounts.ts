import type { ActualAccount } from "#actual/client.ts"
import { ActualClient } from "#actual/client.ts"
import { requireActualConnection } from "#config.ts"
import type { Config } from "#config.ts"
import type { Logger } from "#logger.ts"

const accountStatus = (a: ActualAccount): string => {
  if (a.closed) return "closed"
  if (a.offbudget) return "off-budget"
  return "on-budget"
}

export const runListAccountsCommand = async (config: Config, logger: Logger): Promise<void> => {
  const connection = requireActualConnection(config)
  const actual = new ActualClient({ config: connection, logger })
  try {
    await actual.connect()
    const accounts = await actual.getAccounts()
    if (accounts.length === 0) {
      console.log("(no accounts found)")
      return
    }
    console.log("\nAccounts in budget:")
    console.log("-".repeat(80))
    console.log(["id".padEnd(38), "name".padEnd(30), "status"].join("  "))
    console.log("-".repeat(80))
    for (const a of accounts) console.log([a.id.padEnd(38), a.name.padEnd(30), accountStatus(a)].join("  "))

    console.log("-".repeat(80))
    console.log("\nSet ACTUAL_VENMO_ACCOUNT_ID to the id of your Venmo account.")
  } finally {
    await actual.shutdown()
  }
}
