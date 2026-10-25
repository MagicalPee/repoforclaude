// stdout belongs to the MCP stdio transport, so every log line goes to stderr.

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
export type LogLevel = keyof typeof LEVELS;

let threshold: number = LEVELS.info;

export function setLogLevel(level: LogLevel): void {
  threshold = LEVELS[level];
}

function write(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (LEVELS[level] > threshold) return;
  const suffix = data && Object.keys(data).length > 0 ? ` ${safeJson(data)}` : "";
  process.stderr.write(`[design-intelligence] ${level.toUpperCase()} ${message}${suffix}\n`);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

export const log = {
  error: (message: string, data?: Record<string, unknown>) => write("error", message, data),
  warn: (message: string, data?: Record<string, unknown>) => write("warn", message, data),
  info: (message: string, data?: Record<string, unknown>) => write("info", message, data),
  debug: (message: string, data?: Record<string, unknown>) => write("debug", message, data),
};

/**
 * node:sqlite prints an ExperimentalWarning on first use (Node 22/23). It is noise for
 * MCP clients that surface stderr, so filter exactly that warning and keep all others.
 */
export function silenceSqliteExperimentalWarning(): void {
  const original = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === "string" ? warning : warning?.message;
    if (typeof text === "string" && text.includes("SQLite is an experimental feature")) return;
    return (original as (...args: unknown[]) => void)(warning, ...rest);
  }) as typeof process.emitWarning;
}
