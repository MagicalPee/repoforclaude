// Post-build smoke test: drives dist/cli.js exactly as Claude Code would (stdio MCP + hook).
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const env = { ...process.env, DIM_DATA_DIR: mkdtempSync(join(tmpdir(), "dim-smoke-")), DIM_LOG_LEVEL: "error" };
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

const transport = new StdioClientTransport({ command: process.execPath, args: [cli, "serve"], env });
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(transport);
const { tools } = await client.listTools();
check("server starts over stdio and lists tools", tools.length === 10, `${tools.length} tools`);
const gen = await client.callTool({ name: "generate_design_system", arguments: { prompt: "Landing page for a neighbourhood bike repair shop", detail: "compact" } });
const genText = gen.content?.[0]?.text ?? "";
const summary = JSON.parse(/## Summary \(JSON\)\n```json\n([\s\S]+?)\n```/.exec(genText)?.[1] ?? "{}");
check("generate_design_system returns a full spec", !gen.isError && genText.includes("## Typography") && summary.id?.startsWith("ds_"), summary.concept);
const status = await client.callTool({ name: "get_research_status", arguments: {} });
check("bundled research snapshot is loaded", JSON.parse(status.content[0].text).analyzedSources >= 15);
await client.close();

const hook = (input) => spawnSync(process.execPath, [cli, "hook"], { input: JSON.stringify(input), env, encoding: "utf8" });
const ui = hook({ prompt: "Redesign the pricing page so it looks premium", cwd: process.cwd() });
check("hook adds context for UI prompts", ui.status === 0 && ui.stdout.includes("generate_design_system"));
const backend = hook({ prompt: "Fix the failing database migration" });
check("hook stays silent for non-UI prompts", backend.status === 0 && backend.stdout === "");
const garbage = spawnSync(process.execPath, [cli, "hook"], { input: "not json", env, encoding: "utf8" });
check("hook never fails on bad input", garbage.status === 0 && garbage.stdout === "");
const version = spawnSync(process.execPath, [cli, "--version"], { env, encoding: "utf8" });
check("cli --version", version.status === 0 && /\d+\.\d+\.\d+/.test(version.stdout), version.stdout.trim());

if (failures.length) {
  console.error(`\n${failures.length} smoke check(s) failed`);
  process.exit(1);
}
console.log("\nAll smoke checks passed");
