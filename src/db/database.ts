import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DatabaseSync as DatabaseSyncType, SQLInputValue } from "node:sqlite";
import { silenceSqliteExperimentalWarning } from "../logger.js";
import { MIGRATIONS, type Migration } from "./migrations.js";

export type Db = DatabaseSyncType;
export type SqlParams = Record<string, SQLInputValue | undefined | boolean>;

let sqliteModule: typeof import("node:sqlite") | undefined;

/** node:sqlite is loaded lazily so the experimental warning filter is installed first. */
function sqlite(): typeof import("node:sqlite") {
  if (!sqliteModule) {
    silenceSqliteExperimentalWarning();
    const require = createRequire(import.meta.url);
    try {
      sqliteModule = require("node:sqlite") as typeof import("node:sqlite");
    } catch (error) {
      throw new Error(
        `node:sqlite is unavailable in Node ${process.version}. design-intelligence-mcp needs Node 22.13 or newer ` +
          `(where node:sqlite works without flags). Original error: ${(error as Error).message}`,
      );
    }
  }
  return sqliteModule;
}

export function openDatabase(path: string, migrations: Migration[] = MIGRATIONS): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new (sqlite().DatabaseSync)(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  if (path !== ":memory:") {
    // WAL lets the hook process read while the server writes research results.
    db.exec("PRAGMA journal_mode = WAL;");
  }
  migrate(db, migrations);
  return db;
}

export function migrate(db: Db, migrations: Migration[] = MIGRATIONS): number[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);",
  );
  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map((r) => r.version),
  );
  const ran: number[] = [];
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;
    transaction(db, () => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
    });
    ran.push(migration.version);
  }
  return ran;
}

export function schemaVersion(db: Db): number {
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null } | undefined;
  return row?.v ?? 0;
}

// DatabaseSync#isTransaction only exists from Node 22.16, so nesting is tracked here.
const openTransactions = new WeakSet<Db>();

export function transaction<T>(db: Db, fn: () => T): T {
  if (openTransactions.has(db)) return fn();
  db.exec("BEGIN IMMEDIATE");
  openTransactions.add(db);
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    openTransactions.delete(db);
  }
}

/** node:sqlite rejects `undefined` and booleans; normalise parameters once here. */
export function params(input: SqlParams): Record<string, SQLInputValue> {
  const out: Record<string, SQLInputValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) out[key] = null;
    else if (typeof value === "boolean") out[key] = value ? 1 : 0;
    else out[key] = value;
  }
  return out;
}
