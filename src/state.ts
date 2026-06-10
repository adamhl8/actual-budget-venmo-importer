import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface State {
	lastSeenStoryId: string | null;
	lastRunAt: string | null;
	schemaVersion: 1;
}

export function defaultState(): State {
	return { lastSeenStoryId: null, lastRunAt: null, schemaVersion: 1 };
}

function statePath(dataDir: string): string {
	return join(dataDir, "state.json");
}

export async function readState(dataDir: string): Promise<State> {
	const path = statePath(dataDir);
	try {
		const text = await readFile(path, "utf-8");
		const parsed = JSON.parse(text) as Partial<State>;
		return {
			lastSeenStoryId: parsed.lastSeenStoryId ?? null,
			lastRunAt: parsed.lastRunAt ?? null,
			schemaVersion: 1,
		};
	} catch (err: unknown) {
		if (isFileNotFound(err)) return defaultState();
		throw err;
	}
}

export async function writeState(dataDir: string, state: State): Promise<void> {
	const path = statePath(dataDir);
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp`;
	await writeFile(tmp, JSON.stringify(state, null, 2), "utf-8");
	await rename(tmp, path);
}

function isFileNotFound(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		(err as { code?: string }).code === "ENOENT"
	);
}
