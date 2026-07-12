import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

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
    const text = await readFile(filePath, "utf8")
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const parsed = JSON.parse(text) as Partial<State>
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
  await mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp`
  await writeFile(tmp, JSON.stringify(state, undefined, 2), "utf8")
  await rename(tmp, filePath)
}
