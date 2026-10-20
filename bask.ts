import { task } from "@adamhl8/bask"

export * from "@adamhl8/configs/bask"

export const auth = task(async ({ sh }) => {
  await sh`node src/cli.ts auth`
})

export const start = task(async ({ sh }) => {
  await sh`node src/cli.ts start`
})

export const syncOnce = task(async ({ sh }) => {
  await sh`node src/cli.ts sync-once`
})

export const dryRun = task(async ({ sh }) => {
  await sh`node src/cli.ts sync-once --dry-run`
})

export const listAccounts = task(async ({ sh }) => {
  await sh`node src/cli.ts list-accounts`
})
