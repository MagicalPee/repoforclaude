import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import type { Store } from "../src/db/store.js";
import { ResearchService } from "../src/research/service.js";
import { file, startServer, type TestServer, tempStore, testFetcher, text } from "./helpers.js";

function config(overrides: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "dim-research-"));
  return loadConfig({ DIM_DATA_DIR: dir, DIM_CONCURRENCY: "2", DIM_MAX_RETRIES: "0", DIM_LOG_LEVEL: "error", ...overrides });
}

function addSite(store: Store, url: string, name: string, category: "gaming" | "fintech" = "fintech") {
  return store.upsertSource({ kind: "website", url, name, category, tags: [] });
}

describe("research jobs", () => {
  let server: TestServer;
  let active = 0;
  let peak = 0;
  const slow = (body: string) => async (_req: unknown, res: import("node:http").ServerResponse) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 60));
    active--;
    res.writeHead(200, { "content-type": "text/html" });
    res.end(body);
  };
  beforeAll(async () => {
    const page = '<html lang="en"><head><style>body{color:#1a1a1a;background:#fafafa;font-family:"Inter",sans-serif} .btn{background:#0f766e;border-radius:6px}</style></head><body><h1>Hi</h1></body></html>';
    server = await startServer({
      "/robots.txt": text("User-agent: *\nDisallow: /c/\n"),
      "/a/": file("site/index.html", "text/html"),
      "/assets/main.css": file("site/assets/main.css", "text/css"),
      "/assets/tokens.css": file("site/assets/tokens.css", "text/css"),
      "/b/": text("down", "text/plain", 500),
      "/c/": text("<html></html>", "text/html"),
      "/s1/": slow(page),
      "/s2/": slow(page),
      "/s3/": slow(page),
      "/s4/": slow(page),
      "/s5/": slow(page),
    });
  });
  afterAll(async () => server.close());

  it("completes jobs with mixed outcomes and records why sources failed", async () => {
    const store = tempStore();
    for (const p of ["a", "b", "c"]) addSite(store, `${server.url}/${p}/`, p);
    const service = new ResearchService(store, config(), testFetcher(server.port));
    const started = service.startJob({ maxSources: 10 });
    expect(started.status).toBe("started");
    expect(started.queued).toBe(3);
    const job = await service.waitForJob(started.jobId!, 15_000);
    expect(job).toMatchObject({ status: "completed", total: 3, processed: 3, succeeded: 1, failed: 2 });
    const errors = store.jobItemErrors(started.jobId!);
    expect(errors.find((e) => e.url.endsWith("/b/"))?.error).toMatch(/HTTP 500/);
    expect(errors.find((e) => e.url.endsWith("/c/"))?.status).toBe("blocked");

    // Incremental: the fresh success is skipped, failures are retried.
    const again = service.startJob({ maxSources: 10 });
    expect(again.skippedFresh).toBe(1);
    expect(again.queued).toBe(2);
    await service.waitForJob(again.jobId!, 15_000);
    const refresh = service.startJob({ maxSources: 10, refresh: true });
    expect(refresh.queued).toBe(3);
    await service.waitForJob(refresh.jobId!, 15_000);
    await service.close();
  });

  it("bounds concurrency", async () => {
    const store = tempStore();
    for (const p of ["s1", "s2", "s3", "s4", "s5"]) addSite(store, `${server.url}/${p}/`, p);
    peak = 0;
    const service = new ResearchService(store, config({ DIM_CONCURRENCY: "2" }), testFetcher(server.port));
    const started = service.startJob({ maxSources: 5 });
    const job = await service.waitForJob(started.jobId!, 15_000);
    expect(job?.status).toBe("completed");
    expect(job?.succeeded).toBe(5);
    expect(peak).toBeLessThanOrEqual(2);
    await service.close();
  });

  it("refuses a second concurrent job and supports cancellation", async () => {
    const store = tempStore();
    for (const p of ["s1", "s2", "s3", "s4", "s5"]) addSite(store, `${server.url}/${p}/`, p);
    const service = new ResearchService(store, config({ DIM_CONCURRENCY: "1" }), testFetcher(server.port));
    const first = service.startJob({ maxSources: 5 });
    expect(service.startJob({ maxSources: 5 }).status).toBe("already_running");
    expect(service.cancelJob(first.jobId!)).toBe(true);
    const job = await service.waitForJob(first.jobId!, 15_000);
    expect(job?.status).toBe("cancelled");
    expect(job!.processed).toBeLessThan(5);
    await service.close();
  });

  it("resumes jobs interrupted by a crash", async () => {
    const store = tempStore();
    const ids = ["s1", "s2", "s3"].map((p) => addSite(store, `${server.url}/${p}/`, p));
    const jobId = store.createJob({}, ids);
    store.setJobStatus(jobId, "running");
    store.updateJobItem(jobId, ids[0]!, "running");
    // A new process starts: running jobs become interrupted and their items pending again.
    expect(store.markInterruptedJobs()).toBe(1);
    expect(store.getJob(jobId)?.status).toBe("interrupted");
    const service = new ResearchService(store, config(), testFetcher(server.port));
    const resumed = service.resumeJob(jobId);
    expect(resumed.queued).toBe(3);
    const job = await service.waitForJob(jobId, 15_000);
    expect(job).toMatchObject({ status: "completed", processed: 3, succeeded: 3 });
    await service.close();
  });

  it("reuses fresh ad-hoc analyses unless refresh is requested", async () => {
    const store = tempStore();
    const service = new ResearchService(store, config(), testFetcher(server.port));
    const first = await service.analyzeUrl(`${server.url}/s1/`);
    expect(first.reused).toBe(false);
    expect(first.record?.status).toBe("success");
    const second = await service.analyzeUrl(`${server.url}/s1/`);
    expect(second.reused).toBe(true);
    const third = await service.analyzeUrl(`${server.url}/s1/`, true);
    expect(third.reused).toBe(false);
    const unsafe = await service.analyzeUrl("http://10.0.0.1/");
    expect(unsafe.record?.status).toBe("failed");
    await service.close();
  });
});
