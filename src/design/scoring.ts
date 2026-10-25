import { type DesignDirection, DIRECTIONS } from "../knowledge/directions.js";
import type { CategoryStats } from "../patterns/miner.js";
import { isSerif } from "../patterns/classifier.js";
import { CATEGORIES } from "../types.js";
import { hash, type ProjectProfile, TRAITS } from "./inference.js";
import type { RepoInspection } from "./repoInspector.js";

export interface ScoredDirection {
  direction: DesignDirection;
  score: number;
  breakdown: Record<string, number>;
  reasons: string[];
}

export interface ScoringContext {
  stats?: CategoryStats;
  recentDirections: string[];
  seed: number;
  repo?: RepoInspection;
  preserveExisting: boolean;
}

function radiusFamily(d: DesignDirection): "sharp" | "soft" | "rounded" | "pill" {
  if (d.shape.button === "pill") return "pill";
  const md = d.shape.radius[2];
  return md <= 2 ? "sharp" : md <= 8 ? "soft" : "rounded";
}

function share(stats: CategoryStats, dim: keyof CategoryStats["dimensions"], values: string[]): number | undefined {
  const dist = stats.dimensions[dim];
  if (!dist || dist.known < 3) return undefined;
  return dist.values.filter((v) => values.includes(v.value)).reduce((s, v) => s + v.share, 0);
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function scoreDirections(profile: ProjectProfile, ctx: ScoringContext): ScoredDirection[] {
  const explicitStyles = new Set(profile.explicit.styleKeywords);
  const avoidStyles = new Set(profile.explicit.avoidStyles);
  const out: ScoredDirection[] = [];

  for (const d of DIRECTIONS) {
    const b: Record<string, number> = {};
    const reasons: string[] = [];

    const catFit = d.fit.categories[profile.category] ?? 0;
    const secFit = profile.secondaryCategory ? (d.fit.categories[profile.secondaryCategory] ?? 0) : 0;
    b.category = catFit * 3 + secFit * 0.8;
    if (catFit >= 0.8) reasons.push(`designed for ${CATEGORIES.find((c) => c.id === profile.category)?.label ?? profile.category}`);

    let dot = 0;
    let norm = 0;
    for (const t of TRAITS) {
      const dv = d.fit.traits[t] ?? 0;
      dot += dv * profile.traits[t];
      norm += Math.abs(dv);
    }
    b.traits = norm > 0 ? (dot / norm) * 2.5 : 0;
    if (b.traits > 0.6) {
      const aligned = TRAITS.filter((t) => (d.fit.traits[t] ?? 0) * profile.traits[t] > 0.2).slice(0, 3);
      if (aligned.length) reasons.push(`matches the brief's ${aligned.join(", ")} profile`);
    }

    b.websiteType = (d.fit.websiteTypes?.[profile.websiteType] ?? 0.35) * 1;

    const matched = d.fit.styleKeywords.filter((k) => explicitStyles.has(k));
    const clashing = d.fit.styleKeywords.filter((k) => avoidStyles.has(k));
    b.styleKeywords = Math.min(3, matched.length) * 1.2 - clashing.length * 1.5;
    if (matched.length) reasons.push(`honours requested style: ${matched.join(", ")}`);

    b.constraints = 0;
    const mode = profile.explicit.mode;
    if (mode === "dark") b.constraints += d.color.mode === "light" ? -1.2 : 0.4;
    if (mode === "light") b.constraints += d.color.mode === "dark" ? -1.5 : 0;
    if (profile.explicit.constraints.noAnimation && d.motion.level === "expressive") b.constraints -= 0.6;
    const corners = profile.explicit.constraints.corners;
    if (corners === "sharp" && d.shape.radius[2] >= 10) b.constraints -= 0.6;
    if (corners === "rounded" && d.shape.radius[2] <= 2) b.constraints -= 0.6;
    if (corners === "pill" && d.shape.button === "pill") b.constraints += 0.3;
    if (profile.audience.includes("older adults") && d.type.bodyPx < 17) b.constraints -= 0.4;

    b.evidence = 0;
    const stats = ctx.stats;
    if (stats && stats.sampleSize >= 3) {
      const weight = Math.min(1, stats.sampleSize / 8) * 0.9;
      const parts: number[] = [];
      const modeShare = share(stats, "colorMode", d.color.mode === "dark" ? ["dark"] : d.color.mode === "light" ? ["light"] : ["light", "dark"]);
      if (modeShare !== undefined) parts.push(modeShare);
      const rShare = share(stats, "radiusFamily", [radiusFamily(d)]);
      if (rShare !== undefined) parts.push(rShare);
      const serifHeading = isSerif(d.type.heading[0]!);
      const hShare = share(stats, "headingClass", serifHeading ? ["transitional-serif", "old-style-serif", "didone", "display-serif", "slab-serif"] : ["neo-grotesque", "grotesque", "geometric-sans", "humanist-sans", "condensed-sans", "display", "rounded-sans", "system"]);
      if (hShare !== undefined) parts.push(hShare);
      const dShare = share(stats, "density", [d.layout.density]);
      if (dShare !== undefined) parts.push(dShare);
      if (parts.length) {
        const avg = parts.reduce((s, x) => s + x, 0) / parts.length;
        b.evidence = (avg - 0.4) * 2 * weight;
        if (avg >= 0.5) reasons.push(`consistent with ${pct(avg)} of observed ${profile.category} conventions (n=${stats.sampleSize})`);
      }
    }

    b.existing = 0;
    if (ctx.preserveExisting && ctx.repo?.observed) {
      const o = ctx.repo.observed;
      let sim = 0;
      let n = 0;
      if (o.background) {
        const dark = (Number.parseInt(o.background.slice(1, 3), 16) + Number.parseInt(o.background.slice(3, 5), 16) + Number.parseInt(o.background.slice(5, 7), 16)) / 3 < 90;
        sim += (dark ? d.color.mode !== "light" : d.color.mode !== "dark") ? 1 : 0;
        n++;
      }
      const r = o.buttonRadiusPx ?? o.dominantRadiusPx;
      if (r !== undefined) {
        const fam = r >= 40 ? "pill" : r <= 2 ? "sharp" : r <= 8 ? "soft" : "rounded";
        sim += fam === radiusFamily(d) ? 1 : 0.3;
        n++;
      }
      b.existing = n ? (sim / n) * 1.5 : 0;
      if (n && sim / n >= 0.8) reasons.push("structurally compatible with the project's existing styles");
    }

    const uses = ctx.recentDirections.filter((id) => id === d.id).length;
    b.diversity = matched.length > 0 ? 0 : -Math.min(1.5, uses * 0.5);
    b.generic = matched.length > 0 ? 0 : -d.genericRisk * 0.8;
    b.jitter = ((hash(`${ctx.seed}:${d.id}`) % 1000) / 1000) * 0.35;

    const score = Object.values(b).reduce((s, v) => s + v, 0);
    out.push({ direction: d, score: Math.round(score * 100) / 100, breakdown: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * 100) / 100])), reasons });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function explainRejection(winner: ScoredDirection, other: ScoredDirection): string {
  const deltas = Object.keys(winner.breakdown)
    .map((k) => ({ k, d: (winner.breakdown[k] ?? 0) - (other.breakdown[k] ?? 0) }))
    .filter((x) => x.k !== "jitter")
    .sort((a, b) => b.d - a.d);
  const top = deltas.filter((x) => x.d > 0.15).slice(0, 2);
  const labels: Record<string, string> = {
    category: "weaker category fit",
    traits: "personality mismatch with the brief",
    websiteType: "less suited to this website type",
    styleKeywords: "does not match the requested style",
    constraints: "conflicts with explicit constraints",
    evidence: "less consistent with observed category conventions",
    existing: "less compatible with the existing design",
    diversity: "used recently for other projects",
    generic: "higher risk of a generic look",
  };
  if (top.length === 0) return `Close runner-up (${other.score} vs ${winner.score}); a valid alternative if you prefer its mood (${other.direction.mood.join(", ")}).`;
  return `${top.map((t) => labels[t.k] ?? t.k).join("; ")} (score ${other.score} vs ${winner.score}).`;
}
