import { homedir } from "node:os";
import { join } from "node:path";

export const VERSION = "0.1.0";
export const ANALYZER_VERSION = "3";
export const USER_AGENT_TOKEN = "DesignIntelligenceBot";

export interface ResearchConfig {
  concurrency: number;
  perHostIntervalMs: number;
  requestTimeoutMs: number;
  maxRetries: number;
  maxHtmlBytes: number;
  maxCssBytes: number;
  maxTotalCssBytes: number;
  maxStylesheets: number;
  maxTokenFileBytes: number;
  reanalyzeAfterDays: number;
  userAgent: string;
  useProxy: boolean;
  proxyUrl: string | undefined;
}

export interface AppConfig {
  dataDir: string;
  dbPath: string;
  logLevel: "error" | "warn" | "info" | "debug";
  research: ResearchConfig;
}

function defaultDataDir(env: NodeJS.ProcessEnv): string {
  if (process.platform === "win32" && env.LOCALAPPDATA) {
    return join(env.LOCALAPPDATA, "design-intelligence-mcp");
  }
  const xdg = env.XDG_DATA_HOME;
  return join(xdg && xdg.trim() ? xdg : join(homedir(), ".local", "share"), "design-intelligence-mcp");
}

function int(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be an integer, got "${raw}"`);
  }
  return Math.min(max, Math.max(min, value));
}

function bool(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = env.DIM_DATA_DIR?.trim() || defaultDataDir(env);
  const level = (env.DIM_LOG_LEVEL ?? "info").toLowerCase();
  return {
    dataDir,
    dbPath: env.DIM_DB_PATH?.trim() || join(dataDir, "research.db"),
    logLevel: (["error", "warn", "info", "debug"].includes(level) ? level : "info") as AppConfig["logLevel"],
    research: {
      // Hard ceilings keep a misconfiguration from turning the crawler into a load generator.
      concurrency: int(env, "DIM_CONCURRENCY", 4, 1, 16),
      perHostIntervalMs: int(env, "DIM_PER_HOST_INTERVAL_MS", 1500, 250, 60_000),
      requestTimeoutMs: int(env, "DIM_REQUEST_TIMEOUT_MS", 15_000, 1000, 120_000),
      maxRetries: int(env, "DIM_MAX_RETRIES", 2, 0, 5),
      maxHtmlBytes: int(env, "DIM_MAX_HTML_BYTES", 2_000_000, 10_000, 10_000_000),
      maxCssBytes: int(env, "DIM_MAX_CSS_BYTES", 1_500_000, 10_000, 10_000_000),
      maxTotalCssBytes: int(env, "DIM_MAX_TOTAL_CSS_BYTES", 6_000_000, 10_000, 40_000_000),
      maxStylesheets: int(env, "DIM_MAX_STYLESHEETS", 8, 0, 30),
      maxTokenFileBytes: int(env, "DIM_MAX_TOKEN_FILE_BYTES", 1_500_000, 10_000, 10_000_000),
      reanalyzeAfterDays: int(env, "DIM_REANALYZE_AFTER_DAYS", 30, 0, 3650),
      userAgent:
        env.DIM_USER_AGENT?.trim() ||
        `${USER_AGENT_TOKEN}/${VERSION} (+https://github.com/MagicalPee/repoforclaude; design research, respects robots.txt)`,
      useProxy: bool(env, "DIM_USE_PROXY", false),
      proxyUrl: env.HTTPS_PROXY || env.https_proxy || undefined,
    },
  };
}
