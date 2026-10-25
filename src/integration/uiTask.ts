import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Store } from "../db/store.js";
import { projectKeyFor } from "../design/inference.js";

export interface UiTaskDecision {
  isUiTask: boolean;
  score: number;
  positive: string[];
  negative: string[];
}

const POSITIVE: Array<[RegExp, number]> = [
  [/\b(website|web ?site|landing ?page|web ?page|homepage|home page|microsite|storefront|portfolio site)\b/, 3],
  [/\b(ui|user interface|frontend|front-end|front end|web app|webapp|dashboard|admin panel)\b/, 2],
  [/\b(design system|visual design|redesign|restyle|re-style|look and feel|branding|brand identity|theme|theming|dark mode|light mode)\b/, 3],
  [/\b(colou?r palette|colou?rs?|fonts?|typography|typeface|spacing|layout|responsive|mobile layout|grid)\b/, 1.5],
  [/\b(component|components|button|buttons|navbar|nav bar|navigation|header|footer|hero|card|cards|modal|dialog|form|forms|sidebar|pricing page|pricing table)\b/, 1],
  [/\b(css|tailwind|styled-components|scss|sass|css modules|shadcn)\b/, 1.5],
  [/\b(beautiful|prettier|nicer|modern look|looks? (bad|ugly|dated|generic)|make it look|polish(ed)?|aesthetic|visually|animation|animations|(hover|focus|active) (effects?|states?))\b/, 2],
  [/\b(react|next\.?js|vue|nuxt|svelte|astro|html page|jsx|tsx)\b/, 0.75],
  [/\b(build|create|make|design|redesign|improve|add|implement)\b/, 0.5],
];

const NEGATIVE: Array<[RegExp, number]> = [
  [/\b(backend|back-end|api endpoint|rest api|graphql resolver|database|db schema|migration|migrations|sql|query|orm|prisma schema)\b/, 2.5],
  [/\b(unit tests?|test suite|failing tests?|jest|vitest|pytest|ci pipeline|github actions|ci\/cd|deploy script|dockerfile|kubernetes manifest|helm)\b/, 2.5],
  [/\b(readme|changelog|docstring|documentation typo|typo|commit message|rebase|merge conflict|git )\b/, 2],
  [/\b(stack trace|exception|segfault|memory leak|race condition|null pointer|type error|typescript error|lint errors?|eslint)\b/, 1.5],
  [/\b(cron|queue worker|webhook handler|auth logic|jwt|oauth flow|rate limit|caching layer|cli tool|script that)\b/, 1.5],
  [/\b(explain|what does|why does|how does)\b/, 1],
];

/** Decides, from the prompt alone, whether visual UI decisions are likely to be made. */
export function classifyUiTask(rawPrompt: string): UiTaskDecision {
  // Pasted material is context, not the request; weigh only what the user typed.
  const prompt = rawPrompt.replace(/<pasted_content[^>]*>[\s\S]*?<\/pasted_content[^>]*>/g, " ").toLowerCase();
  const positive: string[] = [];
  const negative: string[] = [];
  let pos = 0;
  let neg = 0;
  // Each pattern counts up to two distinct matches ("navbar … footer" is stronger than one).
  const score = (patterns: Array<[RegExp, number]>, hits: string[]) => {
    let total = 0;
    for (const [re, w] of patterns) {
      const found = [...new Set([...prompt.matchAll(new RegExp(re.source, "g"))].map((m) => m[0]))].slice(0, 2);
      total += w * found.length;
      hits.push(...found);
    }
    return total;
  };
  pos = score(POSITIVE, positive);
  neg = score(NEGATIVE, negative);
  const net = Math.round((pos - neg) * 10) / 10;
  return { isUiTask: pos >= 2.5 && net >= 1.5, score: net, positive, negative };
}

function looksLikeWebProject(dir: string): boolean {
  try {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = readFileSync(pkgPath, "utf8");
      return /"(react|next|vue|nuxt|svelte|@sveltejs\/kit|astro|@angular\/core|solid-js|tailwindcss|vite|gatsby|@remix-run\/react)"/.test(pkg);
    }
    return existsSync(join(dir, "index.html"));
  } catch {
    return false;
  }
}

export interface UiContextResult {
  decision: UiTaskDecision;
  context: string;
}

/**
 * Builds the factual context line the UserPromptSubmit hook adds. Returns an empty string for
 * prompts that are not UI work, so unrelated tasks get no extra tokens and no latency.
 */
export function uiTaskContext(prompt: string, cwd: string | undefined, store?: Store): UiContextResult {
  const decision = classifyUiTask(prompt);
  if (!decision.isUiTask) {
    // A web project nudges borderline prompts ("make the header sticky") over the line.
    const borderline = decision.score >= 0.5 && decision.positive.length >= 2;
    if (!(borderline && cwd && looksLikeWebProject(cwd))) return { decision, context: "" };
    decision.isUiTask = true;
  }
  let projectDir: string | undefined;
  try {
    if (cwd && existsSync(cwd) && statSync(cwd).isDirectory()) projectDir = realpathSync(cwd);
  } catch {
    projectDir = undefined;
  }
  let existing: { id: string; concept: string; direction: string } | undefined;
  if (projectDir) {
    const row = store?.latestDesignSystemForProject(projectKeyFor("", projectDir));
    if (row) {
      try {
        const spec = JSON.parse(row.spec_json) as { id: string; direction: { concept: string; name: string } };
        existing = { id: spec.id, concept: spec.direction.concept, direction: spec.direction.name };
      } catch {
        existing = undefined;
      }
    }
    const file = join(projectDir, ".design-intelligence", "design-system.json");
    if (!existing && existsSync(file)) {
      try {
        const spec = JSON.parse(readFileSync(file, "utf8")) as { id: string; direction: { concept: string; name: string } };
        existing = { id: spec.id, concept: spec.direction.concept, direction: spec.direction.name };
      } catch {
        existing = undefined;
      }
    }
  }
  const where = projectDir ? ` (project: ${projectDir})` : "";
  const context = existing
    ? `design-intelligence: this request involves UI/visual design work${where}. The project already has design system ${existing.id} ("${existing.concept}", direction ${existing.direction}) from the design-intelligence MCP server. Its tokens and component rules are available through the get_design_tokens tool (design_system_id: "${existing.id}"); they are the source of truth for visual decisions unless the user asks for a redesign, in which case generate_design_system with redesign=true creates a new one.`
    : `design-intelligence: this request involves UI/visual design work${where} and no design-intelligence design system is recorded for it yet. The design-intelligence MCP server's generate_design_system tool returns a tailored, implementation-ready UI design specification (colors, typography, spacing, components, motion, tokens) when given the user's request as prompt${projectDir ? ` and "${projectDir}" as project_path` : ""}; it is meant to be called before visual design decisions are made. Existing project styles are detected and preserved automatically.`;
  return { decision, context };
}
