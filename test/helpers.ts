import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, type ResearchConfig } from "../src/config.js";
import { openDatabase } from "../src/db/database.js";
import { Store } from "../src/db/store.js";
import { RobotsPolicy } from "../src/net/robots.js";
import { SafeFetcher } from "../src/net/safeFetch.js";
import { isPublicAddress } from "../src/net/ssrf.js";
import { CachedFetcher } from "../src/research/cachedFetcher.js";

export const FIXTURES = join(import.meta.dirname, "fixtures");

export type Route = (req: IncomingMessage, res: ServerResponse) => void;

export interface TestServer {
  url: string;
  port: number;
  hits: Map<string, number>;
  close: () => Promise<void>;
}

/** Local HTTP server; routes map a path to a handler, everything else 404s. */
export async function startServer(routes: Record<string, Route>): Promise<TestServer> {
  const hits = new Map<string, number>();
  const server: Server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0]!;
    hits.set(path, (hits.get(path) ?? 0) + 1);
    const route = routes[path];
    if (route) return route(req, res);
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    hits,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export function file(path: string, contentType: string, extraHeaders: Record<string, string> = {}): Route {
  return (_req, res) => {
    res.writeHead(200, { "content-type": contentType, ...extraHeaders });
    res.end(readFileSync(join(FIXTURES, path)));
  };
}

export function text(body: string, contentType = "text/plain", status = 200, extraHeaders: Record<string, string> = {}): Route {
  return (_req, res) => {
    res.writeHead(status, { "content-type": contentType, ...extraHeaders });
    res.end(body);
  };
}

/** Loopback is allowed so tests can reach the local server; every other private range stays blocked. */
export const testAddressPolicy = (ip: string) => ip === "127.0.0.1" || isPublicAddress(ip);

export function testResearchConfig(overrides: Partial<ResearchConfig> = {}): ResearchConfig {
  return { ...loadConfig({}).research, perHostIntervalMs: 250, maxRetries: 0, requestTimeoutMs: 5000, ...overrides };
}

export function testFetcher(port: number, overrides: Partial<ConstructorParameters<typeof SafeFetcher>[0]> = {}): SafeFetcher {
  return new SafeFetcher({
    userAgent: "DesignIntelligenceBot/test",
    timeoutMs: 5000,
    maxRetries: 0,
    perHostIntervalMs: 0,
    addressPolicy: testAddressPolicy,
    urlPolicy: { allowedPorts: { http: ["", String(port)], https: [""] } },
    ...overrides,
  });
}

export function tempStore(): Store {
  const dir = mkdtempSync(join(tmpdir(), "dim-test-"));
  const store = new Store(openDatabase(join(dir, "test.db")));
  store.seedCategories();
  return store;
}

export function testDeps(port: number, store?: Store) {
  const fetcher = testFetcher(port);
  const http = new CachedFetcher(fetcher, store, 60_000);
  const robots = new RobotsPolicy(fetcher, "DesignIntelligenceBot", store);
  return { fetcher, http, robots, config: testResearchConfig() };
}
