import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

export interface VenmoSession {
  accessToken: string
  deviceId: string
  userId: string
  username: string
  createdAt: string
}

const sessionPath = (dataDir: string): string => path.join(dataDir, "session.json")

export const loadSession = async (dataDir: string): Promise<VenmoSession> => {
  const filePath = sessionPath(dataDir)
  const text = await readFile(filePath, "utf8")
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const parsed = JSON.parse(text) as Partial<VenmoSession>
  if (!parsed.accessToken || !parsed.deviceId || !parsed.userId)
    throw new Error(`Session file at ${filePath} is malformed`)

  return {
    accessToken: parsed.accessToken,
    deviceId: parsed.deviceId,
    userId: parsed.userId,
    username: parsed.username ?? "",
    createdAt: parsed.createdAt ?? new Date().toISOString(),
  }
}

export const tryLoadSession = async (dataDir: string): Promise<VenmoSession | null> => {
  try {
    return await loadSession(dataDir)
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "ENOENT") return null

    throw error
  }
}

export const saveSession = async (dataDir: string, session: VenmoSession): Promise<void> => {
  const filePath = sessionPath(dataDir)
  await mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp`
  await writeFile(tmp, JSON.stringify(session, undefined, 2), {
    encoding: "utf8",
    mode: 0o600,
  })
  await rename(tmp, filePath)
}
