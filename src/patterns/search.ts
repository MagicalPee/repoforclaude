import type { PatternRow, Store } from "../db/store.js";
import type { CategoryId } from "../types.js";

export interface PatternSearchInput {
  category?: CategoryId;
  keywords?: string[];
  component?: string;
  limit?: number;
  includeAntiPatterns?: boolean;
}

export interface PatternHit {
  id: string;
  origin: "curated_heuristic" | "mined";
  kind: PatternRow["kind"];
  name: string;
  description: string;
  category: string | null;
  component: string | null;
  confidence: number;
  support?: { count: number; sampleSize: number; share: number | null; lift: number | null };
  examples: Array<{ name: string; url: string; analyzedAt?: string }>;
  whyRelevant: string;
  relevance: number;
}

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length > 2);

export function searchPatterns(store: Store, input: PatternSearchInput): PatternHit[] {
  const rows = store.listPatterns({ categories: input.category ? [input.category] : undefined });
  const words = (input.keywords ?? []).flatMap(tokenize);
  const component = input.component?.toLowerCase();
  const hits: PatternHit[] = [];
  for (const row of rows) {
    if (row.kind === "anti_pattern" && input.includeAntiPatterns === false) continue;
    const keywords = JSON.parse(row.keywords_json) as string[];
    const haystack = new Set([...keywords.flatMap(tokenize), ...tokenize(row.name), ...tokenize(row.description)]);
    const matched = words.filter((w) => haystack.has(w) || [...haystack].some((h) => h.startsWith(w) || w.startsWith(h)));
    const reasons: string[] = [];
    let score = row.confidence;
    if (input.category && row.category_id === input.category) {
      score += 1;
      reasons.push(`specific to ${input.category}`);
    } else if (!row.category_id) {
      reasons.push("applies across categories");
    }
    if (component) {
      if (row.component === component) {
        score += 1;
        reasons.push(`about ${component} components`);
      } else if (row.component && row.component !== component) {
        score -= 0.75;
      }
    }
    if (matched.length) {
      score += 0.5 * new Set(matched).size;
      reasons.push(`matches ${[...new Set(matched)].join(", ")}`);
    } else if (words.length > 0) {
      score -= 0.5;
    }
    if (row.origin === "mined") {
      reasons.push(`observed in ${row.support_count}/${row.sample_size} analyzed sources`);
      if (row.kind === "distinctive") reasons.push("uncommon elsewhere, useful for differentiation");
    } else {
      reasons.push(row.kind === "anti_pattern" ? "curated anti-pattern to avoid" : "curated heuristic");
    }
    hits.push({
      id: row.id,
      origin: row.origin,
      kind: row.kind,
      name: row.name,
      description: row.description,
      category: row.category_id,
      component: row.component,
      confidence: row.confidence,
      support: row.origin === "mined" ? { count: row.support_count, sampleSize: row.sample_size, share: row.share, lift: row.lift } : undefined,
      examples: (JSON.parse(row.evidence_json) as PatternHit["examples"]).slice(0, 5),
      whyRelevant: reasons.join("; "),
      relevance: Math.round(score * 100) / 100,
    });
  }
  return hits.sort((a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id)).slice(0, input.limit ?? 20);
}
