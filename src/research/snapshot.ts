import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { profileToObservations } from "../analysis/observations.js";
import type { ReferenceInput, SourceSeed, Store } from "../db/store.js";
import { log } from "../logger.js";
import { isCategoryId, type SiteProfile, type SourceKind, type StyleClassification } from "../types.js";

/**
 * A snapshot is a portable copy of the latest successful analysis per source: real evidence
 * with its original fetch timestamps and references, so a fresh install starts with data
 * instead of an empty dataset. Snapshots never contain cached page bodies.
 */
export interface Snapshot {
  format: "design-intelligence-snapshot";
  formatVersion: 1;
  createdAt: string;
  note: string;
  entries: Array<{
    source: SourceSeed;
    analysis: {
      url: string;
      finalUrl: string | null;
      status: "success" | "partial";
      startedAt: string;
      finishedAt: string;
      durationMs: number;
      analyzerVersion: string;
      profile: SiteProfile;
      classification: StyleClassification | null;
      limitations: string[];
    };
    references: ReferenceInput[];
  }>;
}

const SNAPSHOT_DIR = new URL("../../data/snapshots/", import.meta.url);

export function createSnapshot(store: Store, filter: { kind?: SourceKind } = {}): Snapshot {
  const entries: Snapshot["entries"] = [];
  for (const { source, analysis, profile, classification } of store.latestProfiles({ kind: filter.kind })) {
    const refs = store.db
      .prepare("SELECT url, kind, http_status, content_type, bytes, sha256, fetched_at, from_cache, note FROM source_references WHERE analysis_id = ?")
      .all(analysis.id) as Array<Record<string, unknown>>;
    entries.push({
      source: {
        kind: source.kind,
        url: source.url,
        name: source.name,
        category: source.category_id,
        audience: source.audience ?? undefined,
        positioning: source.positioning ?? undefined,
        tags: JSON.parse(source.tags_json) as string[],
        config: source.config_json ? (JSON.parse(source.config_json) as Record<string, unknown>) : undefined,
        selectionBasis: source.selection_basis,
      },
      analysis: {
        url: analysis.url,
        finalUrl: analysis.final_url,
        status: analysis.status as "success" | "partial",
        startedAt: analysis.started_at,
        finishedAt: analysis.finished_at,
        durationMs: analysis.duration_ms,
        analyzerVersion: analysis.analyzer_version,
        profile,
        classification: classification ?? null,
        limitations: JSON.parse(analysis.limitations_json) as string[],
      },
      references: refs.map((r) => ({
        url: r.url as string,
        kind: r.kind as string,
        httpStatus: (r.http_status as number | null) ?? undefined,
        contentType: (r.content_type as string | null) ?? undefined,
        bytes: r.bytes as number,
        sha256: (r.sha256 as string | null) ?? undefined,
        fetchedAt: r.fetched_at as string,
        fromCache: Boolean(r.from_cache),
        note: (r.note as string | null) ?? undefined,
      })),
    });
  }
  return {
    format: "design-intelligence-snapshot",
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    note: "Latest successful analysis per source with original timestamps and fetched-file references. Profiles are static-analysis measurements; source metadata is curated.",
    entries,
  };
}

export function importSnapshot(store: Store, snapshot: Snapshot): { imported: number; skipped: number } {
  if (snapshot.format !== "design-intelligence-snapshot") throw new Error("Not a design-intelligence snapshot file.");
  let imported = 0;
  let skipped = 0;
  for (const entry of snapshot.entries) {
    if (!isCategoryId(entry.source.category)) {
      skipped++;
      continue;
    }
    const sourceId = store.upsertSource({ ...entry.source, origin: entry.source.origin ?? "snapshot" });
    const exists = store.db
      .prepare("SELECT 1 FROM analyses WHERE source_id = ? AND finished_at = ?")
      .get(sourceId, entry.analysis.finishedAt);
    if (exists) {
      skipped++;
      continue;
    }
    store.saveAnalysis({
      sourceId,
      url: entry.analysis.url,
      finalUrl: entry.analysis.finalUrl ?? undefined,
      status: entry.analysis.status,
      startedAt: entry.analysis.startedAt,
      finishedAt: entry.analysis.finishedAt,
      durationMs: entry.analysis.durationMs,
      bytesFetched: entry.references.reduce((s, r) => s + (r.bytes ?? 0), 0),
      profile: entry.analysis.profile,
      classification: entry.analysis.classification ?? undefined,
      limitations: [...entry.analysis.limitations, "Imported from a bundled research snapshot; see the original fetch timestamps."],
      analyzerVersion: entry.analysis.analyzerVersion,
      observations: profileToObservations(entry.analysis.profile),
      references: entry.references,
    });
    imported++;
  }
  return { imported, skipped };
}

/** Imports each bundled snapshot once (tracked in the meta table). */
export function importBundledSnapshots(store: Store): number {
  const dir = fileURLToPath(SNAPSHOT_DIR);
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const key = `snapshot:${file}`;
    if (store.getMeta(key)) continue;
    try {
      const snapshot = JSON.parse(readFileSync(new URL(file, SNAPSHOT_DIR), "utf8")) as Snapshot;
      const { imported } = importSnapshot(store, snapshot);
      total += imported;
      store.setMeta(key, new Date().toISOString());
      if (imported) log.info("imported bundled research snapshot", { file, imported });
    } catch (error) {
      log.warn("could not import snapshot", { file, error: (error as Error).message });
    }
  }
  return total;
}
