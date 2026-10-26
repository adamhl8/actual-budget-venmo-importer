import { mkdir, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import { type } from "arktype"
import bun from "bun"

const sessionFileSchema = type({
  accessToken: "string > 0",
  deviceId: "string > 0",
  userId: "string > 0",
  username: "string = ''",
  createdAt: ["string", "=", () => new Date().toISOString()],
})

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
  const text = await bun.file(filePath).text()
  const parsed = sessionFileSchema(JSON.parse(text))
  if (parsed instanceof type.errors) throw new Error(`Session file at ${filePath} is malformed: ${parsed.summary}`)

  return parsed
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
  // oxlint-disable-next-line bunisms/prefer-bun-write - bun.write ignores `mode`, and the session holds the access token
  await writeFile(tmp, JSON.stringify(session, undefined, 2), {
    encoding: "utf8",
    mode: 0o600,
  })
  await rename(tmp, filePath)
}
