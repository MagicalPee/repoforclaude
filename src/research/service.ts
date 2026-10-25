import { analyzeDesignSystem, type DesignSystemConfig } from "../analysis/tokenAnalyzer.js";
import { analyzeWebsite } from "../analysis/websiteAnalyzer.js";
import { ANALYZER_VERSION, USER_AGENT_TOKEN, type AppConfig } from "../config.js";
import type { AnalysisRecord, AnalysisRow, JobRow, SourceRow, Store } from "../db/store.js";
import { log } from "../logger.js";
import { Semaphore, sleep } from "../net/rateLimiter.js";
import { RobotsPolicy } from "../net/robots.js";
import { SafeFetcher } from "../net/safeFetch.js";
import { refreshMinedPatterns } from "../patterns/miner.js";
import type { CategoryId, SourceKind } from "../types.js";
import { CachedFetcher } from "./cachedFetcher.js";

export interface StartJobParams {
  category?: CategoryId;
  kind?: SourceKind;
  maxSources?: number;
  refresh?: boolean;
}

export interface StartJobResult {
  jobId: string | null;
  status: "started" | "already_running" | "nothing_to_do";
  queued: number;
  skippedFresh: number;
  message: string;
}

const MAX_SOURCES_PER_JOB = 1000;

/**
 * Owns the crawler: one research job at a time, processed with bounded concurrency and
 * per-host rate limits. Every item's outcome is persisted as it finishes, so a killed
 * process leaves a job that `resume` continues from the first unfinished item.
 */
export class ResearchService {
  readonly fetcher: SafeFetcher;
  readonly http: CachedFetcher;
  readonly robots: RobotsPolicy;
  private running: { id: string; promise: Promise<void>; cancelled: boolean } | null = null;

  constructor(
    private readonly store: Store,
    private readonly config: AppConfig,
    fetcher?: SafeFetcher,
  ) {
    this.fetcher =
      fetcher ??
      new SafeFetcher({
        userAgent: config.research.userAgent,
        timeoutMs: config.research.requestTimeoutMs,
        maxRetries: config.research.maxRetries,
        perHostIntervalMs: config.research.perHostIntervalMs,
        useProxy: config.research.useProxy,
        proxyUrl: config.research.proxyUrl,
      });
    // Cached bodies are reused for the same freshness window as analyses.
    this.http = new CachedFetcher(this.fetcher, store, Math.max(1, config.research.reanalyzeAfterDays) * 86_400_000);
    this.robots = new RobotsPolicy(this.fetcher, USER_AGENT_TOKEN, store);
  }

  get activeJobId(): string | null {
    return this.running?.id ?? null;
  }

  async close(): Promise<void> {
    if (this.running) {
      this.running.cancelled = true;
      await this.running.promise.catch(() => undefined);
    }
    await this.fetcher.close();
  }

  private isFresh(row: AnalysisRow | undefined): boolean {
    if (!row || (row.status !== "success" && row.status !== "partial")) return false;
    // Analyses from an older analyzer are re-run; cached HTTP bodies keep that cheap.
    if (row.analyzer_version !== ANALYZER_VERSION) return false;
    const ageMs = Date.now() - Date.parse(row.finished_at);
    return ageMs < this.config.research.reanalyzeAfterDays * 86_400_000;
  }

  /** Picks never-analyzed sources first, then the stalest; fresh ones are skipped unless refresh. */
  selectSources(params: StartJobParams): { selected: SourceRow[]; skippedFresh: number } {
    const all = this.store.listSources({ kind: params.kind, category: params.category });
    const limit = Math.min(MAX_SOURCES_PER_JOB, Math.max(1, params.maxSources ?? 25));
    const withAge = all.map((s) => ({ s, last: this.store.latestAnalysis(s.id) }));
    let skippedFresh = 0;
    const candidates = withAge.filter(({ last }) => {
      if (!params.refresh && this.isFresh(last)) {
        skippedFresh++;
        return false;
      }
      return true;
    });
    candidates.sort((a, b) => {
      const ta = a.last ? Date.parse(a.last.finished_at) : 0;
      const tb = b.last ? Date.parse(b.last.finished_at) : 0;
      return ta - tb || a.s.id - b.s.id;
    });
    return { selected: candidates.slice(0, limit).map((c) => c.s), skippedFresh };
  }

  startJob(params: StartJobParams): StartJobResult {
    if (this.running) {
      const job = this.store.getJob(this.running.id);
      return {
        jobId: this.running.id,
        status: "already_running",
        queued: job ? job.total - job.processed : 0,
        skippedFresh: 0,
        message: `Job ${this.running.id} is still running; wait for it or cancel it before starting another.`,
      };
    }
    const { selected, skippedFresh } = this.selectSources(params);
    if (selected.length === 0) {
      return {
        jobId: null,
        status: "nothing_to_do",
        queued: 0,
        skippedFresh,
        message: skippedFresh
          ? `All ${skippedFresh} matching sources were analyzed within ${this.config.research.reanalyzeAfterDays} days. Pass refresh=true to re-analyze.`
          : "No sources match the filter.",
      };
    }
    const jobId = this.store.createJob({ ...params }, selected.map((s) => s.id));
    this.launch(jobId);
    return {
      jobId,
      status: "started",
      queued: selected.length,
      skippedFresh,
      message: `Researching ${selected.length} source(s) with concurrency ${this.config.research.concurrency} and ≥${this.config.research.perHostIntervalMs}ms between requests to the same host.`,
    };
  }

  resumeJob(jobId: string): StartJobResult {
    const job = this.store.getJob(jobId);
    if (!job) throw new Error(`Unknown job ${jobId}. Use get_research_status to list recent jobs.`);
    if (this.running) return this.startJob({});
    const pending = this.store.pendingJobItems(jobId).length;
    if (pending === 0) {
      return { jobId, status: "nothing_to_do", queued: 0, skippedFresh: 0, message: `Job ${jobId} has no unfinished items.` };
    }
    this.launch(jobId);
    return { jobId, status: "started", queued: pending, skippedFresh: 0, message: `Resumed ${jobId} with ${pending} unfinished item(s).` };
  }

  cancelJob(jobId: string): boolean {
    if (this.running?.id !== jobId) return false;
    this.running.cancelled = true;
    return true;
  }

  /** Waits up to `timeoutMs` for the job and returns its current row either way. */
  async waitForJob(jobId: string, timeoutMs: number): Promise<JobRow | undefined> {
    if (this.running?.id === jobId) {
      await Promise.race([this.running.promise, sleep(timeoutMs)]);
    }
    return this.store.getJob(jobId);
  }

  private launch(jobId: string): void {
    const state = { id: jobId, cancelled: false, promise: Promise.resolve() };
    state.promise = this.runJob(jobId, state)
      .catch((error) => {
        log.error("research job crashed", { jobId, error: (error as Error).message });
        this.store.setJobStatus(jobId, "failed", (error as Error).message);
      })
      .finally(() => {
        if (this.running?.id === jobId) this.running = null;
      });
    this.running = state;
  }

  private async runJob(jobId: string, state: { cancelled: boolean }): Promise<void> {
    this.store.setJobStatus(jobId, "running");
    const items = this.store.pendingJobItems(jobId);
    const gate = new Semaphore(this.config.research.concurrency);
    await Promise.all(
      items.map((item) =>
        gate.run(async () => {
          if (state.cancelled) return;
          const source = this.store.getSource(item.source_id);
          if (!source) {
            this.store.updateJobItem(jobId, item.source_id, "skipped", { error: "source removed" });
            return;
          }
          this.store.updateJobItem(jobId, source.id, "running");
          try {
            const record = await this.analyzeSource(source);
            const analysisId = this.store.saveAnalysis(record);
            this.store.updateJobItem(jobId, source.id, record.status, { analysisId, error: record.error });
          } catch (error) {
            // One bad source never stops the job.
            this.store.updateJobItem(jobId, source.id, "failed", { error: (error as Error).message });
          }
        }),
      ),
    );
    if (state.cancelled) {
      this.store.setJobStatus(jobId, "cancelled");
      return;
    }
    try {
      refreshMinedPatterns(this.store);
    } catch (error) {
      log.warn("pattern mining failed", { error: (error as Error).message });
    }
    this.store.setMeta("last_job_completed_at", new Date().toISOString());
    this.store.setJobStatus(jobId, "completed");
  }

  async analyzeSource(source: SourceRow, refresh = false): Promise<AnalysisRecord> {
    if (source.kind === "design_system") {
      const config = JSON.parse(source.config_json ?? "{}") as DesignSystemConfig;
      return analyzeDesignSystem(source.url, config, { http: this.http, config: this.config.research }, { sourceId: source.id, refresh });
    }
    return analyzeWebsite(source.url, { http: this.http, robots: this.robots, config: this.config.research }, { sourceId: source.id, refresh });
  }

  /**
   * Ad-hoc analysis for the analyze_website tool. Reuses a fresh stored analysis unless
   * `refresh`, and links the result to a known source when the URL matches one.
   */
  async analyzeUrl(url: string, refresh = false): Promise<{ record: AnalysisRecord | null; stored: AnalysisRow | undefined; reused: boolean }> {
    let normalized: string;
    try {
      normalized = this.fetcher.validate(url).href;
    } catch (error) {
      const now = new Date().toISOString();
      return {
        record: {
          url,
          status: "failed",
          error: (error as Error).message,
          startedAt: now,
          finishedAt: now,
          durationMs: 0,
          bytesFetched: 0,
          limitations: [],
          analyzerVersion: "",
          observations: [],
          references: [],
        },
        stored: undefined,
        reused: false,
      };
    }
    const existing = this.store.latestAnalysisByUrl(normalized);
    if (!refresh && this.isFresh(existing)) return { record: null, stored: existing, reused: true };
    const source = this.store.getSourceByUrl(normalized);
    const record = await analyzeWebsite(
      normalized,
      { http: this.http, robots: this.robots, config: this.config.research },
      { sourceId: source?.id, refresh },
    );
    const id = this.store.saveAnalysis(record);
    if (record.status === "success" || record.status === "partial") {
      try {
        refreshMinedPatterns(this.store);
      } catch (error) {
        log.warn("pattern mining failed", { error: (error as Error).message });
      }
    }
    return { record, stored: this.store.getAnalysis(id), reused: false };
  }
}
