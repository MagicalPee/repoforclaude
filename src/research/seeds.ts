import { readFileSync } from "node:fs";
import type { DesignSystemConfig } from "../analysis/tokenAnalyzer.js";
import type { SourceSeed, Store } from "../db/store.js";
import { log } from "../logger.js";
import { isCategoryId } from "../types.js";

const DATA_DIR = new URL("../../data/", import.meta.url);
export const SEED_VERSION = "2026-10-25.1";

interface WebsiteSeedFile {
  categories: Array<{ category: string; sites: Array<[string, string, string, string, string]> }>;
}

interface DesignSystemSeedFile {
  systems: Array<DesignSystemConfig & { name: string; url: string; category: string; audience?: string; positioning?: string; tags?: string[] }>;
}

export function loadWebsiteSeeds(path?: string): SourceSeed[] {
  const file = JSON.parse(readFileSync(path ?? new URL("seed-websites.json", DATA_DIR), "utf8")) as WebsiteSeedFile;
  const out: SourceSeed[] = [];
  for (const block of file.categories) {
    if (!isCategoryId(block.category)) throw new Error(`Unknown category "${block.category}" in website seeds`);
    for (const [name, url, audience, positioning, tags] of block.sites) {
      out.push({
        kind: "website",
        name,
        url: new URL(url).href,
        category: block.category,
        audience,
        positioning,
        tags: tags.split(/\s+/).filter(Boolean),
        selectionBasis: "curator_judgement",
        origin: path ? "user_seed_file" : "seed",
      });
    }
  }
  return out;
}

export function loadDesignSystemSeeds(): SourceSeed[] {
  const file = JSON.parse(readFileSync(new URL("seed-design-systems.json", DATA_DIR), "utf8")) as DesignSystemSeedFile;
  return file.systems.map((s) => {
    if (!isCategoryId(s.category)) throw new Error(`Unknown category "${s.category}" in design-system seeds`);
    return {
      kind: "design_system" as const,
      name: s.name,
      // Keyed by the repository so the docs URL can change without duplicating the source.
      url: `https://github.com/${s.repo}`,
      category: s.category,
      audience: s.audience,
      positioning: s.positioning,
      tags: s.tags ?? [],
      config: { repo: s.repo, ref: s.ref, files: s.files, docsUrl: s.url },
      selectionBasis: "public_design_system",
    };
  });
}

/** Idempotently loads bundled (and optional user) seeds when the bundled version changes. */
export function ensureSeeded(store: Store, extraSeedFile?: string): { seeded: boolean; sources: number } {
  store.seedCategories();
  const marker = `${SEED_VERSION}|${extraSeedFile ?? ""}`;
  if (store.getMeta("seed_version") === marker) return { seeded: false, sources: store.listSources().length };
  const seeds = [...loadDesignSystemSeeds(), ...loadWebsiteSeeds()];
  if (extraSeedFile) {
    try {
      seeds.push(...loadWebsiteSeeds(extraSeedFile));
    } catch (error) {
      log.warn("could not load extra seed file", { file: extraSeedFile, error: (error as Error).message });
    }
  }
  for (const seed of seeds) store.upsertSource(seed);
  store.setMeta("seed_version", marker);
  log.info("research sources seeded", { count: seeds.length });
  return { seeded: true, sources: seeds.length };
}
