import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateDesignSystem } from "../src/design/generator.js";
import { hookHandler, install, mergeHook, uninstall } from "../src/integration/install.js";
import { RULES_MARKDOWN } from "../src/integration/rules.js";
import { classifyUiTask, uiTaskContext } from "../src/integration/uiTask.js";
import { tempStore } from "./helpers.js";

const server = { command: "node", args: ["/opt/design-intelligence-mcp/dist/cli.js", "serve"] };

function fakeClaude() {
  const calls: string[][] = [];
  return { calls, run: (args: string[]) => (calls.push(args), { ok: true, output: "" }) };
}

describe("Claude Code installer", () => {
  it("registers the server, installs rules and merges the hook without losing settings", () => {
    const home = mkdtempSync(join(tmpdir(), "dim-home-"));
    mkdirSync(join(home, ".claude"), { recursive: true });
    const existing = {
      model: "opus",
      permissions: { allow: ["Bash(npm test)"] },
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: "command", command: "echo hi" }] }],
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "./guard.sh" }] }],
      },
    };
    writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify(existing));
    const claude = fakeClaude();
    const actions = install({ scope: "user", hook: "command", rules: true, register: true, projectDir: home, dryRun: false, serverCommand: server, home, runClaude: claude.run });
    expect(actions.every((a) => a.done)).toBe(true);
    expect(claude.calls.at(-1)).toEqual(["mcp", "add", "--scope", "user", "design-intelligence", "--", "node", "/opt/design-intelligence-mcp/dist/cli.js", "serve"]);
    expect(readFileSync(join(home, ".claude", "rules", "design-intelligence.md"), "utf8")).toBe(RULES_MARKDOWN);

    const settings = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
    expect(settings.model).toBe("opus");
    expect(settings.permissions).toEqual(existing.permissions);
    expect(settings.hooks.PreToolUse).toEqual(existing.hooks.PreToolUse);
    expect(settings.hooks.UserPromptSubmit).toHaveLength(2);
    expect(settings.hooks.UserPromptSubmit[1].hooks[0]).toMatchObject({ type: "command", command: "node", args: ["/opt/design-intelligence-mcp/dist/cli.js", "hook"] });
    expect(existsSync(join(home, ".claude", "settings.json.bak"))).toBe(true);

    // Idempotent: a second install replaces our handler instead of duplicating it.
    install({ scope: "user", hook: "mcp_tool", rules: true, register: false, projectDir: home, dryRun: false, serverCommand: server, home });
    const again = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
    expect(again.hooks.UserPromptSubmit).toHaveLength(2);
    expect(again.hooks.UserPromptSubmit[1].hooks[0]).toMatchObject({ type: "mcp_tool", server: "design-intelligence", tool: "check_ui_task", input: { prompt: "${prompt}", cwd: "${cwd}" } });

    uninstall({ scope: "user", register: true, projectDir: home, dryRun: false, home, runClaude: claude.run });
    const removed = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
    expect(removed.hooks.UserPromptSubmit).toEqual(existing.hooks.UserPromptSubmit);
    expect(existsSync(join(home, ".claude", "rules", "design-intelligence.md"))).toBe(false);
    expect(claude.calls.at(-1)).toEqual(["mcp", "remove", "--scope", "user", "design-intelligence"]);
  });

  it("writes project-scoped .mcp.json and settings, and supports dry runs", () => {
    const project = mkdtempSync(join(tmpdir(), "dim-proj-"));
    writeFileSync(join(project, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    const dry = install({ scope: "project", hook: "command", rules: true, register: true, projectDir: project, dryRun: true, serverCommand: server });
    expect(dry.every((a) => !a.done)).toBe(true);
    expect(existsSync(join(project, ".claude"))).toBe(false);
    install({ scope: "project", hook: "command", rules: true, register: true, projectDir: project, dryRun: false, serverCommand: server });
    const mcp = JSON.parse(readFileSync(join(project, ".mcp.json"), "utf8"));
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(["design-intelligence", "other"]);
    expect(mcp.mcpServers["design-intelligence"]).toMatchObject({ type: "stdio", command: "node" });
    expect(existsSync(join(project, ".claude", "rules", "design-intelligence.md"))).toBe(true);
  });

  it("refuses to overwrite invalid settings JSON", () => {
    const home = mkdtempSync(join(tmpdir(), "dim-home-"));
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), "{ not json");
    expect(() => install({ scope: "user", hook: "command", rules: false, register: false, projectDir: home, dryRun: false, serverCommand: server, home })).toThrow(/not valid JSON/);
    expect(readFileSync(join(home, ".claude", "settings.json"), "utf8")).toBe("{ not json");
  });

  it("builds hook handlers in the documented shapes", () => {
    expect(hookHandler("command", server)).toMatchObject({ type: "command", command: "node", args: ["/opt/design-intelligence-mcp/dist/cli.js", "hook"], timeout: 10 });
    expect(mergeHook({}, null)).toEqual({});
  });
});

describe("UI task detection", () => {
  it.each([
    ["Build a landing page for my yoga studio", true],
    ["Redesign the dashboard so it looks less generic", true],
    ["Add a dark mode toggle to the settings page", true],
    ["Create a React component for the pricing table with hover states", true],
    ["Make the website look more premium", true],
    ["Fix the failing database migration in the orders service", false],
    ["Write unit tests for the auth middleware", false],
    ["Update the README with installation steps", false],
    ["Why does this SQL query time out?", false],
    ["Bump eslint and fix the lint errors", false],
  ])("%j → %s", (prompt, expected) => {
    expect(classifyUiTask(prompt).isUiTask).toBe(expected);
  });

  it("ignores pasted material when deciding", () => {
    const prompt = "Summarise this log <pasted_content id=\"1\">website landing page design system colors fonts</pasted_content id=\"1\">";
    expect(classifyUiTask(prompt).isUiTask).toBe(false);
  });

  it("points follow-up work at the stored design system for the project", () => {
    const store = tempStore();
    const project = mkdtempSync(join(tmpdir(), "dim-web-"));
    writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { react: "19.0.0" } }));
    const before = uiTaskContext("Build a landing page for a ceramics studio", project, store);
    expect(before.context).toMatch(/no design-intelligence design system is recorded/);
    const spec = generateDesignSystem(store, { prompt: "Build a landing page for a ceramics studio", projectPath: project });
    const after = uiTaskContext("Add a contact form to the landing page", project, store);
    expect(after.context).toContain(spec.id);
    expect(after.context).toMatch(/get_design_tokens/);
    expect(uiTaskContext("Fix the failing database migration", project, store).context).toBe("");
  });
});
