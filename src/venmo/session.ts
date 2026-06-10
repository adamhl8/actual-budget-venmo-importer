import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface VenmoSession {
	accessToken: string;
	deviceId: string;
	userId: string;
	username: string;
	createdAt: string;
}

function sessionPath(dataDir: string): string {
	return join(dataDir, "session.json");
}

export async function loadSession(dataDir: string): Promise<VenmoSession> {
	const path = sessionPath(dataDir);
	const text = await readFile(path, "utf-8");
	const parsed = JSON.parse(text) as Partial<VenmoSession>;
	if (!parsed.accessToken || !parsed.deviceId || !parsed.userId) {
		throw new Error(`Session file at ${path} is malformed`);
	}
	return {
		accessToken: parsed.accessToken,
		deviceId: parsed.deviceId,
		userId: parsed.userId,
		username: parsed.username ?? "",
		createdAt: parsed.createdAt ?? new Date().toISOString(),
	};
}

export async function tryLoadSession(
	dataDir: string,
): Promise<VenmoSession | null> {
	try {
		return await loadSession(dataDir);
	} catch (err: unknown) {
		if (
			typeof err === "object" &&
			err !== null &&
			(err as { code?: string }).code === "ENOENT"
		) {
			return null;
		}
		throw err;
	}
}

export async function saveSession(
	dataDir: string,
	session: VenmoSession,
): Promise<void> {
	const path = sessionPath(dataDir);
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp`;
	await writeFile(tmp, JSON.stringify(session, null, 2), {
		encoding: "utf-8",
		mode: 0o600,
	});
	await rename(tmp, path);
}
