import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES_MARKDOWN, SERVER_NAME } from "./rules.js";

export type Scope = "user" | "project";
export type HookType = "command" | "mcp_tool" | "none";

export interface InstallOptions {
  scope: Scope;
  hook: HookType;
  rules: boolean;
  register: boolean;
  projectDir: string;
  dryRun: boolean;
  /** Override how Claude Code launches the server (default: node + this package's dist/cli.js). */
  serverCommand?: { command: string; args: string[] };
  home?: string;
  /** Test seam: replaces spawning the `claude` CLI. */
  runClaude?: (args: string[]) => { ok: boolean; output: string };
}

export interface InstallAction {
  action: string;
  target: string;
  detail: string;
  done: boolean;
}

type Json = Record<string, unknown>;

interface HookHandler {
  type: string;
  command?: string;
  args?: string[];
  server?: string;
  tool?: string;
  input?: Record<string, string>;
  timeout?: number;
  statusMessage?: string;
}

interface HookGroup {
  matcher?: string;
  hooks: HookHandler[];
}

/** The CLI entry this package runs from (dist/cli.js once built). */
export function cliPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "cli.js");
}

export function defaultServerCommand(): { command: string; args: string[] } {
  const cli = cliPath();
  // Installed through npx: let Claude Code resolve the package each time.
  if (/[\\/]_npx[\\/]/.test(cli)) return { command: "npx", args: ["-y", "design-intelligence-mcp", "serve"] };
  return { command: "node", args: [cli, "serve"] };
}

const STATUS_MESSAGE = "design-intelligence: checking for UI work";

function isOurHandler(h: HookHandler): boolean {
  if (h.statusMessage === STATUS_MESSAGE) return true;
  if (h.type === "mcp_tool") return h.server === SERVER_NAME && h.tool === "check_ui_task";
  const joined = [h.command ?? "", ...(h.args ?? [])].join(" ");
  return /design-intelligence-mcp|[\\/]dist[\\/]cli\.js/.test(joined) && /\bhook\b/.test(joined);
}

function readJson(path: string): Json {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("top level is not an object");
    return parsed as Json;
  } catch (error) {
    throw new Error(`${path} is not valid JSON (${(error as Error).message}); fix or move it before installing. Nothing was changed.`);
  }
}

function writeJson(path: string, data: Json): void {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) copyFileSync(path, `${path}.bak`);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

export function hookHandler(type: Exclude<HookType, "none">, serverCommand: { command: string; args: string[] }): HookHandler {
  if (type === "mcp_tool") {
    return {
      type: "mcp_tool",
      server: SERVER_NAME,
      tool: "check_ui_task",
      input: { prompt: "${prompt}", cwd: "${cwd}" },
      timeout: 15,
      statusMessage: STATUS_MESSAGE,
    };
  }
  const args = serverCommand.args.slice(0, -1).concat("hook");
  return { type: "command", command: serverCommand.command, args, timeout: 10, statusMessage: STATUS_MESSAGE };
}

/** Adds (or replaces) our UserPromptSubmit handler while preserving every other setting. */
export function mergeHook(settings: Json, handler: HookHandler | null): Json {
  const hooks = { ...((settings.hooks as Json | undefined) ?? {}) };
  const groups = ((hooks.UserPromptSubmit as HookGroup[] | undefined) ?? [])
    .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !isOurHandler(h)) }))
    .filter((g) => g.hooks.length > 0);
  if (handler) groups.push({ hooks: [handler] });
  if (groups.length > 0) hooks.UserPromptSubmit = groups;
  else delete hooks.UserPromptSubmit;
  const out = { ...settings };
  if (Object.keys(hooks).length > 0) out.hooks = hooks;
  else delete out.hooks;
  return out;
}

export function mergeMcpJson(config: Json, serverCommand: { command: string; args: string[] } | null): Json {
  const servers = { ...((config.mcpServers as Json | undefined) ?? {}) };
  if (serverCommand) servers[SERVER_NAME] = { type: "stdio", command: serverCommand.command, args: serverCommand.args, env: {} };
  else delete servers[SERVER_NAME];
  return { ...config, mcpServers: servers };
}

function claudeCli(args: string[]): { ok: boolean; output: string } {
  const res = spawnSync("claude", args, { encoding: "utf8", timeout: 30_000 });
  if (res.error) return { ok: false, output: (res.error as Error).message };
  return { ok: res.status === 0, output: `${res.stdout ?? ""}${res.stderr ?? ""}`.trim() };
}

export function install(options: InstallOptions): InstallAction[] {
  const home = options.home ?? homedir();
  const actions: InstallAction[] = [];
  const server = options.serverCommand ?? defaultServerCommand();
  const run = options.runClaude ?? claudeCli;
  const base = options.scope === "user" ? join(home, ".claude") : join(options.projectDir, ".claude");

  // 1. Register the MCP server.
  if (options.register) {
    if (options.scope === "project") {
      const path = join(options.projectDir, ".mcp.json");
      const next = mergeMcpJson(readJson(path), server);
      if (!options.dryRun) writeJson(path, next);
      actions.push({ action: "register-mcp-server", target: path, detail: `${server.command} ${server.args.join(" ")}`, done: !options.dryRun });
    } else {
      const args = ["mcp", "add", "--scope", "user", SERVER_NAME, "--", server.command, ...server.args];
      if (options.dryRun) {
        actions.push({ action: "register-mcp-server", target: "claude mcp add (user scope)", detail: `claude ${args.join(" ")}`, done: false });
      } else {
        run(["mcp", "remove", "--scope", "user", SERVER_NAME]);
        const res = run(args);
        actions.push({
          action: "register-mcp-server",
          target: "claude mcp add (user scope)",
          detail: res.ok ? `registered: ${server.command} ${server.args.join(" ")}` : `could not run the claude CLI (${res.output.slice(0, 200)}). Run manually: claude ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
          done: res.ok,
        });
      }
    }
  }

  // 2. Rules telling Claude when to consult the server.
  if (options.rules) {
    const path = join(base, "rules", "design-intelligence.md");
    if (!options.dryRun) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, RULES_MARKDOWN);
    }
    actions.push({ action: "install-rules", target: path, detail: "Claude Code loads ~/.claude/rules and .claude/rules files as instructions", done: !options.dryRun });
  }

  // 3. UserPromptSubmit hook that adds context only for UI-related prompts.
  if (options.hook !== "none") {
    const path = join(base, "settings.json");
    const handler = hookHandler(options.hook, server);
    const next = mergeHook(readJson(path), handler);
    if (!options.dryRun) writeJson(path, next);
    actions.push({
      action: "install-hook",
      target: path,
      detail: handler.type === "mcp_tool" ? "UserPromptSubmit → mcp_tool check_ui_task" : `UserPromptSubmit → ${handler.command} ${(handler.args ?? []).join(" ")}`,
      done: !options.dryRun,
    });
  }
  return actions;
}

export function uninstall(options: Omit<InstallOptions, "hook" | "rules" | "serverCommand"> & { removeData?: boolean; dataDir?: string }): InstallAction[] {
  const home = options.home ?? homedir();
  const actions: InstallAction[] = [];
  const run = options.runClaude ?? claudeCli;
  const base = options.scope === "user" ? join(home, ".claude") : join(options.projectDir, ".claude");
  const settingsPath = join(base, "settings.json");
  if (existsSync(settingsPath)) {
    const next = mergeHook(readJson(settingsPath), null);
    if (!options.dryRun) writeJson(settingsPath, next);
    actions.push({ action: "remove-hook", target: settingsPath, detail: "removed design-intelligence UserPromptSubmit handler", done: !options.dryRun });
  }
  const rules = join(base, "rules", "design-intelligence.md");
  if (existsSync(rules)) {
    if (!options.dryRun) rmSync(rules);
    actions.push({ action: "remove-rules", target: rules, detail: "deleted", done: !options.dryRun });
  }
  if (options.register) {
    if (options.scope === "project") {
      const path = join(options.projectDir, ".mcp.json");
      if (existsSync(path)) {
        if (!options.dryRun) writeJson(path, mergeMcpJson(readJson(path), null));
        actions.push({ action: "unregister-mcp-server", target: path, detail: "removed entry", done: !options.dryRun });
      }
    } else if (!options.dryRun) {
      const res = run(["mcp", "remove", "--scope", "user", SERVER_NAME]);
      actions.push({ action: "unregister-mcp-server", target: "claude mcp remove", detail: res.ok ? "removed" : res.output.slice(0, 200), done: res.ok });
    }
  }
  if (options.removeData && options.dataDir && existsSync(options.dataDir)) {
    if (!options.dryRun) rmSync(options.dataDir, { recursive: true, force: true });
    actions.push({ action: "remove-data", target: options.dataDir, detail: "deleted research database and exports", done: !options.dryRun });
  }
  return actions;
}
