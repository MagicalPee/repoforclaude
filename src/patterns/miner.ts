import type { PatternRecord, SourceRow, Store } from "../db/store.js";
import { type CategoryId, CATEGORIES, type SiteProfile, type StyleClassification } from "../types.js";
import { HEURISTIC_PATTERNS } from "../knowledge/heuristics.js";

export const CLASSIFICATION_DIMENSIONS = [
  "colorMode",
  "paletteCharacter",
  "accentHueFamily",
  "neutralTemperature",
  "headingClass",
  "bodyClass",
  "typeContrast",
  "radiusFamily",
  "elevation",
  "density",
  "motion",
  "gradientUse",
] as const satisfies ReadonlyArray<keyof StyleClassification>;

export type Dimension = (typeof CLASSIFICATION_DIMENSIONS)[number] | "styleTag" | "glass";

export interface Example {
  name: string;
  url: string;
  analyzedAt: string;
}

export interface ValueShare {
  value: string;
  count: number;
  share: number;
  examples: Example[];
}

export interface NumericSummary {
  n: number;
  median: number;
  p25: number;
  p75: number;
}

export interface CategoryStats {
  category: CategoryId | "all";
  sampleSize: number;
  websites: number;
  designSystems: number;
  dimensions: Partial<Record<Dimension, { known: number; values: ValueShare[] }>>;
  numeric: Record<string, NumericSummary | undefined>;
  fonts: { heading: ValueShare[]; body: ValueShare[]; mono: ValueShare[] };
}

interface Entry {
  source: SourceRow;
  profile: SiteProfile;
  classification: StyleClassification;
  analyzedAt: string;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

function summarize(values: Array<number | undefined>): NumericSummary | undefined {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return undefined;
  const r = (n: number) => Math.round(n * 100) / 100;
  return { n: v.length, median: r(quantile(v, 0.5)), p25: r(quantile(v, 0.25)), p75: r(quantile(v, 0.75)) };
}

/** Lower bound of the Wilson score interval (95%): small samples get honest, low confidence. */
export function wilsonLowerBound(successes: number, n: number, z = 1.96): number {
  if (n === 0) return 0;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return Math.max(0, (centre - margin) / denom);
}

function loadEntries(store: Store, category?: CategoryId): Entry[] {
  return store
    .latestProfiles({ category })
    .filter((r) => r.classification && r.source.category_id !== "reference-frameworks")
    .map((r) => ({ source: r.source, profile: r.profile, classification: r.classification!, analyzedAt: r.analysis.finished_at }));
}

function shares(entries: Entry[], pick: (e: Entry) => string[] | string | undefined): { known: number; values: ValueShare[] } {
  const counts = new Map<string, { count: number; examples: Example[] }>();
  let known = 0;
  for (const e of entries) {
    const raw = pick(e);
    const values = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).filter((v) => v && v !== "unknown");
    if (values.length === 0) continue;
    known++;
    for (const v of new Set(values)) {
      const slot = counts.get(v) ?? { count: 0, examples: [] };
      slot.count++;
      if (slot.examples.length < 5) slot.examples.push({ name: e.source.name, url: e.source.url, analyzedAt: e.analyzedAt });
      counts.set(v, slot);
    }
  }
  const values = [...counts.entries()]
    .map(([value, { count, examples }]) => ({ value, count, share: known ? Math.round((count / known) * 100) / 100 : 0, examples }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return { known, values };
}

// Dimensions that only rendered pages can show; token files contribute nothing to them.
const WEBSITE_ONLY_DIMENSIONS = new Set<string>(["gradientUse", "density", "motion"]);

export function computeCategoryStats(store: Store, category?: CategoryId): CategoryStats {
  const entries = loadEntries(store, category);
  const dimensions: CategoryStats["dimensions"] = {};
  for (const dim of CLASSIFICATION_DIMENSIONS) {
    dimensions[dim] = shares(entries, (e) =>
      WEBSITE_ONLY_DIMENSIONS.has(dim) && e.profile.sourceKind !== "website" ? undefined : String(e.classification[dim]),
    );
  }
  dimensions.styleTag = shares(entries, (e) => e.classification.styleTags);
  dimensions.glass = shares(entries, (e) => (e.profile.sourceKind === "website" ? String(e.classification.glass) : undefined));
  const p = (f: (x: SiteProfile) => number | undefined) => summarize(entries.map((e) => f(e.profile)));
  return {
    category: category ?? "all",
    sampleSize: entries.length,
    websites: entries.filter((e) => e.profile.sourceKind === "website").length,
    designSystems: entries.filter((e) => e.profile.sourceKind === "design_system").length,
    dimensions,
    numeric: {
      bodySizePx: p((x) => x.typography.bodySizePx),
      h1Px: p((x) => x.typography.headingSizesPx.h1),
      typeScaleRatio: p((x) => x.typography.typeScaleRatio),
      headingWeight: p((x) => x.typography.headingWeight),
      bodyLineHeight: p((x) => x.typography.bodyLineHeight),
      headingLetterSpacingEm: p((x) => x.typography.headingLetterSpacingEm),
      buttonRadiusPx: p((x) => (x.shape.buttonRadiusPx !== undefined && x.shape.buttonRadiusPx < 500 ? x.shape.buttonRadiusPx : undefined)),
      dominantRadiusPx: p((x) => x.shape.dominantRadiusPx),
      containerMaxWidthPx: p((x) => x.layout.containerMaxWidthsPx[0]?.value),
      baseUnitPx: p((x) => x.spacing.baseUnitPx),
      transitionMs: p((x) => x.effects.transitionDurationsMs[0]?.value),
    },
    fonts: {
      heading: shares(entries, (e) => e.profile.typography.headingFont).values,
      body: shares(entries, (e) => e.profile.typography.bodyFont).values,
      mono: shares(entries, (e) => e.profile.typography.monoFont).values,
    },
  };
}

const DIMENSION_LABEL: Record<string, string> = {
  colorMode: "color mode",
  paletteCharacter: "palette character",
  accentHueFamily: "accent hue",
  neutralTemperature: "neutral temperature",
  headingClass: "heading typeface class",
  bodyClass: "body typeface class",
  typeContrast: "heading/body size contrast",
  radiusFamily: "corner radius family",
  elevation: "elevation style",
  density: "spacing density",
  motion: "motion level",
  gradientUse: "gradient use",
  styleTag: "style tag",
  glass: "backdrop blur (glass)",
};

/** Turns category statistics into explicit, evidence-linked patterns (origin "mined"). */
export function minePatterns(store: Store): PatternRecord[] {
  const overall = computeCategoryStats(store);
  const out: PatternRecord[] = [];
  if (overall.sampleSize === 0) return out;
  const overallShare = (dim: Dimension, value: string) => overall.dimensions[dim]?.values.find((v) => v.value === value)?.share ?? 0;

  for (const cat of CATEGORIES) {
    if (cat.id === "reference-frameworks") continue;
    const stats = computeCategoryStats(store, cat.id);
    if (stats.sampleSize < 2) continue;
    for (const [dim, dist] of Object.entries(stats.dimensions) as Array<[Dimension, { known: number; values: ValueShare[] }]>) {
      if (!dist || dist.known < 2) continue;
      for (const v of dist.values) {
        const base = overallShare(dim, v.value);
        const lift = base > 0 ? Math.round((v.share / base) * 100) / 100 : null;
        const label = DIMENSION_LABEL[dim] ?? dim;
        const isConvention = v.share >= 0.4 && v.count >= 2;
        const isDistinctive = !isConvention && base <= 0.15 && v.count >= 1 && (lift ?? 0) >= 2;
        if (!isConvention && !isDistinctive) continue;
        const pct = Math.round(v.share * 100);
        out.push({
          id: `mined:${cat.id}:${dim}:${v.value}`,
          origin: "mined",
          kind: isConvention ? "convention" : "distinctive",
          name: isConvention ? `${cat.label}: ${label} "${v.value}" is common` : `${cat.label}: distinctive ${label} "${v.value}"`,
          description: isConvention
            ? `${v.count} of ${dist.known} analyzed ${cat.label} sources (${pct}%) show ${label} "${v.value}"${lift ? `, ${lift}× the rate across all analyzed sources` : ""}.`
            : `Only ${Math.round(base * 100)}% of all analyzed sources show ${label} "${v.value}", but ${v.count} ${cat.label} source(s) do. A deliberate way to stand apart within the category.`,
          categoryId: cat.id,
          dimension: dim,
          value: v.value,
          keywords: [cat.id, dim, v.value],
          supportCount: v.count,
          sampleSize: dist.known,
          share: v.share,
          lift,
          confidence: Math.round(wilsonLowerBound(v.count, dist.known) * 100) / 100,
          evidence: v.examples,
          rationale: "Observed frequency in this project's research dataset (static analysis); frequency is not a measure of success.",
        });
      }
    }
    for (const role of ["heading", "body"] as const) {
      for (const f of stats.fonts[role]) {
        if (f.count < 2) continue;
        out.push({
          id: `mined:${cat.id}:font-${role}:${f.value}`,
          origin: "mined",
          kind: "convention",
          name: `${cat.label}: ${f.value} as ${role} font`,
          description: `${f.count} analyzed ${cat.label} sources use ${f.value} for ${role} text. Reusing it signals category familiarity; avoid it if distinctiveness matters.`,
          categoryId: cat.id,
          dimension: `${role}Font`,
          value: f.value,
          keywords: [cat.id, "font", "typography", f.value.toLowerCase()],
          supportCount: f.count,
          sampleSize: stats.sampleSize,
          share: f.share,
          lift: null,
          confidence: Math.round(wilsonLowerBound(f.count, stats.sampleSize) * 100) / 100,
          evidence: f.examples,
          rationale: "Font detected from CSS font-family declarations and token files.",
        });
      }
    }
  }
  return out;
}

export function refreshMinedPatterns(store: Store): number {
  const mined = minePatterns(store);
  store.replacePatterns("mined", mined);
  return mined.length;
}

/** Curated heuristics are versioned with the code and refreshed at startup. */
export function seedHeuristicPatterns(store: Store): number {
  store.replacePatterns("curated_heuristic", HEURISTIC_PATTERNS);
  return HEURISTIC_PATTERNS.length;
}
