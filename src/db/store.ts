import { randomUUID } from "node:crypto";
import { hueFamily, toOklch } from "../analysis/color.js";
import type { CategoryId, SiteProfile, SourceKind, StyleClassification } from "../types.js";
import { CATEGORIES } from "../types.js";
import { type Db, params, schemaVersion, transaction } from "./database.js";

const now = () => new Date().toISOString();

export interface SourceSeed {
  kind: SourceKind;
  url: string;
  name: string;
  category: CategoryId;
  audience?: string;
  positioning?: string;
  tags?: string[];
  config?: Record<string, unknown>;
  selectionBasis?: string;
  origin?: string;
}

export interface SourceRow {
  id: number;
  kind: SourceKind;
  url: string;
  name: string;
  category_id: CategoryId;
  audience: string | null;
  positioning: string | null;
  tags_json: string;
  config_json: string | null;
  selection_basis: string;
  origin: string;
  enabled: number;
}

export interface ObservationInput {
  kind: string;
  key: string;
  value: string;
  numericValue?: number;
  confidence: number;
  evidence: string;
  sourceRef?: string;
}

export interface ReferenceInput {
  url: string;
  kind: string;
  httpStatus?: number;
  contentType?: string;
  bytes: number;
  sha256?: string;
  fetchedAt: string;
  fromCache: boolean;
  note?: string;
}

export interface AnalysisRecord {
  sourceId?: number;
  url: string;
  finalUrl?: string;
  status: "success" | "partial" | "failed" | "blocked";
  error?: string;
  httpStatus?: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  bytesFetched: number;
  profile?: SiteProfile;
  classification?: StyleClassification;
  limitations: string[];
  analyzerVersion: string;
  observations: ObservationInput[];
  references: ReferenceInput[];
}

export interface AnalysisRow {
  id: number;
  source_id: number | null;
  url: string;
  final_url: string | null;
  status: AnalysisRecord["status"];
  error: string | null;
  http_status: number | null;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  profile_json: string | null;
  classification_json: string | null;
  limitations_json: string;
  analyzer_version: string;
}

export interface CachedResponse {
  url: string;
  status: number;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
  body: string | null;
  bytes: number;
  sha256: string | null;
  fetchedAt: string;
  expiresAt: string;
}

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type JobItemStatus = "pending" | "running" | "success" | "partial" | "failed" | "skipped" | "blocked";

export interface JobRow {
  id: string;
  status: JobStatus;
  params_json: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  last_error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

export interface PatternRecord {
  id: string;
  origin: "curated_heuristic" | "mined";
  kind: "convention" | "distinctive" | "guideline" | "anti_pattern";
  name: string;
  description: string;
  categoryId?: CategoryId | null;
  component?: string | null;
  dimension?: string | null;
  value?: string | null;
  keywords: string[];
  supportCount: number;
  sampleSize: number;
  share?: number | null;
  lift?: number | null;
  confidence: number;
  evidence: Array<{ name: string; url: string; analyzedAt?: string }>;
  rationale?: string | null;
}

export interface PatternRow {
  id: string;
  origin: PatternRecord["origin"];
  kind: PatternRecord["kind"];
  name: string;
  description: string;
  category_id: string | null;
  component: string | null;
  dimension: string | null;
  value: string | null;
  keywords_json: string;
  support_count: number;
  sample_size: number;
  share: number | null;
  lift: number | null;
  confidence: number;
  evidence_json: string;
  rationale: string | null;
  updated_at: string;
}

export interface DesignSystemRow {
  id: string;
  project_key: string;
  project_path: string | null;
  prompt_excerpt: string | null;
  direction_id: string;
  spec_json: string;
  created_at: string;
}

/** Data access for the research knowledge base. All SQL lives here. */
export class Store {
  constructor(readonly db: Db) {}

  // ---------- categories & sources ----------

  seedCategories(): void {
    const stmt = this.db.prepare(
      `INSERT INTO categories (id, label, description) VALUES (:id, :label, :description)
       ON CONFLICT(id) DO UPDATE SET label = excluded.label, description = excluded.description`,
    );
    transaction(this.db, () => {
      for (const c of CATEGORIES) stmt.run(params({ id: c.id, label: c.label, description: c.description }));
    });
  }

  /** Inserts or refreshes curated metadata; never touches analyses. Returns the source id. */
  upsertSource(seed: SourceSeed): number {
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO sources (kind, url, name, category_id, audience, positioning, tags_json, config_json,
                              selection_basis, origin, enabled, created_at, updated_at)
         VALUES (:kind, :url, :name, :category, :audience, :positioning, :tags, :config, :basis, :origin, 1, :ts, :ts)
         ON CONFLICT(url) DO UPDATE SET
           kind = excluded.kind, name = excluded.name, category_id = excluded.category_id,
           audience = excluded.audience, positioning = excluded.positioning, tags_json = excluded.tags_json,
           config_json = excluded.config_json, selection_basis = excluded.selection_basis, updated_at = excluded.updated_at`,
      )
      .run(
        params({
          kind: seed.kind,
          url: seed.url,
          name: seed.name,
          category: seed.category,
          audience: seed.audience,
          positioning: seed.positioning,
          tags: JSON.stringify(seed.tags ?? []),
          config: seed.config ? JSON.stringify(seed.config) : undefined,
          basis: seed.selectionBasis ?? "curator_judgement",
          origin: seed.origin ?? "seed",
          ts,
        }),
      );
    const row = this.db.prepare("SELECT id FROM sources WHERE url = ?").get(seed.url) as { id: number };
    return row.id;
  }

  getSource(id: number): SourceRow | undefined {
    return this.db.prepare("SELECT * FROM sources WHERE id = ?").get(id) as SourceRow | undefined;
  }

  getSourceByUrl(url: string): SourceRow | undefined {
    return this.db.prepare("SELECT * FROM sources WHERE url = ?").get(url) as SourceRow | undefined;
  }

  listSources(filter: { kind?: SourceKind; category?: CategoryId; enabledOnly?: boolean } = {}): SourceRow[] {
    const clauses: string[] = [];
    const p: Record<string, string> = {};
    if (filter.kind) {
      clauses.push("kind = :kind");
      p.kind = filter.kind;
    }
    if (filter.category) {
      clauses.push("category_id = :category");
      p.category = filter.category;
    }
    if (filter.enabledOnly !== false) clauses.push("enabled = 1");
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM sources ${where} ORDER BY id`).all(p) as unknown as SourceRow[];
  }

  // ---------- analyses ----------

  saveAnalysis(record: AnalysisRecord): number {
    return transaction(this.db, () => {
      const result = this.db
        .prepare(
          `INSERT INTO analyses (source_id, url, final_url, status, error, http_status, started_at, finished_at,
                                 duration_ms, bytes_fetched, profile_json, classification_json, limitations_json, analyzer_version)
           VALUES (:sourceId, :url, :finalUrl, :status, :error, :httpStatus, :startedAt, :finishedAt,
                   :durationMs, :bytes, :profile, :classification, :limitations, :version)`,
        )
        .run(
          params({
            sourceId: record.sourceId,
            url: record.url,
            finalUrl: record.finalUrl,
            status: record.status,
            error: record.error?.slice(0, 2000),
            httpStatus: record.httpStatus,
            startedAt: record.startedAt,
            finishedAt: record.finishedAt,
            durationMs: record.durationMs,
            bytes: record.bytesFetched,
            profile: record.profile ? JSON.stringify(record.profile) : undefined,
            classification: record.classification ? JSON.stringify(record.classification) : undefined,
            limitations: JSON.stringify(record.limitations),
            version: record.analyzerVersion,
          }),
        );
      const analysisId = Number(result.lastInsertRowid);
      const sourceId = record.sourceId ?? null;

      const obs = this.db.prepare(
        `INSERT INTO observations (analysis_id, source_id, kind, key, value, numeric_value, confidence, evidence, source_ref, observed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const o of record.observations) {
        obs.run(
          analysisId,
          sourceId,
          o.kind,
          o.key,
          o.value.slice(0, 500),
          o.numericValue ?? null,
          clamp01(o.confidence),
          o.evidence.slice(0, 500),
          o.sourceRef ?? null,
          record.finishedAt,
        );
      }

      const ref = this.db.prepare(
        `INSERT INTO source_references (analysis_id, url, kind, http_status, content_type, bytes, sha256, fetched_at, from_cache, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const r of record.references) {
        ref.run(
          analysisId,
          r.url,
          r.kind,
          r.httpStatus ?? null,
          r.contentType ?? null,
          r.bytes,
          r.sha256 ?? null,
          r.fetchedAt,
          r.fromCache ? 1 : 0,
          r.note ?? null,
        );
      }

      const profile = record.profile;
      if (profile) {
        const colorStmt = this.db.prepare(
          `INSERT INTO color_observations (analysis_id, source_id, hex, role, frequency, hue_family, lightness, chroma, hue, confidence, evidence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const c of profile.colors.palette) {
          const meta = colorMeta(c.hex);
          colorStmt.run(
            analysisId,
            sourceId,
            c.hex,
            c.role,
            c.frequency,
            meta.family,
            meta.l,
            meta.c,
            meta.h,
            clamp01(c.confidence),
            c.evidence.slice(0, 500),
          );
        }
        const fontStmt = this.db.prepare(
          `INSERT INTO font_observations (analysis_id, source_id, family, normalized, role, classification, delivery, frequency, confidence, evidence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const f of profile.typography.fonts) {
          fontStmt.run(
            analysisId,
            sourceId,
            f.family,
            f.normalized,
            f.role,
            f.classification,
            f.delivery,
            f.frequency,
            clamp01(f.confidence),
            f.evidence.slice(0, 500),
          );
        }
        const compStmt = this.db.prepare(
          `INSERT INTO component_observations (analysis_id, source_id, component, property, value, confidence, evidence)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const c of profile.components) {
          compStmt.run(analysisId, sourceId, c.component, c.property, c.value, clamp01(c.confidence), c.evidence.slice(0, 500));
        }
        const paletteCore = {
          background: profile.colors.background,
          text: profile.colors.text,
          brand: profile.colors.brandCandidates,
          themeColor: profile.meta.themeColor,
        };
        this.db
          .prepare(
            "INSERT INTO color_palettes (analysis_id, source_id, scheme, palette_json, confidence) VALUES (?, ?, ?, ?, ?)",
          )
          .run(analysisId, sourceId, profile.colors.scheme, JSON.stringify(paletteCore), profile.colors.background ? 0.7 : 0.4);
      }
      return analysisId;
    });
  }

  getAnalysis(id: number): AnalysisRow | undefined {
    return this.db.prepare("SELECT * FROM analyses WHERE id = ?").get(id) as AnalysisRow | undefined;
  }

  latestAnalysis(sourceId: number): AnalysisRow | undefined {
    return this.db
      .prepare("SELECT * FROM analyses WHERE source_id = ? ORDER BY finished_at DESC, id DESC LIMIT 1")
      .get(sourceId) as AnalysisRow | undefined;
  }

  latestAnalysisByUrl(url: string): AnalysisRow | undefined {
    return this.db
      .prepare("SELECT * FROM analyses WHERE url = ? OR final_url = ? ORDER BY finished_at DESC, id DESC LIMIT 1")
      .get(url, url) as AnalysisRow | undefined;
  }

  /** Latest successful/partial analysis per source, joined with curated source metadata. */
  latestProfiles(filter: { category?: CategoryId; kind?: SourceKind } = {}): Array<{
    source: SourceRow;
    analysis: AnalysisRow;
    profile: SiteProfile;
    classification: StyleClassification | undefined;
  }> {
    const clauses = ["a.status IN ('success', 'partial')", "a.profile_json IS NOT NULL"];
    const p: Record<string, string> = {};
    if (filter.category) {
      clauses.push("s.category_id = :category");
      p.category = filter.category;
    }
    if (filter.kind) {
      clauses.push("s.kind = :kind");
      p.kind = filter.kind;
    }
    const rows = this.db
      .prepare(
        `SELECT a.*, s.id AS s_id FROM analyses a
         JOIN sources s ON s.id = a.source_id
         WHERE ${clauses.join(" AND ")}
           AND a.id = (SELECT a2.id FROM analyses a2 WHERE a2.source_id = a.source_id
                         AND a2.status IN ('success', 'partial') ORDER BY a2.finished_at DESC, a2.id DESC LIMIT 1)
         ORDER BY s.id`,
      )
      .all(p) as unknown as Array<AnalysisRow & { s_id: number }>;
    const out = [];
    for (const row of rows) {
      const source = this.getSource(row.s_id);
      if (!source || !row.profile_json) continue;
      out.push({
        source,
        analysis: row,
        profile: JSON.parse(row.profile_json) as SiteProfile,
        classification: row.classification_json ? (JSON.parse(row.classification_json) as StyleClassification) : undefined,
      });
    }
    return out;
  }

  // ---------- HTTP & robots cache ----------

  getCached(url: string): CachedResponse | undefined {
    const row = this.db.prepare("SELECT * FROM http_cache WHERE url = ?").get(url) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      url: row.url as string,
      status: row.status as number,
      contentType: (row.content_type as string) ?? null,
      etag: (row.etag as string) ?? null,
      lastModified: (row.last_modified as string) ?? null,
      body: (row.body as string) ?? null,
      bytes: row.bytes as number,
      sha256: (row.sha256 as string) ?? null,
      fetchedAt: row.fetched_at as string,
      expiresAt: row.expires_at as string,
    };
  }

  putCached(entry: CachedResponse): void {
    this.db
      .prepare(
        `INSERT INTO http_cache (url, status, content_type, etag, last_modified, body, bytes, sha256, fetched_at, expires_at, hits)
         VALUES (:url, :status, :contentType, :etag, :lastModified, :body, :bytes, :sha256, :fetchedAt, :expiresAt, 0)
         ON CONFLICT(url) DO UPDATE SET status = excluded.status, content_type = excluded.content_type, etag = excluded.etag,
           last_modified = excluded.last_modified, body = excluded.body, bytes = excluded.bytes, sha256 = excluded.sha256,
           fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`,
      )
      .run(params({ ...entry }));
  }

  touchCache(url: string, expiresAt?: string): void {
    if (expiresAt) {
      this.db.prepare("UPDATE http_cache SET hits = hits + 1, expires_at = ? WHERE url = ?").run(expiresAt, url);
    } else {
      this.db.prepare("UPDATE http_cache SET hits = hits + 1 WHERE url = ?").run(url);
    }
  }

  getRobots(origin: string): { status: number; body: string | null; expiresAt: string } | undefined {
    const row = this.db.prepare("SELECT status, body, expires_at FROM robots_cache WHERE origin = ?").get(origin) as
      | { status: number; body: string | null; expires_at: string }
      | undefined;
    return row ? { status: row.status, body: row.body, expiresAt: row.expires_at } : undefined;
  }

  putRobots(origin: string, status: number, body: string | null, ttlMs: number): void {
    const fetchedAt = new Date();
    this.db
      .prepare(
        `INSERT INTO robots_cache (origin, status, body, fetched_at, expires_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(origin) DO UPDATE SET status = excluded.status, body = excluded.body,
           fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`,
      )
      .run(origin, status, body, fetchedAt.toISOString(), new Date(fetchedAt.getTime() + ttlMs).toISOString());
  }

  // ---------- research jobs ----------

  createJob(paramsJson: Record<string, unknown>, sourceIds: number[]): string {
    const id = `job_${randomUUID().slice(0, 8)}`;
    const ts = now();
    transaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO research_jobs (id, status, params_json, total, created_at, updated_at)
           VALUES (?, 'pending', ?, ?, ?, ?)`,
        )
        .run(id, JSON.stringify(paramsJson), sourceIds.length, ts, ts);
      const item = this.db.prepare(
        "INSERT INTO research_job_items (job_id, source_id, status, attempts, updated_at) VALUES (?, ?, 'pending', 0, ?)",
      );
      for (const sid of sourceIds) item.run(id, sid, ts);
    });
    return id;
  }

  getJob(id: string): JobRow | undefined {
    return this.db.prepare("SELECT * FROM research_jobs WHERE id = ?").get(id) as JobRow | undefined;
  }

  listJobs(limit = 10): JobRow[] {
    return this.db
      .prepare("SELECT * FROM research_jobs ORDER BY created_at DESC LIMIT ?")
      .all(limit) as unknown as JobRow[];
  }

  setJobStatus(id: string, status: JobStatus, lastError?: string): void {
    const ts = now();
    this.db
      .prepare(
        `UPDATE research_jobs SET status = :status, updated_at = :ts,
           started_at = CASE WHEN :status = 'running' AND started_at IS NULL THEN :ts ELSE started_at END,
           finished_at = CASE WHEN :status IN ('completed', 'failed', 'cancelled', 'interrupted') THEN :ts ELSE NULL END,
           last_error = COALESCE(:lastError, last_error)
         WHERE id = :id`,
      )
      .run(params({ id, status, ts, lastError }));
  }

  pendingJobItems(jobId: string): Array<{ source_id: number; attempts: number }> {
    return this.db
      .prepare(
        "SELECT source_id, attempts FROM research_job_items WHERE job_id = ? AND status IN ('pending', 'running') ORDER BY source_id",
      )
      .all(jobId) as unknown as Array<{ source_id: number; attempts: number }>;
  }

  updateJobItem(jobId: string, sourceId: number, status: JobItemStatus, extra: { analysisId?: number; error?: string } = {}): void {
    transaction(this.db, () => {
      this.db
        .prepare(
          `UPDATE research_job_items SET status = :status, analysis_id = COALESCE(:analysisId, analysis_id),
             error = :error, updated_at = :ts, attempts = attempts + CASE WHEN :status = 'running' THEN 1 ELSE 0 END
           WHERE job_id = :jobId AND source_id = :sourceId`,
        )
        .run(params({ jobId, sourceId, status, analysisId: extra.analysisId, error: extra.error?.slice(0, 1000), ts: now() }));
      this.refreshJobCounters(jobId);
    });
  }

  private refreshJobCounters(jobId: string): void {
    this.db
      .prepare(
        `UPDATE research_jobs SET
           processed = (SELECT COUNT(*) FROM research_job_items WHERE job_id = :id AND status NOT IN ('pending', 'running')),
           succeeded = (SELECT COUNT(*) FROM research_job_items WHERE job_id = :id AND status IN ('success', 'partial')),
           failed = (SELECT COUNT(*) FROM research_job_items WHERE job_id = :id AND status IN ('failed', 'blocked')),
           skipped = (SELECT COUNT(*) FROM research_job_items WHERE job_id = :id AND status = 'skipped'),
           updated_at = :ts
         WHERE id = :id`,
      )
      .run(params({ id: jobId, ts: now() }));
  }

  /** Jobs left 'running' by a crashed or killed process become resumable. */
  markInterruptedJobs(): number {
    const result = this.db
      .prepare(
        "UPDATE research_jobs SET status = 'interrupted', finished_at = ?, updated_at = ? WHERE status IN ('running', 'pending')",
      )
      .run(now(), now());
    this.db.prepare("UPDATE research_job_items SET status = 'pending' WHERE status = 'running'").run();
    return Number(result.changes);
  }

  jobItemErrors(jobId: string, limit = 20): Array<{ url: string; status: string; error: string | null }> {
    return this.db
      .prepare(
        `SELECT s.url, i.status, i.error FROM research_job_items i JOIN sources s ON s.id = i.source_id
         WHERE i.job_id = ? AND i.status IN ('failed', 'blocked') ORDER BY i.updated_at DESC LIMIT ?`,
      )
      .all(jobId, limit) as unknown as Array<{ url: string; status: string; error: string | null }>;
  }

  // ---------- patterns ----------

  replacePatterns(origin: PatternRecord["origin"], patterns: PatternRecord[]): void {
    transaction(this.db, () => {
      this.db.prepare("DELETE FROM design_patterns WHERE origin = ?").run(origin);
      const stmt = this.db.prepare(
        `INSERT INTO design_patterns (id, origin, kind, name, description, category_id, component, dimension, value,
           keywords_json, support_count, sample_size, share, lift, confidence, evidence_json, rationale, updated_at)
         VALUES (:id, :origin, :kind, :name, :description, :categoryId, :component, :dimension, :value,
           :keywords, :supportCount, :sampleSize, :share, :lift, :confidence, :evidence, :rationale, :ts)`,
      );
      const ts = now();
      for (const p of patterns) {
        stmt.run(
          params({
            id: p.id,
            origin: p.origin,
            kind: p.kind,
            name: p.name,
            description: p.description,
            categoryId: p.categoryId ?? undefined,
            component: p.component ?? undefined,
            dimension: p.dimension ?? undefined,
            value: p.value ?? undefined,
            keywords: JSON.stringify(p.keywords),
            supportCount: p.supportCount,
            sampleSize: p.sampleSize,
            share: p.share ?? undefined,
            lift: p.lift ?? undefined,
            confidence: clamp01(p.confidence),
            evidence: JSON.stringify(p.evidence),
            rationale: p.rationale ?? undefined,
            ts,
          }),
        );
      }
    });
  }

  listPatterns(filter: { categories?: string[]; component?: string; origin?: PatternRecord["origin"] } = {}): PatternRow[] {
    const clauses: string[] = [];
    const values: string[] = [];
    if (filter.categories && filter.categories.length > 0) {
      clauses.push(`(category_id IS NULL OR category_id IN (${filter.categories.map(() => "?").join(", ")}))`);
      values.push(...filter.categories);
    }
    if (filter.component) {
      clauses.push("(component IS NULL OR component = ?)");
      values.push(filter.component);
    }
    if (filter.origin) {
      clauses.push("origin = ?");
      values.push(filter.origin);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return this.db
      .prepare(`SELECT * FROM design_patterns ${where} ORDER BY confidence DESC, id`)
      .all(...values) as unknown as PatternRow[];
  }

  // ---------- generated design systems (recommendations) ----------

  saveDesignSystem(row: Omit<DesignSystemRow, "created_at">): void {
    this.db
      .prepare(
        `INSERT INTO design_systems (id, project_key, project_path, prompt_excerpt, direction_id, spec_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, row.project_key, row.project_path, row.prompt_excerpt, row.direction_id, row.spec_json, now());
  }

  getDesignSystem(id: string): DesignSystemRow | undefined {
    return this.db.prepare("SELECT * FROM design_systems WHERE id = ?").get(id) as DesignSystemRow | undefined;
  }

  latestDesignSystemForProject(projectKey: string): DesignSystemRow | undefined {
    return this.db
      .prepare("SELECT * FROM design_systems WHERE project_key = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .get(projectKey) as DesignSystemRow | undefined;
  }

  recentDirections(limit = 12): string[] {
    return (
      this.db
        .prepare("SELECT direction_id FROM design_systems ORDER BY created_at DESC, rowid DESC LIMIT ?")
        .all(limit) as Array<{ direction_id: string }>
    ).map((r) => r.direction_id);
  }

  // ---------- meta & stats ----------

  getMeta(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }

  stats() {
    const one = <T>(sql: string, ...args: Array<string | number>) => this.db.prepare(sql).get(...args) as T;
    const sources = one<{ n: number }>("SELECT COUNT(*) AS n FROM sources WHERE enabled = 1").n;
    const byKind = this.db
      .prepare("SELECT kind, COUNT(*) AS n FROM sources WHERE enabled = 1 GROUP BY kind")
      .all() as Array<{ kind: string; n: number }>;
    const analyzed = one<{ n: number }>(
      "SELECT COUNT(DISTINCT source_id) AS n FROM analyses WHERE status IN ('success', 'partial') AND source_id IS NOT NULL",
    ).n;
    const failedSources = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sources s WHERE NOT EXISTS (SELECT 1 FROM analyses a WHERE a.source_id = s.id AND a.status IN ('success', 'partial'))
         AND EXISTS (SELECT 1 FROM analyses a WHERE a.source_id = s.id AND a.status IN ('failed', 'blocked'))`,
    ).n;
    const categories = this.db
      .prepare(
        `SELECT c.id, c.label,
           (SELECT COUNT(*) FROM sources s WHERE s.category_id = c.id AND s.enabled = 1) AS sources,
           (SELECT COUNT(DISTINCT a.source_id) FROM analyses a JOIN sources s ON s.id = a.source_id
              WHERE s.category_id = c.id AND a.status IN ('success', 'partial')) AS analyzed
         FROM categories c ORDER BY c.id`,
      )
      .all() as Array<{ id: string; label: string; sources: number; analyzed: number }>;
    const lastSuccess = one<{ t: string | null }>(
      "SELECT MAX(finished_at) AS t FROM analyses WHERE status IN ('success', 'partial')",
    ).t;
    const cache = one<{ entries: number; bytes: number | null; hits: number | null; expired: number }>(
      "SELECT COUNT(*) AS entries, SUM(bytes) AS bytes, SUM(hits) AS hits, SUM(CASE WHEN expires_at < ? THEN 1 ELSE 0 END) AS expired FROM http_cache",
      now(),
    );
    const robots = one<{ n: number }>("SELECT COUNT(*) AS n FROM robots_cache").n;
    const analyses = one<{ n: number }>("SELECT COUNT(*) AS n FROM analyses").n;
    const observations = one<{ n: number }>("SELECT COUNT(*) AS n FROM observations").n;
    const patterns = this.db
      .prepare("SELECT origin, COUNT(*) AS n FROM design_patterns GROUP BY origin")
      .all() as Array<{ origin: string; n: number }>;
    const designSystems = one<{ n: number }>("SELECT COUNT(*) AS n FROM design_systems").n;
    const recentErrors = this.db
      .prepare(
        `SELECT a.url, a.status, a.error, a.finished_at FROM analyses a
         WHERE a.status IN ('failed', 'blocked') ORDER BY a.finished_at DESC LIMIT 15`,
      )
      .all() as Array<{ url: string; status: string; error: string | null; finished_at: string }>;
    return {
      schemaVersion: schemaVersion(this.db),
      sources,
      sourcesByKind: Object.fromEntries(byKind.map((r) => [r.kind, r.n])),
      analyzedSources: analyzed,
      sourcesWithOnlyFailures: failedSources,
      totalAnalyses: analyses,
      observations,
      categories,
      lastSuccessfulAnalysis: lastSuccess,
      cache: { entries: cache.entries, bytes: cache.bytes ?? 0, hits: cache.hits ?? 0, expired: cache.expired ?? 0, robotsEntries: robots },
      patterns: Object.fromEntries(patterns.map((r) => [r.origin, r.n])),
      generatedDesignSystems: designSystems,
      recentErrors,
    };
  }

  /** Full evidence export (no cache bodies) for backup and offline analysis. */
  exportDataset() {
    const all = (sql: string) => this.db.prepare(sql).all();
    const parse = (rows: Array<Record<string, unknown>>, keys: string[]) =>
      rows.map((r) => {
        const out: Record<string, unknown> = { ...r };
        for (const k of keys) {
          if (typeof out[k] === "string") {
            try {
              out[k.replace(/_json$/, "")] = JSON.parse(out[k] as string);
              delete out[k];
            } catch {
              /* keep raw */
            }
          }
        }
        return out;
      });
    return {
      format: "design-intelligence-dataset",
      formatVersion: 1,
      exportedAt: now(),
      schemaVersion: schemaVersion(this.db),
      note:
        "Evidence only. Observations come from static analysis of fetched HTML/CSS or design-token files; " +
        "source metadata (category, audience, positioning) is curated, not measured.",
      categories: all("SELECT * FROM categories"),
      sources: parse(all("SELECT * FROM sources") as Array<Record<string, unknown>>, ["tags_json", "config_json"]),
      analyses: parse(all("SELECT * FROM analyses") as Array<Record<string, unknown>>, [
        "profile_json",
        "classification_json",
        "limitations_json",
      ]),
      observations: all("SELECT * FROM observations"),
      colorObservations: all("SELECT * FROM color_observations"),
      fontObservations: all("SELECT * FROM font_observations"),
      componentObservations: all("SELECT * FROM component_observations"),
      sourceReferences: all("SELECT * FROM source_references"),
      patterns: parse(all("SELECT * FROM design_patterns") as Array<Record<string, unknown>>, ["keywords_json", "evidence_json"]),
    };
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function colorMeta(hex: string): { family: string; l: number; c: number; h: number | null } {
  const lch = toOklch(hex);
  if (!lch) return { family: "neutral", l: 0, c: 0, h: null };
  return { family: hueFamily(lch), l: round(lch.l, 4), c: round(lch.c, 4), h: lch.c < 0.02 ? null : round(lch.h, 1) };
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
