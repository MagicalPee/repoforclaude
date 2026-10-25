import type { Store } from "../db/store.js";
import { log } from "../logger.js";
import { FetchError, type SafeFetcher } from "./safeFetch.js";
import { UnsafeTargetError } from "./ssrf.js";

interface Rule {
  allow: boolean;
  pattern: string;
  regex: RegExp;
}

interface Group {
  agents: string[];
  rules: Rule[];
  crawlDelaySec?: number;
}

export interface RobotsDecision {
  allowed: boolean;
  reason: string;
  crawlDelayMs?: number;
}

const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** RFC 9309 parser: groups by user-agent, longest matching rule wins, ties go to allow. */
export class RobotsTxt {
  private readonly groups: Group[] = [];

  constructor(body: string) {
    let current: Group | null = null;
    let lastWasAgent = false;
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, "").trim();
      if (!line) continue;
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const field = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (field === "user-agent") {
        if (!current || !lastWasAgent) {
          current = { agents: [], rules: [] };
          this.groups.push(current);
        }
        current.agents.push(value.toLowerCase());
        lastWasAgent = true;
        continue;
      }
      lastWasAgent = false;
      if (!current) continue;
      if (field === "allow" || field === "disallow") {
        if (field === "disallow" && value === "") continue; // empty Disallow allows everything
        current.rules.push({ allow: field === "allow", pattern: value, regex: patternToRegex(value) });
      } else if (field === "crawl-delay") {
        const n = Number.parseFloat(value);
        if (Number.isFinite(n) && n >= 0) current.crawlDelaySec = n;
      }
    }
  }

  private groupFor(agentToken: string): Group[] {
    const token = agentToken.toLowerCase();
    const specific = this.groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
    if (specific.length > 0) return specific;
    return this.groups.filter((g) => g.agents.includes("*"));
  }

  check(path: string, agentToken: string): RobotsDecision {
    const groups = this.groupFor(agentToken);
    const rules = groups.flatMap((g) => g.rules);
    const delays = groups.map((g) => g.crawlDelaySec).filter((d): d is number => d !== undefined);
    const crawlDelayMs = delays.length > 0 ? Math.max(...delays) * 1000 : undefined;
    if (path === "/robots.txt") return { allowed: true, reason: "robots.txt itself is always fetchable", crawlDelayMs };
    let best: Rule | undefined;
    for (const rule of rules) {
      if (!rule.regex.test(path)) continue;
      if (
        !best ||
        rule.pattern.length > best.pattern.length ||
        (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
      ) {
        best = rule;
      }
    }
    if (!best) return { allowed: true, reason: "no matching rule", crawlDelayMs };
    return {
      allowed: best.allow,
      reason: `${best.allow ? "Allow" : "Disallow"}: ${best.pattern}`,
      crawlDelayMs,
    };
  }
}

/** Fetches, caches (24h, in SQLite when available) and evaluates robots.txt per origin. */
export class RobotsPolicy {
  private readonly memory = new Map<string, { status: number; body: string | null; expires: number }>();

  constructor(
    private readonly fetcher: SafeFetcher,
    private readonly agentToken: string,
    private readonly store?: Store,
  ) {}

  async check(url: URL): Promise<RobotsDecision> {
    const entry = await this.load(url.origin);
    // RFC 9309 §2.3.1.3: 4xx means no restrictions; 5xx/unreachable means assume full disallow.
    if (entry.status >= 400 && entry.status < 500) return { allowed: true, reason: `robots.txt returned ${entry.status}` };
    if (entry.status >= 500 || entry.status === 0) {
      return { allowed: false, reason: `robots.txt unreachable (${entry.status || "network error"}); treating site as disallowed` };
    }
    const decision = new RobotsTxt(entry.body ?? "").check(url.pathname + url.search, this.agentToken);
    if (decision.crawlDelayMs) this.fetcher.limiter.setCrawlDelay(url.host, decision.crawlDelayMs);
    return decision;
  }

  private async load(origin: string): Promise<{ status: number; body: string | null }> {
    const cached = this.memory.get(origin);
    if (cached && cached.expires > Date.now()) return cached;
    const stored = this.store?.getRobots(origin);
    if (stored && Date.parse(stored.expiresAt) > Date.now()) {
      this.memory.set(origin, { status: stored.status, body: stored.body, expires: Date.parse(stored.expiresAt) });
      return stored;
    }
    let status = 0;
    let body: string | null = null;
    try {
      const res = await this.fetcher.fetchText(`${origin}/robots.txt`, {
        allowedContentTypes: null,
        maxBytes: 512_000,
        accept: "text/plain, */*;q=0.5",
        passStatuses: (s) => s >= 400 && s < 600,
      });
      status = res.status;
      body = res.status < 300 ? res.body : null;
    } catch (error) {
      if (error instanceof UnsafeTargetError) throw error;
      if (error instanceof FetchError && error.code === "TOO_LARGE") {
        // RFC 9309 allows ignoring content past 500 KiB; treat oversize as unparseable → allow.
        status = 404;
      } else {
        log.debug("robots.txt unavailable", { origin, error: (error as Error).message });
        status = error instanceof FetchError && error.status ? error.status : 0;
      }
    }
    const ttl = status === 0 || status >= 500 ? 60 * 60 * 1000 : ROBOTS_TTL_MS;
    this.memory.set(origin, { status, body, expires: Date.now() + ttl });
    this.store?.putRobots(origin, status, body, ttl);
    return { status, body };
  }
}
