import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hueFamily, toOklch } from "../analysis/color.js";
import type { Store } from "../db/store.js";
import { type DesignDirection, DIRECTIONS, getDirection } from "../knowledge/directions.js";
import { log } from "../logger.js";
import { type CategoryStats, computeCategoryStats } from "../patterns/miner.js";
import { searchPatterns } from "../patterns/search.js";
import type { HueFamily } from "../types.js";
import { type ComponentSpec, generateComponents } from "./components.js";
import { toCss, toDtcg, toTailwindV3, toTailwindV4 } from "./exporters.js";
import {
  generateLayout,
  generateMotion,
  generateShape,
  generateSpacing,
  type LayoutSpec,
  type MotionSpec,
  type ShapeSpec,
  type SpacingSpec,
} from "./foundations.js";
import { buildImplementationGuide, type ImplementationGuide } from "./implementation.js";
import { hash, inferProject, type ProjectProfile, projectKeyFor, type Trait } from "./inference.js";
import { generatePalette, type PaletteSpec } from "./palette.js";
import { inspectRepository, type RepoInspection } from "./repoInspector.js";
import { explainRejection, scoreDirections } from "./scoring.js";
import { generateTypography, type TypographySpec } from "./typography.js";
import { type ValidationResult, validateDesignSystem } from "./validator.js";

export const SPEC_VERSION = 1;

export interface GenerateInput {
  prompt: string;
  projectPath?: string;
  framework?: string;
  brandPreferences?: string;
  constraints?: string;
  /** Ignore an existing design system / previous spec and choose a new direction. */
  redesign?: boolean;
  /** Force a specific direction id (see list_directions in README). */
  directionId?: string;
  /** Write .design-intelligence/design-system.json and tokens.css into projectPath. */
  writeFiles?: boolean;
}

export interface DesignSystemSpec {
  id: string;
  specVersion: number;
  createdAt: string;
  reused?: boolean;
  project: {
    summary: string;
    category: string;
    secondaryCategory?: string;
    websiteType: string;
    audience: string[];
    personality: string[];
    traits: ProjectProfile["traits"];
    explicitPreferences: ProjectProfile["explicit"];
    inferenceSignals: string[];
    inferenceConfidence: number;
  };
  existingDesignSystem: {
    inspected: boolean;
    established: boolean;
    preserved: boolean;
    summary: string;
    framework?: string;
    preservedValues: string[];
    mapping: Array<{ existing: string; token: string }>;
  };
  direction: {
    id: string;
    name: string;
    concept: string;
    description: string;
    mood: string[];
    personality: string[];
    whyItFits: string[];
    researchEvidence: string[];
    patternsToAdopt: string[];
    patternsToAvoid: string[];
    signatureMoves: string[];
    originalityStrategy: string;
    alternativesConsidered: Array<{ id: string; name: string; score: number; whyNotChosen: string }>;
    selectionScore: number;
  };
  color: PaletteSpec;
  typography: TypographySpec;
  spacing: SpacingSpec;
  layout: LayoutSpec;
  shape: ShapeSpec;
  motion: MotionSpec;
  iconography: DesignDirection["icons"];
  components: Record<string, ComponentSpec>;
  responsive: string[];
  accessibility: string[];
  tokens: { css: string; tailwindV4?: string; tailwindV3?: string; dtcg: Record<string, unknown> };
  implementation: ImplementationGuide;
  validation: Pick<ValidationResult, "score" | "summary" | "issues">;
  evidence: {
    datasetCoverage: { category: string; analyzedInCategory: number; websites: number; designSystems: number; analyzedOverall: number };
    observedConventions: string[];
    patternsUsed: Array<{ id: string; name: string; origin: string; confidence: number }>;
    note: string;
  };
  confidence: { overall: number; inference: number; research: number; selectionMargin: number; notes: string[] };
  files?: string[];
}

const TRAIT_WORDS: Record<Trait, [string, string]> = {
  energy: ["energetic", "calm"],
  playfulness: ["playful", "serious"],
  sophistication: ["refined", "approachable"],
  warmth: ["warm", "cool-toned"],
  techness: ["technical", "organic"],
  density: ["information-rich", "spacious"],
  boldness: ["bold", "understated"],
};

function personality(traits: ProjectProfile["traits"]): string[] {
  return (Object.entries(traits) as Array<[Trait, number]>)
    .filter(([, v]) => Math.abs(v) >= 0.3)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 4)
    .map(([t, v]) => TRAIT_WORDS[t][v > 0 ? 0 : 1]);
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// Everyday color words cover several hue families ("purple" spans violet through magenta).
const COLOR_FAMILY_WORDS: Record<string, HueFamily[]> = {
  purple: ["violet", "indigo", "magenta"],
  violet: ["violet"],
  lavender: ["violet"],
  lilac: ["violet"],
  indigo: ["indigo"],
  blue: ["blue"],
  navy: ["blue"],
  cobalt: ["blue"],
  teal: ["teal"],
  turquoise: ["teal"],
  cyan: ["cyan"],
  green: ["green"],
  emerald: ["green"],
  lime: ["lime"],
  yellow: ["yellow"],
  mustard: ["yellow"],
  gold: ["yellow"],
  orange: ["orange"],
  amber: ["orange"],
  red: ["red"],
  crimson: ["red"],
  burgundy: ["red"],
  pink: ["pink"],
  magenta: ["magenta"],
  fuchsia: ["magenta"],
  brown: ["orange"],
};

function recentHistory(store: Store | undefined): { directions: string[]; hues: number[]; fonts: string[] } {
  if (!store) return { directions: [], hues: [], fonts: [] };
  const rows = store.db.prepare("SELECT direction_id, spec_json FROM design_systems ORDER BY created_at DESC, rowid DESC LIMIT 8").all() as Array<{ direction_id: string; spec_json: string }>;
  const hues: number[] = [];
  const fonts: string[] = [];
  for (const r of rows) {
    try {
      const spec = JSON.parse(r.spec_json) as DesignSystemSpec;
      const primary = spec.color.light?.primary?.hex ?? spec.color.dark?.primary?.hex;
      const c = primary ? toOklch(primary) : null;
      if (c && c.c > 0.04) hues.push(c.h);
      fonts.push(spec.typography.heading.family, spec.typography.body.family);
    } catch {
      /* ignore malformed history */
    }
  }
  return { directions: rows.map((r) => r.direction_id), hues, fonts };
}

function chooseModes(profile: ProjectProfile, direction: DesignDirection, repo?: RepoInspection, preserve?: boolean): { modes: Array<"light" | "dark">; defaultMode: "light" | "dark" } {
  const explicit = profile.explicit.mode;
  if (explicit === "both") return { modes: ["light", "dark"], defaultMode: direction.color.mode === "dark" ? "dark" : "light" };
  if (explicit === "dark") return { modes: ["dark", "light"].filter((m) => m === "dark" || ["web-app", "dashboard", "documentation"].includes(profile.websiteType)) as Array<"light" | "dark">, defaultMode: "dark" };
  if (explicit === "light") return { modes: ["light"], defaultMode: "light" };
  if (preserve && repo?.observed) {
    const bg = repo.observed.background;
    const dark = bg ? (toOklch(bg)?.l ?? 1) < 0.45 : false;
    return { modes: repo.observed.supportsDarkMode ? ["light", "dark"] : [dark ? "dark" : "light"], defaultMode: dark ? "dark" : "light" };
  }
  const appLike = ["web-app", "dashboard", "documentation"].includes(profile.websiteType) || ["developer-tools", "productivity", "ai-products"].includes(profile.category);
  if (direction.color.mode === "dark") return { modes: appLike ? ["dark", "light"] : ["dark"], defaultMode: "dark" };
  return { modes: appLike ? ["light", "dark"] : ["light"], defaultMode: "light" };
}

function densityFor(direction: DesignDirection, profile: ProjectProfile): "compact" | "comfortable" | "airy" {
  if (profile.traits.density >= 0.6) return "compact";
  if (profile.traits.density <= -0.5) return "airy";
  if (profile.websiteType === "dashboard" && direction.layout.density === "airy") return "comfortable";
  return direction.layout.density;
}

export function loadSpec(store: Store | undefined, id: string): DesignSystemSpec | undefined {
  const row = store?.getDesignSystem(id);
  return row ? (JSON.parse(row.spec_json) as DesignSystemSpec) : undefined;
}

export function latestSpecForProject(store: Store | undefined, projectPath: string): DesignSystemSpec | undefined {
  const row = store?.latestDesignSystemForProject(projectKeyFor("", projectPath));
  return row ? (JSON.parse(row.spec_json) as DesignSystemSpec) : undefined;
}

export function generateDesignSystem(store: Store | undefined, input: GenerateInput): DesignSystemSpec {
  const profile = inferProject({ prompt: input.prompt, brandPreferences: input.brandPreferences, constraints: input.constraints, framework: input.framework });
  const repo = input.projectPath ? inspectRepository(input.projectPath) : undefined;
  const projectKey = projectKeyFor(input.prompt, repo?.exists ? repo.path : undefined);

  // Follow-up work reuses the stored decision unless a redesign is requested.
  if (!input.redesign && !input.directionId && repo?.exists) {
    const previous = store?.latestDesignSystemForProject(projectKey);
    const fromFile = repo.existingSpec?.id && store ? store.getDesignSystem(repo.existingSpec.id) : undefined;
    const row = previous ?? fromFile;
    if (row) {
      const spec = JSON.parse(row.spec_json) as DesignSystemSpec;
      return { ...spec, reused: true };
    }
  }

  const preserveExisting = Boolean(repo?.established && !input.redesign);
  const seed = hash(`${projectKey}|${profile.summary}`);
  const history = recentHistory(store);
  let stats: CategoryStats | undefined;
  let overall: CategoryStats | undefined;
  try {
    stats = store ? computeCategoryStats(store, profile.category) : undefined;
    overall = store ? computeCategoryStats(store) : undefined;
  } catch (error) {
    log.warn("research stats unavailable; continuing with heuristics only", { error: (error as Error).message });
  }

  const scored = scoreDirections(profile, { stats, recentDirections: history.directions, seed, repo, preserveExisting });
  const forced = input.directionId ? getDirection(input.directionId) : undefined;
  if (input.directionId && !forced) throw new Error(`Unknown direction "${input.directionId}". Known: ${DIRECTIONS.map((d) => d.id).join(", ")}`);
  const winner = forced ? (scored.find((s) => s.direction.id === forced.id) ?? scored[0]!) : scored[0]!;
  const direction = winner.direction;
  const alternatives = scored.filter((s) => s.direction.id !== direction.id).slice(0, 3);

  const { modes, defaultMode } = chooseModes(profile, direction, repo, preserveExisting);
  const avoidFamilies = [...new Set(profile.explicit.avoidColors.flatMap((c) => COLOR_FAMILY_WORDS[c] ?? []))];
  // Indigo/violet gradients are the most generic AI look; steer away unless the brief asks for them.
  if (profile.category === "ai-products" && !profile.explicit.colors.some((c) => ["violet", "indigo", "magenta"].includes(hueFamily(toOklch(c.hex)!)))) {
    for (const f of ["violet", "indigo"] as HueFamily[]) if (!avoidFamilies.includes(f)) avoidFamilies.push(f);
  }
  const observed = preserveExisting ? repo?.observed : undefined;
  const palette = generatePalette({
    direction,
    seed,
    modes,
    defaultMode,
    explicitColors: profile.explicit.colors.map((c) => c.hex),
    avoidFamilies,
    recentHues: history.hues,
    existing: observed
      ? {
          primary: observed.brandCandidates[0],
          secondary: observed.brandCandidates[1],
          accent: observed.brandCandidates[2],
          background: observed.background,
          text: observed.text,
        }
      : undefined,
    wcag: profile.explicit.constraints.wcag,
  });

  const density = densityFor(direction, profile);
  const typography = generateTypography({
    direction,
    traits: profile.traits,
    seed,
    styleKeywords: profile.explicit.styleKeywords,
    explicitFonts: profile.explicit.fonts,
    existingFonts: observed
      ? {
          heading: observed.headingFont ?? repo?.fonts[0]?.family,
          body: observed.bodyFont ?? repo?.fonts[1]?.family ?? repo?.fonts[0]?.family,
          mono: observed.monoFont,
        }
      : undefined,
    recentFonts: history.fonts,
    systemFontsOnly: profile.explicit.constraints.systemFontsOnly,
    density,
    audience: profile.audience,
    websiteType: profile.websiteType,
  });

  const spacing = generateSpacing(direction, density);
  const layout = generateLayout(direction, profile.websiteType);
  const theme = palette.light ?? palette.dark!;
  const shape = generateShape(direction, direction.shape.elevation === "hard-offset" ? theme.text!.hex : (palette.light?.text?.hex ?? "#111111"), theme.primary!.hex, profile.explicit.constraints.corners);
  const motion = generateMotion(direction, profile.explicit.constraints.noAnimation);
  const components = generateComponents(direction, profile.websiteType, density);

  const id = `ds_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const concept = preserveExisting
    ? `Existing system, extended with ${direction.name} conventions`
    : `${direction.name} — ${titleCase(palette.primaryLabel || "brand")}`;
  const tokenSource = { id, concept, palette, typography, spacing, layout, shape, motion };

  // Existing variables that equal generated tokens become aliases instead of replacements.
  const mapping: Array<{ existing: string; token: string }> = [];
  if (preserveExisting && repo) {
    const light = palette.light ?? {};
    for (const t of repo.tokens.colors) {
      const match = Object.entries(light).find(([k, v]) => v.hex === t.hex && !mapping.some((m) => m.token === k));
      if (match && t.name.startsWith("--") && !t.name.startsWith(`--color-${match[0]}`)) mapping.push({ existing: t.name, token: match[0] });
    }
  }

  const styling = repo?.styling.tailwind ? "tailwind" : profile.explicit.styling;
  const implementation = buildImplementationGuide({
    framework: profile.explicit.framework ?? input.framework,
    styling,
    repo,
    typography,
    preserveExisting,
    tailwindVersion: repo?.styling.tailwind?.version,
    existingMapping: mapping,
  });
  const wantsTailwind = styling === "tailwind";
  const tokens = {
    css: toCss(tokenSource),
    tailwindV4: wantsTailwind && repo?.styling.tailwind?.version !== 3 ? toTailwindV4(tokenSource) : undefined,
    tailwindV3: wantsTailwind && repo?.styling.tailwind?.version === 3 ? toTailwindV3(tokenSource) : undefined,
    dtcg: toDtcg(tokenSource),
  };

  const validation = validateDesignSystem(
    {
      color: { light: palette.light, dark: palette.dark },
      typography: Object.fromEntries(Object.entries(typography.styles).map(([k, s]) => [k, `${typography.scale.steps.find((x) => x.token === s.step)?.px}px`])),
      radius: Object.fromEntries(Object.entries(shape.radius).filter(([k]) => ["xs", "sm", "md", "lg", "xl"].includes(k))),
    },
    Object.fromEntries(Object.entries(components).filter(([k]) => ["button", "input"].includes(k))),
  );

  // ----- evidence -----
  const observedConventions: string[] = [];
  if (stats && stats.sampleSize > 0) {
    for (const dim of ["colorMode", "radiusFamily", "headingClass", "density", "paletteCharacter"] as const) {
      const top = stats.dimensions[dim]?.values[0];
      const known = stats.dimensions[dim]?.known ?? 0;
      if (top && known >= 2) observedConventions.push(`${dim}: "${top.value}" in ${top.count}/${known} analyzed ${profile.category} sources (e.g. ${top.examples.slice(0, 2).map((e) => e.name).join(", ")})`);
    }
    if (stats.numeric.bodySizePx) observedConventions.push(`median body size ${stats.numeric.bodySizePx.median}px (n=${stats.numeric.bodySizePx.n})`);
    const font = stats.fonts.heading[0];
    if (font && font.count >= 2) observedConventions.push(`most common heading font: ${font.value} (${font.count} sources) — avoided as a default to stay distinctive`);
  }
  const patternHits = store
    ? searchPatterns(store, { category: profile.category, keywords: [...profile.explicit.styleKeywords, profile.websiteType, ...direction.personality], limit: 8 })
    : [];
  const heuristics = patternHits.filter((p) => p.origin === "curated_heuristic" && p.kind === "guideline").slice(0, 4);
  const antiPatterns = patternHits.filter((p) => p.kind === "anti_pattern").slice(0, 3);
  const mined = patternHits.filter((p) => p.origin === "mined").slice(0, 3);

  const researchEvidence = [
    ...(stats && stats.sampleSize > 0
      ? [`${stats.sampleSize} analyzed source(s) in ${profile.category} (${stats.websites} websites, ${stats.designSystems} design systems) informed the scoring.`]
      : [`No analyzed sources in ${profile.category} yet; this decision relies on curated heuristics. Run research_websites with category="${profile.category}" to add evidence.`]),
    ...observedConventions.slice(0, 4),
    ...mined.map((m) => `${m.name}: ${m.description}`),
  ];

  const signature = direction.signatures[0]?.replace(/\.$/, "") ?? direction.name;
  const originalityStrategy =
    `Differentiate through one owned signature (${signature.charAt(0).toLowerCase()}${signature.slice(1)}), ` +
    (observedConventions.length ? "while keeping the category conventions that aid recognition (see research evidence). " : "while following category usability conventions. ") +
    "Reference sites contribute only aggregate statistics: do not reproduce any single site's layout, imagery, illustrations, logo, copy or exact color pairing.";

  const inferenceConf = profile.confidence;
  const researchConf = stats ? Math.min(1, stats.sampleSize / 12) : 0;
  const margin = alternatives[0] ? Math.min(1, Math.max(0, (winner.score - alternatives[0].score) / 2)) : 1;
  const validationConf = validation.score / 100;
  const overallConf = Math.round((0.35 * inferenceConf + 0.2 * researchConf + 0.25 * Math.max(0.3, margin) + 0.2 * validationConf) * 100) / 100;
  const confidenceNotes: string[] = [];
  if (inferenceConf < 0.4) confidenceNotes.push("The brief gave few signals about the product; category and personality are partly assumed. Restating audience and tone would sharpen the result.");
  if (researchConf < 0.3) confidenceNotes.push("Little research data exists for this category; treat evidence-based scoring as weak.");
  if (margin < 0.15 && alternatives[0]) confidenceNotes.push(`"${alternatives[0].direction.name}" scored almost as well and is a reasonable alternative.`);

  const spec: DesignSystemSpec = {
    id,
    specVersion: SPEC_VERSION,
    createdAt: new Date().toISOString(),
    project: {
      summary: profile.summary,
      category: profile.category,
      secondaryCategory: profile.secondaryCategory,
      websiteType: profile.websiteType,
      audience: profile.audience,
      personality: personality(profile.traits),
      traits: profile.traits,
      explicitPreferences: profile.explicit,
      inferenceSignals: profile.signals,
      inferenceConfidence: profile.confidence,
    },
    existingDesignSystem: {
      inspected: Boolean(repo?.exists),
      established: Boolean(repo?.established),
      preserved: preserveExisting,
      summary: repo ? repo.summary : "No project path provided.",
      framework: repo?.exists ? repo.framework.id : undefined,
      preservedValues: preserveExisting
        ? [
            observed?.background ? `background ${observed.background}` : "",
            observed?.text ? `text ${observed.text}` : "",
            observed?.brandCandidates.length ? `brand colors ${observed.brandCandidates.join(", ")}` : "",
            typography.heading.source === "existing" ? `heading font ${typography.heading.family}` : "",
            typography.body.source === "existing" ? `body font ${typography.body.family}` : "",
          ].filter(Boolean)
        : [],
      mapping,
    },
    direction: {
      id: direction.id,
      name: direction.name,
      concept,
      description: direction.summary,
      mood: direction.mood,
      personality: [...new Set([...direction.personality, ...personality(profile.traits)])].slice(0, 6),
      whyItFits: [
        ...winner.reasons,
        `best overall score (${winner.score}) across ${scored.length} candidate directions`,
        ...(forced ? ["direction explicitly requested"] : []),
        ...(preserveExisting ? ["existing colors and fonts are kept; the direction only fills gaps (spacing, states, motion, component rules)"] : []),
      ],
      researchEvidence,
      patternsToAdopt: [...direction.adopt, ...heuristics.map((h) => `${h.name} — ${h.description}`)],
      patternsToAvoid: [
        ...direction.avoid,
        ...antiPatterns.map((a) => a.name),
        ...profile.explicit.avoidStyles.map((s) => `${s} (excluded by the brief)`),
        ...profile.explicit.avoidColors.map((c) => `${c} hues (excluded by the brief)`),
      ],
      signatureMoves: direction.signatures,
      originalityStrategy,
      alternativesConsidered: alternatives.map((a) => ({ id: a.direction.id, name: a.direction.name, score: a.score, whyNotChosen: explainRejection(winner, a) })),
      selectionScore: winner.score,
    },
    color: palette,
    typography,
    spacing,
    layout,
    shape,
    motion,
    iconography: direction.icons,
    components,
    responsive: [
      `Breakpoints: ${Object.entries(layout.breakpoints).map(([k, v]) => `${k} ${v}`).join(", ")} (min-width, mobile-first).`,
      "Headings h1–h3 and display use fluid clamp() sizes between 360px and 1280px viewports; body size is fixed.",
      `Grid: ${layout.grid.columns.mobile} columns on mobile, ${layout.grid.columns.tablet} on tablet, ${layout.grid.columns.desktop} on desktop.`,
      `Section spacing scales from ${layout.sectionSpacing.mobile} (mobile) to ${layout.sectionSpacing.desktop} (desktop).`,
      "Navigation collapses to a menu button below md; primary CTA stays visible.",
      "Tables scroll horizontally inside a container on small screens; cards stack to one column below sm.",
    ],
    accessibility: [
      `Target WCAG 2.2 ${profile.explicit.constraints.wcag}; every color pair in the contrast table was computed, not assumed.`,
      "Visible :focus-visible ring on every interactive element (2px, offset 2px, ≥3:1).",
      "Minimum 44×44px touch targets; inputs ≥16px font size.",
      "Never convey meaning by color alone (status, links, gains/losses).",
      "Respect prefers-reduced-motion and prefers-color-scheme.",
      "Use semantic HTML (header, nav, main, footer, button, dialog) before ARIA.",
    ],
    tokens,
    implementation,
    validation: { score: validation.score, summary: validation.summary, issues: validation.issues },
    evidence: {
      datasetCoverage: {
        category: profile.category,
        analyzedInCategory: stats?.sampleSize ?? 0,
        websites: stats?.websites ?? 0,
        designSystems: stats?.designSystems ?? 0,
        analyzedOverall: overall?.sampleSize ?? 0,
      },
      observedConventions,
      patternsUsed: patternHits.map((p) => ({ id: p.id, name: p.name, origin: p.origin, confidence: p.confidence })),
      note: "Observed conventions are frequencies from static analysis of public CSS and design tokens; they describe what is common, not what performs best. Curated heuristics are expert guidance, not measurements.",
    },
    confidence: { overall: overallConf, inference: inferenceConf, research: Math.round(researchConf * 100) / 100, selectionMargin: Math.round(margin * 100) / 100, notes: confidenceNotes },
  };

  if (store) {
    store.saveDesignSystem({
      id,
      project_key: projectKey,
      project_path: repo?.exists ? repo.path : null,
      prompt_excerpt: profile.summary,
      direction_id: direction.id,
      spec_json: JSON.stringify(spec),
    });
  }
  if (input.writeFiles && repo?.exists) {
    const dir = join(repo.path, ".design-intelligence");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "design-system.json"), `${JSON.stringify(spec, null, 2)}\n`);
    writeFileSync(join(dir, "tokens.css"), spec.tokens.css);
    spec.files = [".design-intelligence/design-system.json", ".design-intelligence/tokens.css"];
  }
  return spec;
}
