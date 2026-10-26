import { rename } from "node:fs/promises"
import path from "node:path"

import { type } from "arktype"
import bun from "bun"

const stateFileSchema = type({
  "lastSeenStoryId?": "string | null",
  "lastRunAt?": "string | null",
})

export interface State {
  lastSeenStoryId: string | null
  lastRunAt: string | null
  schemaVersion: 1
}

export const defaultState = (): State => ({
  lastSeenStoryId: null,
  lastRunAt: null,
  schemaVersion: 1,
})

const statePath = (dataDir: string): string => path.join(dataDir, "state.json")

const isFileNotFound = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT"

export const readState = async (dataDir: string): Promise<State> => {
  const filePath = statePath(dataDir)
  try {
    const text = await bun.file(filePath).text()
    const parsed = stateFileSchema.assert(JSON.parse(text))
    return {
      lastSeenStoryId: parsed.lastSeenStoryId ?? null,
      lastRunAt: parsed.lastRunAt ?? null,
      schemaVersion: 1,
    }
  } catch (error: unknown) {
    if (isFileNotFound(error)) return defaultState()
    throw error
  }
}

export const writeState = async (dataDir: string, state: State): Promise<void> => {
  const filePath = statePath(dataDir)
  const tmp = `${filePath}.tmp`
  await bun.write(tmp, JSON.stringify(state, undefined, 2))
  await rename(tmp, filePath)
}
