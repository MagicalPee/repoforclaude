import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type App, createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createServer } from "../src/server.js";

let app: App;
let client: Client;

const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as CallToolResult;
const textOf = (r: CallToolResult) => (r.content[0] as { text: string }).text;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "dim-server-"));
  app = createApp({ config: loadConfig({ DIM_DATA_DIR: dir, DIM_LOG_LEVEL: "error" }) });
  const server = createServer(app);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
  await app.close();
});

describe("MCP server", () => {
  it("starts and advertises all tools with typed schemas", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "analyze_website",
        "check_ui_task",
        "export_research_dataset",
        "generate_design_system",
        "get_design_tokens",
        "get_research_status",
        "list_design_directions",
        "research_websites",
        "search_design_patterns",
        "validate_design_system",
      ].sort(),
    );
    const gen = tools.find((t) => t.name === "generate_design_system")!;
    expect(gen.inputSchema.required).toEqual(["prompt"]);
    expect(Object.keys(gen.inputSchema.properties ?? {})).toEqual(expect.arrayContaining(["prompt", "project_path", "framework", "brand_preferences", "constraints", "redesign"]));
    // No outputSchema on purpose: Claude Code would show the model only structuredContent.
    expect(gen.outputSchema).toBeUndefined();
    expect(gen._meta?.["anthropic/maxResultSizeChars"]).toBe(150_000);
    for (const t of tools) expect(t.description!.length).toBeGreaterThan(60);
    expect(client.getInstructions()).toMatch(/generate_design_system/);
  });

  it("generates a design system as Markdown with an embedded JSON summary", async () => {
    const r = await call("generate_design_system", { prompt: "Landing page for a boutique coffee roaster's subscription", framework: "astro" });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toBeUndefined();
    const summaryJson = /## Summary \(JSON\)\n```json\n([\s\S]+?)\n```/.exec(textOf(r))?.[1];
    const s = JSON.parse(summaryJson!) as Record<string, any>;
    expect(s.id).toMatch(/^ds_/);
    expect(s.colors.light.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(textOf(r)).toContain("## Color");
    expect(textOf(r)).toContain("```css");

    const tokens = await call("get_design_tokens", { design_system_id: s.id, format: "css" });
    expect(textOf(tokens)).toContain("--color-primary:");
    const json = JSON.parse(textOf(await call("get_design_tokens", { design_system_id: s.id })));
    expect(json.colors.light.primary).toBe(s.colors.light.primary);
    const dtcg = JSON.parse(textOf(await call("get_design_tokens", { design_system_id: s.id, format: "dtcg" })));
    expect(dtcg.color.light.primary.$type).toBe("color");
    expect(textOf(await call("get_design_tokens", { design_system_id: s.id, format: "tailwind-v4" }))).toContain("@theme");
  });

  it("returns actionable errors", async () => {
    const missing = await call("get_design_tokens", { design_system_id: "ds_nope" });
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toMatch(/generate_design_system/);
    const none = await call("get_design_tokens", {});
    expect(textOf(none)).toMatch(/Provide design_system_id/);
    const invalid = await call("generate_design_system", { prompt: "" });
    expect(invalid.isError).toBe(true);
    expect(textOf(invalid)).toMatch(/prompt/);
    const badCategory = await call("search_design_patterns", { category: "not-a-category" });
    expect(badCategory.isError).toBe(true);
    const unsafe = await call("analyze_website", { url: "http://127.0.0.1/admin" });
    expect(unsafe.isError).toBe(true);
    expect(textOf(unsafe)).toMatch(/non-public/);
  });

  it("searches patterns and reports research status", async () => {
    const patterns = JSON.parse(textOf(await call("search_design_patterns", { category: "developer-tools", style_keywords: ["dark"], component: "card" })));
    expect(patterns.patterns.length).toBeGreaterThan(0);
    expect(patterns.datasetCoverage.analyzedSources).toBeGreaterThan(0);
    const status = JSON.parse(textOf(await call("get_research_status")));
    expect(status.sources).toBeGreaterThan(500);
    expect(status.categories.length).toBeGreaterThan(10);
    expect(status.cache).toBeDefined();
    expect(status.schemaVersion).toBe(1);
  });

  it("validates tokens and lists directions", async () => {
    const v = JSON.parse(textOf(await call("validate_design_system", { tokens: ":root { --color-text: #aaaaaa; --color-background: #ffffff; }" })));
    expect(v.contrast[0].pass).toBe(false);
    const dirs = JSON.parse(textOf(await call("list_design_directions")));
    expect(dirs).toHaveLength(20);
  });

  it("classifies prompts for the hook", async () => {
    expect(textOf(await call("check_ui_task", { prompt: "Fix the flaky integration test in the payments worker" }))).toBe("");
    expect(textOf(await call("check_ui_task", { prompt: "Build a pricing page with three plans and a dark mode toggle" }))).toMatch(/generate_design_system/);
  });

  it("handles research job control without network access", async () => {
    const cancel = JSON.parse(textOf(await call("research_websites", { cancel_job_id: "job_missing" })));
    expect(cancel.cancelled).toBe(false);
    const resume = await call("research_websites", { resume_job_id: "job_missing" });
    expect(resume.isError).toBe(true);
    expect(textOf(resume)).toMatch(/Unknown job/);
  });

  it("exports the dataset into the data directory", async () => {
    const out = JSON.parse(textOf(await call("export_research_dataset")));
    expect(out.file).toContain(app.config.dataDir);
    expect(out.sources).toBeGreaterThan(500);
  });
});
