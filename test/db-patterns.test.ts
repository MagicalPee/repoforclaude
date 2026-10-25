import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { migrate, openDatabase, schemaVersion, transaction } from "../src/db/database.js";
import { MIGRATIONS } from "../src/db/migrations.js";
import { Store } from "../src/db/store.js";
import { classifyProfile } from "../src/patterns/classifier.js";
import { computeCategoryStats, minePatterns, refreshMinedPatterns, seedHeuristicPatterns, wilsonLowerBound } from "../src/patterns/miner.js";
import { searchPatterns } from "../src/patterns/search.js";
import { createSnapshot, importSnapshot } from "../src/research/snapshot.js";
import type { SiteProfile } from "../src/types.js";
import { tempStore } from "./helpers.js";

function profile(overrides: { bg: string; text: string; brand: string; heading: string; radius: number }): SiteProfile {
  return {
    sourceKind: "website",
    url: "https://x.example.com/",
    finalUrl: "https://x.example.com/",
    fetchedAt: new Date().toISOString(),
    meta: {},
    colors: { palette: [], background: overrides.bg, text: overrides.text, brandCandidates: [overrides.brand], scheme: "unknown", supportsDarkMode: false, customPropertyColorCount: 0, uniqueColorCount: 5 },
    typography: { fonts: [{ family: overrides.heading, normalized: overrides.heading.toLowerCase(), role: "heading", classification: overrides.heading === "Fraunces" ? "display-serif" : "grotesque", delivery: "google-fonts", frequency: 3, confidence: 0.7, evidence: "test" }], headingFont: overrides.heading, bodyFont: overrides.heading, headingSizesPx: { h1: 64 }, bodySizePx: 16, uppercaseLabels: false, distinctFontSizes: 6 },
    spacing: { commonValuesPx: [], density: "comfortable" },
    shape: { radiiPx: [], dominantRadiusPx: overrides.radius, buttonRadiusPx: overrides.radius, pillButtons: false, borderWidthsPx: [] },
    elevation: { shadowCount: 0, style: "none" },
    layout: { containerMaxWidthsPx: [], breakpointsPx: [], gridDeclarations: 0, flexDeclarations: 0, stickyHeader: false },
    effects: { gradients: 0, backdropBlur: 0, keyframes: 0, transitionDurationsMs: [], easings: [], reducedMotionSupport: true },
    components: [],
    structure: { headings: { h1: 1, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 }, sections: 1, navs: 1, forms: 0, buttons: 1, images: 0, svgs: 0, videos: 0, iconLibraries: [] },
    accessibility: { langAttribute: true, viewportZoomBlocked: false, imagesMissingAlt: 0, imagesTotal: 0, focusVisibleStyles: true, outlineNoneCount: 0, skipLink: false, reducedMotion: true, h1Count: 1 },
    tech: { frameworks: [], cssFrameworks: [] },
    limitations: [],
  };
}

function addAnalyzed(store: Store, name: string, category: "gaming" | "fintech", p: SiteProfile) {
  p.colors.scheme = p.colors.background === "#111111" ? "dark" : "light";
  const sourceId = store.upsertSource({ kind: "website", url: `https://${name}.example.com/`, name, category, tags: [] });
  const now = new Date().toISOString();
  store.saveAnalysis({
    sourceId,
    url: `https://${name}.example.com/`,
    status: "success",
    startedAt: now,
    finishedAt: now,
    durationMs: 10,
    bytesFetched: 100,
    profile: p,
    classification: classifyProfile(p),
    limitations: [],
    analyzerVersion: "test",
    observations: [{ kind: "color", key: "background", value: p.colors.background!, confidence: 0.8, evidence: "test" }],
    references: [{ url: `https://${name}.example.com/`, kind: "html", bytes: 100, fetchedAt: now, fromCache: false }],
  });
}

describe("database", () => {
  it("applies migrations once and records the schema version", () => {
    const dir = mkdtempSync(join(tmpdir(), "dim-db-"));
    const path = join(dir, "x.db");
    const db = openDatabase(path);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    expect(migrate(db)).toEqual([]);
    db.close();
    const reopened = openDatabase(path);
    expect((reopened.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number }).n).toBe(MIGRATIONS.length);
    reopened.close();
  });

  it("rolls back failed transactions", () => {
    const store = tempStore();
    expect(() =>
      transaction(store.db, () => {
        store.setMeta("k", "v");
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(store.getMeta("k")).toBeUndefined();
  });

  it("exports evidence without cached page bodies and round-trips snapshots", () => {
    const store = tempStore();
    addAnalyzed(store, "alpha", "gaming", profile({ bg: "#111111", text: "#eeeeee", brand: "#ff3355", heading: "Oxanium", radius: 2 }));
    store.putCached({ url: "https://alpha.example.com/", status: 200, contentType: "text/html", etag: null, lastModified: null, body: "<html>secret body</html>", bytes: 10, sha256: null, fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 1000).toISOString() });
    const dump = store.exportDataset();
    expect(dump.analyses).toHaveLength(1);
    expect(dump.observations.length).toBeGreaterThan(0);
    expect(JSON.stringify(dump)).not.toContain("secret body");

    const snapshot = createSnapshot(store);
    expect(snapshot.entries).toHaveLength(1);
    const other = tempStore();
    expect(importSnapshot(other, snapshot)).toEqual({ imported: 1, skipped: 0 });
    expect(importSnapshot(other, snapshot)).toEqual({ imported: 0, skipped: 1 });
    expect(other.stats().analyzedSources).toBe(1);
  });

  it("bootstraps a fresh install with seeds, heuristics and the bundled snapshot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dim-app-"));
    const app = createApp({ config: loadConfig({ DIM_DATA_DIR: dir, DIM_LOG_LEVEL: "error" }) });
    const stats = app.store.stats();
    expect(stats.sources).toBeGreaterThan(500);
    expect(stats.sourcesByKind.design_system).toBeGreaterThanOrEqual(15);
    expect(stats.analyzedSources).toBeGreaterThanOrEqual(15);
    expect(stats.patterns.curated_heuristic).toBeGreaterThan(50);
    expect(stats.patterns.mined).toBeGreaterThan(0);
    await app.close();
    // Second start is idempotent.
    const again = createApp({ config: loadConfig({ DIM_DATA_DIR: dir, DIM_LOG_LEVEL: "error" }) });
    expect(again.store.stats().totalAnalyses).toBe(stats.totalAnalyses);
    await again.close();
  });
});

describe("pattern mining", () => {
  it("computes honest lower-bound confidence", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
    expect(wilsonLowerBound(3, 3)).toBeLessThan(0.5);
    expect(wilsonLowerBound(90, 100)).toBeGreaterThan(0.8);
  });

  it("finds category conventions with lift and supporting examples", () => {
    const store = tempStore();
    for (const n of ["g1", "g2", "g3"]) addAnalyzed(store, n, "gaming", profile({ bg: "#111111", text: "#eeeeee", brand: "#ff3355", heading: "Oxanium", radius: 2 }));
    for (const n of ["f1", "f2", "f3"]) addAnalyzed(store, n, "fintech", profile({ bg: "#ffffff", text: "#111111", brand: "#0f766e", heading: "Fraunces", radius: 8 }));
    const stats = computeCategoryStats(store, "gaming");
    expect(stats.sampleSize).toBe(3);
    expect(stats.dimensions.colorMode?.values[0]).toMatchObject({ value: "dark", count: 3, share: 1 });
    const patterns = minePatterns(store);
    const darkGaming = patterns.find((p) => p.id === "mined:gaming:colorMode:dark");
    expect(darkGaming).toMatchObject({ kind: "convention", supportCount: 3, sampleSize: 3, lift: 2 });
    expect(darkGaming!.evidence.map((e) => e.name).sort()).toEqual(["g1", "g2", "g3"]);
    expect(patterns.find((p) => p.id === "mined:gaming:font-heading:Oxanium")).toBeDefined();
    expect(refreshMinedPatterns(store)).toBe(patterns.length);
  });

  it("ranks curated heuristics by category, keywords and component", () => {
    const store = tempStore();
    seedHeuristicPatterns(store);
    const hits = searchPatterns(store, { category: "ecommerce", keywords: ["price"], component: "typography" });
    expect(hits[0]?.name).toMatch(/price/i);
    expect(hits[0]?.origin).toBe("curated_heuristic");
    expect(searchPatterns(store, { category: "ai-products", keywords: ["gradient"] }).some((h) => h.kind === "anti_pattern")).toBe(true);
  });
});
