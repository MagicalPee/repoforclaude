#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createApp } from "./app.js";
import { loadConfig, VERSION } from "./config.js";
import { openDatabase } from "./db/database.js";
import { Store } from "./db/store.js";
import { generateDesignSystem, loadSpec } from "./design/generator.js";
import { renderSpecMarkdown } from "./design/render.js";
import { validateDesignSystem } from "./design/validator.js";
import { install, type InstallOptions, uninstall } from "./integration/install.js";
import { uiTaskContext } from "./integration/uiTask.js";
import { DIRECTIONS } from "./knowledge/directions.js";
import { log, setLogLevel } from "./logger.js";
import { sleep } from "./net/rateLimiter.js";
import { searchPatterns } from "./patterns/search.js";
import { createSnapshot, importSnapshot, type Snapshot } from "./research/snapshot.js";
import { refreshMinedPatterns } from "./patterns/miner.js";
import { createServer } from "./server.js";
import { type CategoryId, isCategoryId } from "./types.js";

interface Args {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const [key, inline] = a.slice(2).split("=", 2) as [string, string | undefined];
      if (inline !== undefined) flags[key] = inline;
      else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--")) flags[key] = argv[++i]!;
      else flags[key] = true;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

const str = (v: string | boolean | undefined) => (typeof v === "string" ? v : undefined);

const HELP = `design-intelligence-mcp ${VERSION}

Usage: design-intelligence-mcp <command> [options]

Commands
  serve                         Run the MCP server on stdio (default when stdin is not a TTY)
  init                          Connect to Claude Code: register server, install rules and hook
      --scope user|project        where to install (default user)
      --hook command|mcp_tool|none  UserPromptSubmit hook type (default command)
      --no-rules                  skip the rules file
      --no-register               skip MCP server registration
      --project-dir PATH          project root for --scope project (default cwd)
      --dry-run                   print planned changes only
  uninstall [--scope ...] [--remove-data]   Undo init
  generate "<prompt>"           Generate a design system
      --project PATH --framework X --brand "..." --constraints "..." --redesign
      --direction ID --write --json --compact
  tokens <id> [--format css|json|dtcg]   Print tokens of a stored design system
  analyze <url> [--refresh] [--json]      Analyze one public website
  research [--category C] [--max N] [--kind website|design_system] [--refresh] [--resume JOB]
                                Build the research dataset (runs until done; Ctrl-C to stop, resume later)
  status                        Dataset and job status
  patterns --category C [--keywords a,b] [--component button]
  validate <tokens.json|tokens.css>       Validate a token file
  directions                    List design directions
  export [--out FILE]           Export the evidence dataset as JSON
  snapshot --out FILE [--kind website|design_system]   Write a portable evidence snapshot
  import <snapshot.json>        Import a snapshot (e.g. one shared by a teammate)
  hook                          UserPromptSubmit hook handler (reads hook JSON on stdin)
  doctor                        Check the environment
  --version, --help`;

async function serve(): Promise<void> {
  const app = createApp();
  const server = createServer(app);
  const transport = new StdioServerTransport();
  const shutdown = async () => {
    await app.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.stdin.on("close", shutdown);
  await server.connect(transport);
  log.info(`design-intelligence MCP server ${VERSION} ready`, { db: app.config.dbPath });
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Must never fail loudly: any problem results in no output and exit 0. */
async function hook(): Promise<void> {
  try {
    setLogLevel("error");
    const raw = await readStdin();
    const input = JSON.parse(raw || "{}") as { prompt?: string; cwd?: string };
    if (!input.prompt) return;
    const config = loadConfig();
    const store = existsSync(config.dbPath) ? new Store(openDatabase(config.dbPath)) : undefined;
    const { context } = uiTaskContext(input.prompt, input.cwd, store);
    store?.db.close();
    if (context) process.stdout.write(`${context}\n`);
  } catch {
    // Swallow: a failing hook must not block the user's prompt.
  }
}

async function research(args: Args): Promise<void> {
  const app = createApp();
  const category = str(args.flags.category);
  if (category && !isCategoryId(category)) throw new Error(`Unknown category "${category}".`);
  const kind = str(args.flags.kind) as "website" | "design_system" | undefined;
  const result = args.flags.resume
    ? app.research.resumeJob(String(args.flags.resume))
    : app.research.startJob({ category: category as CategoryId | undefined, kind, maxSources: Number(args.flags.max ?? 25), refresh: Boolean(args.flags.refresh) });
  console.log(result.message);
  if (!result.jobId || result.status === "nothing_to_do") {
    await app.close();
    return;
  }
  const jobId = result.jobId;
  process.on("SIGINT", () => {
    console.log(`\nStopping… resume later with: design-intelligence-mcp research --resume ${jobId}`);
    app.research.cancelJob(jobId);
  });
  let last = -1;
  for (;;) {
    const job = await app.research.waitForJob(jobId, 5000);
    if (!job) break;
    const line = `${job.status}: ${job.processed}/${job.total} processed, ${job.succeeded} ok, ${job.failed} failed, ${job.skipped} skipped`;
    if (process.stdout.isTTY) process.stdout.write(`\r${line}   `);
    else if (job.processed !== last || !["running", "pending"].includes(job.status)) console.log(line);
    last = job.processed;
    if (!["running", "pending"].includes(job.status)) break;
  }
  console.log();
  const failures = app.store.jobItemErrors(jobId, 15);
  if (failures.length) {
    console.log("Recent failures:");
    for (const f of failures) console.log(`  ${f.status.padEnd(8)} ${f.url} — ${(f.error ?? "").slice(0, 140)}`);
  }
  const stats = app.store.stats();
  console.log(`Dataset: ${stats.analyzedSources}/${stats.sources} sources analyzed. Patterns: ${JSON.stringify(stats.patterns)}`);
  await app.close();
}

async function doctor(): Promise<void> {
  const checks: Array<[string, boolean, string]> = [];
  const [major, minor] = process.versions.node.split(".").map(Number) as [number, number];
  checks.push(["Node.js ≥ 22.13", major > 22 || (major === 22 && minor >= 13), process.version]);
  const config = loadConfig();
  try {
    const app = createApp({ config });
    const stats = app.store.stats();
    checks.push(["SQLite database", true, `${config.dbPath} (schema v${stats.schemaVersion}, ${stats.sources} sources, ${stats.analyzedSources} analyzed)`]);
    await app.close();
  } catch (error) {
    checks.push(["SQLite database", false, (error as Error).message]);
  }
  const claude = await import("node:child_process").then((cp) => cp.spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 10_000 }));
  checks.push(["Claude Code CLI on PATH", !claude.error && claude.status === 0, claude.error ? "not found (init will print the manual command)" : (claude.stdout ?? "").trim()]);
  checks.push(["Proxy for research", true, config.research.useProxy ? `DIM_USE_PROXY=1 via ${config.research.proxyUrl ?? "(HTTPS_PROXY not set!)"}` : "direct connections (connect-time IP checks active)"]);
  for (const [name, ok, detail] of checks) console.log(`${ok ? "✔" : "✘"} ${name}: ${detail}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const command = args.positional[0] ?? (process.stdin.isTTY ? "help" : "serve");
  if (args.flags.version) return void console.log(VERSION);
  if (args.flags.help || command === "help") return void console.log(HELP);

  switch (command) {
    case "serve":
      return serve();
    case "hook":
      return hook();
    case "init":
    case "uninstall": {
      const scope = (str(args.flags.scope) ?? "user") as InstallOptions["scope"];
      if (!["user", "project"].includes(scope)) throw new Error("--scope must be user or project");
      const common = {
        scope,
        register: !args.flags["no-register"],
        projectDir: resolve(str(args.flags["project-dir"]) ?? process.cwd()),
        dryRun: Boolean(args.flags["dry-run"]),
      };
      const actions =
        command === "init"
          ? install({ ...common, hook: (str(args.flags.hook) ?? "command") as InstallOptions["hook"], rules: !args.flags["no-rules"] })
          : uninstall({ ...common, removeData: Boolean(args.flags["remove-data"]), dataDir: loadConfig().dataDir });
      for (const a of actions) console.log(`${a.done ? "✔" : common.dryRun ? "•" : "✘"} ${a.action}: ${a.target}\n    ${a.detail}`);
      if (command === "init" && !common.dryRun) {
        console.log("\nRestart Claude Code (or run /mcp) so it picks up the server. Verify with: claude mcp list");
      }
      return;
    }
    case "generate": {
      const prompt = args.positional.slice(1).join(" ");
      if (!prompt) throw new Error('Usage: generate "<project description>"');
      const app = createApp();
      const spec = generateDesignSystem(app.store, {
        prompt,
        projectPath: str(args.flags.project) ? resolve(String(args.flags.project)) : undefined,
        framework: str(args.flags.framework),
        brandPreferences: str(args.flags.brand),
        constraints: str(args.flags.constraints),
        redesign: Boolean(args.flags.redesign),
        directionId: str(args.flags.direction),
        writeFiles: Boolean(args.flags.write),
      });
      console.log(args.flags.json ? JSON.stringify(spec, null, 2) : renderSpecMarkdown(spec, { compact: Boolean(args.flags.compact) }));
      return app.close();
    }
    case "tokens": {
      const app = createApp();
      const spec = loadSpec(app.store, args.positional[1] ?? "");
      if (!spec) throw new Error(`No design system "${args.positional[1] ?? ""}".`);
      const fmt = str(args.flags.format) ?? "css";
      console.log(fmt === "css" ? spec.tokens.css : fmt === "dtcg" ? JSON.stringify(spec.tokens.dtcg, null, 2) : JSON.stringify(spec, null, 2));
      return app.close();
    }
    case "analyze": {
      const url = args.positional[1];
      if (!url) throw new Error("Usage: analyze <url>");
      const app = createApp();
      const { record, stored, reused } = await app.research.analyzeUrl(url, Boolean(args.flags.refresh));
      const profile = record?.profile ?? (stored?.profile_json ? JSON.parse(stored.profile_json) : undefined);
      if (args.flags.json) console.log(JSON.stringify({ status: record?.status ?? stored?.status, reused, profile, limitations: record?.limitations }, null, 2));
      else {
        console.log(`${record?.status ?? stored?.status}${reused ? " (cached)" : ""}: ${url}`);
        if (record?.error ?? stored?.error) console.log(`error: ${record?.error ?? stored?.error}`);
        if (profile) {
          console.log(`colors: bg ${profile.colors.background} text ${profile.colors.text} brand ${profile.colors.brandCandidates.join(", ")} (${profile.colors.scheme})`);
          console.log(`fonts: heading ${profile.typography.headingFont} / body ${profile.typography.bodyFont}; body ${profile.typography.bodySizePx}px; h1 ${profile.typography.headingSizesPx.h1}px`);
          console.log(`shape: radius ${profile.shape.dominantRadiusPx}px, buttons ${profile.shape.buttonRadiusPx}px, shadows ${profile.elevation.style}`);
        }
      }
      return app.close();
    }
    case "research":
      return research(args);
    case "status": {
      const app = createApp();
      console.log(JSON.stringify({ ...app.store.stats(), jobs: app.store.listJobs(5) }, null, 2));
      return app.close();
    }
    case "patterns": {
      const category = str(args.flags.category);
      if (!category || !isCategoryId(category)) throw new Error("--category is required (e.g. fintech, gaming, saas-b2b)");
      const app = createApp();
      const hits = searchPatterns(app.store, { category, keywords: str(args.flags.keywords)?.split(","), component: str(args.flags.component) });
      for (const h of hits) console.log(`[${h.origin}/${h.kind} ${h.confidence}] ${h.name}\n    ${h.description}\n    ${h.whyRelevant}`);
      return app.close();
    }
    case "validate": {
      const file = args.positional[1];
      if (!file) throw new Error("Usage: validate <tokens.json|tokens.css>");
      const raw = readFileSync(file, "utf8");
      const tokens = file.endsWith(".css") ? raw : JSON.parse(raw);
      console.log(JSON.stringify(validateDesignSystem(tokens), null, 2));
      return;
    }
    case "directions":
      for (const d of DIRECTIONS) console.log(`${d.id.padEnd(22)} ${d.name} — ${d.summary}`);
      return;
    case "export": {
      const app = createApp();
      const out = str(args.flags.out) ?? `design-intelligence-dataset-${new Date().toISOString().slice(0, 10)}.json`;
      writeFileSync(out, JSON.stringify(app.store.exportDataset(), null, 2));
      console.log(`Wrote ${resolve(out)}`);
      return app.close();
    }
    case "snapshot": {
      const out = str(args.flags.out);
      if (!out) throw new Error("--out FILE is required");
      const app = createApp();
      const snap = createSnapshot(app.store, { kind: str(args.flags.kind) as "website" | "design_system" | undefined });
      writeFileSync(out, `${JSON.stringify(snap, null, 1)}\n`);
      console.log(`Wrote ${snap.entries.length} analyses to ${resolve(out)}`);
      return app.close();
    }
    case "import": {
      const file = args.positional[1];
      if (!file) throw new Error("Usage: import <snapshot.json>");
      const app = createApp();
      const result = importSnapshot(app.store, JSON.parse(readFileSync(file, "utf8")) as Snapshot);
      const mined = refreshMinedPatterns(app.store);
      console.log(`Imported ${result.imported}, skipped ${result.skipped}; ${mined} mined patterns.`);
      return app.close();
    }
    case "doctor":
      return doctor();
    default:
      console.error(`Unknown command "${command}".\n\n${HELP}`);
      process.exitCode = 2;
  }
}

main().catch(async (error) => {
  console.error(`error: ${(error as Error).message}`);
  await sleep(0);
  process.exit(1);
});
