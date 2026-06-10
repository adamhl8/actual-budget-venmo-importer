export type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

export interface Logger {
	debug(msg: string, fields?: Record<string, unknown>): void;
	info(msg: string, fields?: Record<string, unknown>): void;
	warn(msg: string, fields?: Record<string, unknown>): void;
	error(msg: string, fields?: Record<string, unknown>): void;
	child(fields: Record<string, unknown>): Logger;
}

function formatFields(fields: Record<string, unknown>): string {
	const parts: string[] = [];
	for (const [k, v] of Object.entries(fields)) {
		if (v === undefined) continue;
		const s =
			typeof v === "string"
				? /[\s"=]/.test(v)
					? JSON.stringify(v)
					: v
				: v instanceof Error
					? JSON.stringify(`${v.name}: ${v.message}`)
					: JSON.stringify(v);
		parts.push(`${k}=${s}`);
	}
	return parts.join(" ");
}

function makeLogger(level: Level, context: Record<string, unknown>): Logger {
	const minOrder = ORDER[level];
	const emit = (
		lvl: Level,
		msg: string,
		fields?: Record<string, unknown>,
	): void => {
		if (ORDER[lvl] < minOrder) return;
		const merged = { ...context, ...(fields ?? {}) };
		const ts = new Date().toISOString();
		const tail =
			Object.keys(merged).length > 0 ? ` ${formatFields(merged)}` : "";
		const line = `${ts} ${lvl.toUpperCase()} ${msg}${tail}`;
		if (lvl === "error" || lvl === "warn") console.error(line);
		else console.log(line);
	};

	return {
		debug: (msg, fields) => emit("debug", msg, fields),
		info: (msg, fields) => emit("info", msg, fields),
		warn: (msg, fields) => emit("warn", msg, fields),
		error: (msg, fields) => emit("error", msg, fields),
		child: (fields) => makeLogger(level, { ...context, ...fields }),
	};
}

export function createLogger(level: Level): Logger {
	return makeLogger(level, {});
}
