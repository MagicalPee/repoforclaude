import { cpSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, hueFamily, toOklch } from "../src/analysis/color.js";
import { generateDesignSystem } from "../src/design/generator.js";
import { inferProject } from "../src/design/inference.js";
import { renderSpecMarkdown } from "../src/design/render.js";
import { inspectRepository } from "../src/design/repoInspector.js";
import { validateDesignSystem } from "../src/design/validator.js";
import { DIRECTIONS } from "../src/knowledge/directions.js";
import { FIXTURES, tempStore } from "./helpers.js";

function copyFixture(name: string): string {
  const dir = join(mkdtempSync(join(tmpdir(), "dim-proj-")), name);
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

describe("project inference", () => {
  it.each([
    ["Build a landing page for an AI contract review tool for law firms", "ai-products"],
    ["Create an online store for handmade ceramic mugs", "ecommerce"],
    ["Dark dashboard for monitoring Kubernetes clusters for platform engineers", "developer-tools"],
    ["Website for my smash burger restaurant with menu and opening hours", "food-hospitality"],
    ["Landing page for a budgeting app for young couples", "fintech"],
    ["Launch site for an indie roguelike game on Steam", "gaming"],
    ["Portfolio site for a freelance photographer", "portfolio"],
    ["Online therapy booking for anxious patients", "health-wellness"],
  ])("detects the category of %j", (prompt, category) => {
    expect(inferProject({ prompt }).category).toBe(category);
  });

  it("extracts explicit preferences, negations and constraints", () => {
    const p = inferProject({
      prompt: "A kids coding course platform built with Next.js and Tailwind. Playful, avoid gradients, use navy and yellow, no purple. Must meet WCAG AAA, system fonts only, sharp corners.",
    });
    expect(p.explicit.colors.map((c) => c.source)).toEqual(['"navy" in brief', '"yellow" in brief']);
    expect(p.explicit.avoidColors).toContain("purple");
    expect(p.explicit.avoidStyles).toContain("gradients");
    expect(p.explicit.constraints).toMatchObject({ wcag: "AAA", noGradients: true, systemFontsOnly: true, corners: "sharp" });
    expect(p.explicit.framework).toBe("nextjs");
    expect(p.explicit.styling).toBe("tailwind");
    expect(p.audience).toContain("kids and families");
    expect(p.traits.playfulness).toBeGreaterThan(0.5);
  });

  it("detects mode requests, hex colors and named fonts", () => {
    expect(inferProject({ prompt: "SaaS analytics app with a dark mode UI" }).explicit.mode).toBe("dark");
    expect(inferProject({ prompt: "marketing site, support dark mode toggle" }).explicit.mode).toBe("both");
    const p = inferProject({ prompt: "Use #e4572e as the brand color and Space Grotesk for headings" });
    expect(p.explicit.colors[0]?.hex).toBe("#e4572e");
    expect(p.explicit.fonts).toContain("Space Grotesk");
  });

  it("does not treat incidental color words as preferences", () => {
    expect(inferProject({ prompt: "A site for Orange County dentists" }).explicit.colors).toEqual([]);
  });
});

describe("repository inspection", () => {
  it("detects an established design system with brand-named variables", () => {
    const r = inspectRepository(copyFixture("existing-astro"));
    expect(r.framework.id).toBe("astro");
    expect(r.established).toBe(true);
    expect(r.fonts.map((f) => f.family)).toEqual(expect.arrayContaining(["Fraunces", "Hanken Grotesk"]));
    expect(r.observed).toMatchObject({ background: "#fbf6ee", text: "#2a1d14", headingFont: "Fraunces", bodyFont: "Hanken Grotesk" });
    expect(r.observed?.brandCandidates[0]).toBe("#b5562b");
    expect(r.tokens.colors.find((c) => c.name === "--crust")?.hex).toBe("#b5562b");
    expect(r.styling.globalCss).toContain("src/styles/global.css");
  });

  it("detects Tailwind v4 and next/font usage", () => {
    const r = inspectRepository(copyFixture("tailwind-v4"));
    expect(r.framework.id).toBe("nextjs");
    expect(r.styling.tailwind?.version).toBe(4);
    expect(r.fonts.map((f) => f.family)).toEqual(expect.arrayContaining(["Geist", "Geist Mono"]));
    expect(r.tokens.colors.find((c) => c.name === "--color-brand")?.hex).toBe("#0e7490");
  });

  it("parses a Tailwind v3 config without executing it", () => {
    const dir = copyFixture("tailwind-v3");
    const r = inspectRepository(dir);
    expect(existsSync(join(dir, "EXECUTED.marker"))).toBe(false);
    expect(r.styling.tailwind?.version).toBe(3);
    expect(r.tokens.colors.map((c) => c.hex)).toEqual(expect.arrayContaining(["#111827", "#7c2d12"]));
    expect(r.tokens.fonts.find((f) => f.name.includes("display"))?.value).toBe("Bricolage Grotesque");
  });

  it("handles missing and relative paths", () => {
    expect(inspectRepository("/definitely/not/here").exists).toBe(false);
    expect(inspectRepository("relative/path").warnings[0]).toMatch(/absolute/);
  });
});

const PROMPTS = [
  "Build a landing page for an AI-powered contract review tool for law firms. Trustworthy and premium.",
  "Create an online store for handmade ceramic mugs. Warm, earthy, cozy.",
  "Dark mode dashboard for monitoring Kubernetes clusters, dense data tables, for platform engineers",
  "Website for my smash burger restaurant, bold and fun, with menu and opening hours",
  "A kids coding course platform, playful and colorful",
  "Portfolio site for a freelance photographer",
  "Landing page for a budgeting app for young couples",
  "Launch site for an indie roguelike game on Steam",
  "Website for a boutique hotel in Lisbon, luxury and calm",
  "Online therapy booking for anxious patients",
  "Government portal for renewing parking permits",
  "Magazine about architecture and urbanism with long-form essays",
  "Note-taking app for researchers",
  "Branding agency website showcasing case studies",
];

describe("design system generation", () => {
  it("is deterministic for the same brief and project", () => {
    const a = generateDesignSystem(undefined, { prompt: PROMPTS[1]! });
    const b = generateDesignSystem(undefined, { prompt: PROMPTS[1]! });
    expect(a.direction.id).toBe(b.direction.id);
    expect(a.color.light?.primary?.hex).toBe(b.color.light?.primary?.hex);
    expect(a.typography.heading.family).toBe(b.typography.heading.family);
  });

  it("produces varied, contrast-safe systems across briefs", () => {
    const store = tempStore();
    const specs = PROMPTS.map((prompt) => generateDesignSystem(store, { prompt }));
    const directions = new Set(specs.map((s) => s.direction.id));
    const headingFonts = new Set(specs.map((s) => s.typography.heading.family));
    const primaries = new Set(specs.map((s) => (s.color.light ?? s.color.dark)!.primary!.hex));
    expect(directions.size).toBeGreaterThanOrEqual(9);
    expect(headingFonts.size).toBeGreaterThanOrEqual(9);
    expect(primaries.size).toBe(PROMPTS.length);
    for (const spec of specs) {
      const failing = spec.color.contrast.filter((c) => !c.pass);
      expect(failing, `${spec.project.summary}: ${JSON.stringify(failing)}`).toEqual([]);
      expect(spec.validation.issues.filter((i) => i.severity === "error")).toEqual([]);
      expect(spec.typography.scale.steps).toHaveLength(10);
      expect(spec.direction.alternativesConsidered).toHaveLength(3);
      expect(spec.tokens.css).toContain("--color-primary:");
      expect(spec.tokens.css).toContain("prefers-reduced-motion");
    }
    // Specific expectations that encode design judgement.
    const byPrompt = (i: number) => specs[i]!;
    expect(byPrompt(2).color.defaultMode).toBe("dark");
    expect(byPrompt(7).color.defaultMode).toBe("dark");
    expect(["gallery-minimal", "swiss-grid", "kinetic-studio"]).toContain(byPrompt(5).direction.id);
    expect(["civic-clarity"]).toContain(byPrompt(10).direction.id);
    expect(byPrompt(10).typography.scale.basePx).toBeGreaterThanOrEqual(18);
  });

  it("varies repeated generic briefs instead of converging on one look", () => {
    const store = tempStore();
    const looks = ["Landing page for a SaaS startup", "Landing page for a SaaS company", "Landing page for a SaaS tool", "Landing page for a SaaS product"].map((prompt) => {
      const s = generateDesignSystem(store, { prompt });
      return `${s.direction.id}|${s.color.light?.primary?.hex}|${s.typography.heading.family}`;
    });
    expect(new Set(looks).size).toBe(4);
  });

  it("honours explicit colors, avoided hues and constraints", () => {
    const s = generateDesignSystem(undefined, { prompt: "Fintech app landing page", brandPreferences: "brand color #e4572e", constraints: "system fonts only, sharp corners" });
    expect(s.color.light?.primary?.hex).toBe("#e4572e");
    expect(s.color.primarySource).toBe("explicit");
    expect(s.typography.heading.source).toBe("system");
    expect(s.shape.radius.md).toBe("2px");
    const ai = generateDesignSystem(undefined, { prompt: "Landing page for an AI writing assistant" });
    const theme = ai.color.light ?? ai.color.dark!;
    expect(["violet", "indigo", "magenta"]).not.toContain(hueFamily(toOklch(theme.primary!.hex)!));
  });

  it("preserves an established design system and reuses stored specs", () => {
    const store = tempStore();
    const dir = copyFixture("existing-astro");
    const spec = generateDesignSystem(store, { prompt: "Add a catering page to the bakery site", projectPath: dir });
    expect(spec.existingDesignSystem.preserved).toBe(true);
    expect(spec.color.light?.primary?.hex).toBe("#b5562b");
    expect(spec.color.light?.background?.hex).toBe("#fbf6ee");
    expect(spec.typography.heading).toMatchObject({ family: "Fraunces", source: "existing" });
    expect(spec.existingDesignSystem.mapping).toEqual(expect.arrayContaining([{ existing: "--crust", token: "primary" }]));
    expect(spec.implementation.framework).toBe("astro");
    expect(spec.implementation.tokenFile).toBe("src/styles/global.css");

    const followUp = generateDesignSystem(store, { prompt: "Now add an FAQ section", projectPath: dir });
    expect(followUp.reused).toBe(true);
    expect(followUp.id).toBe(spec.id);
    const redesign = generateDesignSystem(store, { prompt: "Redesign everything, new look", projectPath: dir, redesign: true });
    expect(redesign.id).not.toBe(spec.id);
    expect(redesign.existingDesignSystem.preserved).toBe(false);
  });

  it("writes spec files and Tailwind output when asked", () => {
    const dir = copyFixture("tailwind-v4");
    const spec = generateDesignSystem(undefined, { prompt: "Marketing site for a developer API product", projectPath: dir, writeFiles: true });
    expect(spec.files).toEqual([".design-intelligence/design-system.json", ".design-intelligence/tokens.css"]);
    expect(JSON.parse(readFileSync(join(dir, ".design-intelligence/design-system.json"), "utf8")).id).toBe(spec.id);
    expect(spec.tokens.tailwindV4).toContain("@theme {");
    expect(spec.implementation.styling).toBe("tailwind-v4");
    expect(spec.implementation.snippets["app/layout.tsx"]).toContain("next/font/google");
  });

  it("supports forcing a direction and rejects unknown ones", () => {
    const s = generateDesignSystem(undefined, { prompt: "Bakery website", directionId: "neo-brutalist" });
    expect(s.direction.id).toBe("neo-brutalist");
    expect(() => generateDesignSystem(undefined, { prompt: "Bakery website", directionId: "nope" })).toThrow(/Unknown direction/);
    expect(DIRECTIONS).toHaveLength(20);
  });

  it("renders a readable markdown spec within tool output limits", () => {
    const md = renderSpecMarkdown(generateDesignSystem(undefined, { prompt: PROMPTS[0]! }));
    expect(md).toContain("## Typography");
    expect(md).toContain("```css");
    expect(md.length).toBeLessThan(45_000);
  });
});

describe("validator", () => {
  it("flags contrast, hierarchy, duplicates, off-grid spacing, radius order and missing states", () => {
    const result = validateDesignSystem(
      {
        color: { text: "#999999", background: "#ffffff", primary: "#ffcc00", "on-primary": "#ffffff", accent: "#ffcc00", error: "#ff8888" },
        typography: { h1: "24px", h2: "32px", body: "13px" },
        spacing: { a: "4px", b: "13px", c: "16px" },
        radius: { sm: "8px", md: "4px" },
      },
      { button: { states: { hover: {} } } },
    );
    const cats = result.issues.map((i) => i.category);
    expect(cats).toEqual(expect.arrayContaining(["contrast", "typography", "duplicates", "spacing", "radius", "missing", "components"]));
    expect(result.score).toBeLessThan(50);
    expect(result.contrast.find((c) => c.pair === "text on background")?.pass).toBe(false);
  });

  it("accepts CSS custom properties and passes a generated system", () => {
    const spec = generateDesignSystem(undefined, { prompt: "Note-taking app for researchers" });
    const result = validateDesignSystem(spec.tokens.css);
    expect(result.contrast.length).toBeGreaterThan(5);
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
    const check = (fg: string, bg: string) => contrastRatio(spec.color.light!.text!.hex, spec.color.light!.background!.hex) >= 7;
    expect(check("text", "background")).toBe(true);
  });
});
