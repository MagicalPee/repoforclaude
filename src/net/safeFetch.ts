import { createHash } from "node:crypto";
import { Agent, type Dispatcher, fetch, ProxyAgent } from "undici";
import { log } from "../logger.js";
import { HostRateLimiter, sleep } from "./rateLimiter.js";
import {
  type AddressPolicy,
  assertHostResolvesPublic,
  createSafeLookup,
  isPublicAddress,
  type Resolver,
  UnsafeTargetError,
  type UrlPolicy,
  validatePublicUrl,
} from "./ssrf.js";

export class FetchError extends Error {
  constructor(
    message: string,
    readonly code:
      | "TOO_LARGE"
      | "CONTENT_TYPE"
      | "HTTP_STATUS"
      | "TOO_MANY_REDIRECTS"
      | "TIMEOUT"
      | "NETWORK"
      | "ROBOTS_DISALLOWED",
    readonly status?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export interface FetchRequest {
  /** Content-Type prefixes accepted (e.g. "text/css"); null accepts anything textual. */
  allowedContentTypes: string[] | null;
  maxBytes: number;
  accept?: string;
  maxRedirects?: number;
  headers?: Record<string, string>;
  /** Called before following each redirect; throw to refuse (used for robots.txt checks). */
  beforeRedirect?: (next: URL) => Promise<void>;
  /** Non-2xx statuses that should be returned instead of thrown (robots.txt needs 4xx). */
  passStatuses?: (status: number) => boolean;
}

export interface FetchResult {
  url: string;
  status: number;
  contentType: string;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  sha256: string;
  redirects: string[];
  fetchedAt: string;
}

export interface FetcherOptions {
  userAgent: string;
  timeoutMs: number;
  maxRetries: number;
  perHostIntervalMs: number;
  useProxy?: boolean;
  proxyUrl?: string;
  /** Test seams only; production code never sets these, and no env var or tool input reaches them. */
  addressPolicy?: AddressPolicy;
  resolver?: Resolver;
  urlPolicy?: UrlPolicy;
  rateLimiter?: HostRateLimiter;
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

/**
 * The only HTTP client the research system uses. Every hop of every request is validated:
 * URL shape before the request, resolved IP at connect time, redirect targets before they
 * are followed, then content type and decompressed size while the body streams.
 */
export class SafeFetcher {
  readonly limiter: HostRateLimiter;
  private readonly dispatcher: Dispatcher;
  private readonly policy: AddressPolicy;
  private readonly urlPolicy: UrlPolicy;
  private readonly viaProxy: boolean;

  constructor(private readonly options: FetcherOptions) {
    this.policy = options.addressPolicy ?? isPublicAddress;
    this.urlPolicy = { ...options.urlPolicy, addressPolicy: this.policy };
    this.limiter = options.rateLimiter ?? new HostRateLimiter(options.perHostIntervalMs);
    this.viaProxy = Boolean(options.useProxy && options.proxyUrl);
    const timeouts = { headersTimeout: options.timeoutMs, bodyTimeout: options.timeoutMs };
    this.dispatcher = this.viaProxy
      ? new ProxyAgent({ uri: options.proxyUrl!, ...timeouts })
      : new Agent({
          ...timeouts,
          connect: { lookup: createSafeLookup(this.policy, options.resolver) as never, timeout: options.timeoutMs },
        });
  }

  get usesProxy(): boolean {
    return this.viaProxy;
  }

  /** The URL check this fetcher applies to every hop. */
  validate(url: string | URL): URL {
    return validatePublicUrl(url, this.urlPolicy);
  }

  async close(): Promise<void> {
    await this.dispatcher.close();
  }

  async fetchText(rawUrl: string, request: FetchRequest): Promise<FetchResult> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.fetchOnce(rawUrl, request);
      } catch (error) {
        const retryAfter = this.retryDelay(error, attempt);
        if (retryAfter === null) throw error;
        attempt++;
        log.debug("retrying request", { url: rawUrl, attempt, delayMs: retryAfter });
        await sleep(retryAfter);
      }
    }
  }

  private retryDelay(error: unknown, attempt: number): number | null {
    if (attempt >= this.options.maxRetries) return null;
    if (error instanceof UnsafeTargetError) return null;
    if (error instanceof FetchError) {
      if (error.code === "HTTP_STATUS" && error.status && RETRYABLE_STATUS.has(error.status)) {
        const hinted = (error as FetchError & { retryAfterMs?: number }).retryAfterMs;
        return Math.min(30_000, hinted ?? backoff(attempt));
      }
      if (error.code === "TIMEOUT" || error.code === "NETWORK") return backoff(attempt);
      return null;
    }
    return backoff(attempt);
  }

  private async fetchOnce(rawUrl: string, request: FetchRequest): Promise<FetchResult> {
    const maxRedirects = request.maxRedirects ?? 5;
    const redirects: string[] = [];
    let current = this.validate(rawUrl);

    for (let hop = 0; ; hop++) {
      if (this.viaProxy) {
        // The proxy resolves DNS, so this pre-check is best effort (documented limitation).
        await assertHostResolvesPublic(current.hostname, this.policy, this.options.resolver);
      }
      await this.limiter.acquire(current.host);
      const signal = AbortSignal.timeout(this.options.timeoutMs);
      let response: Awaited<ReturnType<typeof fetch>>;
      try {
        response = await fetch(current.href, {
          dispatcher: this.dispatcher,
          redirect: "manual",
          signal,
          headers: {
            "user-agent": this.options.userAgent,
            accept: request.accept ?? "*/*",
            "accept-language": "en;q=0.9, *;q=0.5",
            ...request.headers,
          },
        });
      } catch (error) {
        throw toFetchError(error, current.href);
      }

      if (response.status >= 300 && response.status < 400 && response.status !== 304) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) throw new FetchError(`Redirect without Location from ${current.href}`, "HTTP_STATUS", response.status);
        if (hop >= maxRedirects) throw new FetchError(`More than ${maxRedirects} redirects starting at ${rawUrl}`, "TOO_MANY_REDIRECTS");
        const next = this.validate(new URL(location, current));
        await request.beforeRedirect?.(next);
        redirects.push(next.href);
        current = next;
        continue;
      }

      const headers = Object.fromEntries(response.headers.entries());
      const ok = (response.status >= 200 && response.status < 300) || response.status === 304;
      if (!ok && !request.passStatuses?.(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        const err = new FetchError(`HTTP ${response.status} for ${current.href}`, "HTTP_STATUS", response.status);
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        if (retryAfter !== undefined) Object.assign(err, { retryAfterMs: retryAfter });
        throw err;
      }

      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      if (ok && response.status !== 304 && request.allowedContentTypes && !matchesType(contentType, request.allowedContentTypes)) {
        await response.body?.cancel().catch(() => undefined);
        throw new FetchError(
          `Unexpected content type "${contentType || "none"}" for ${current.href}; expected ${request.allowedContentTypes.join(", ")}`,
          "CONTENT_TYPE",
          response.status,
        );
      }
      if (/^(image|audio|video|font)\/|application\/(octet-stream|zip|pdf)/.test(contentType)) {
        await response.body?.cancel().catch(() => undefined);
        throw new FetchError(`Binary content type "${contentType}" refused for ${current.href}`, "CONTENT_TYPE", response.status);
      }

      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > request.maxBytes) {
        await response.body?.cancel().catch(() => undefined);
        throw new FetchError(`${current.href} declares ${declared} bytes (limit ${request.maxBytes})`, "TOO_LARGE");
      }

      const buffer = await readLimited(response.body, request.maxBytes, current.href);
      return {
        url: current.href,
        status: response.status,
        contentType,
        headers,
        body: decode(buffer, contentType),
        bytes: buffer.byteLength,
        sha256: createHash("sha256").update(buffer).digest("hex"),
        redirects,
        fetchedAt: new Date().toISOString(),
      };
    }
  }
}

function backoff(attempt: number): number {
  return Math.min(20_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function matchesType(contentType: string, allowed: string[]): boolean {
  if (!contentType) return allowed.includes("");
  return allowed.some((prefix) => prefix !== "" && contentType.startsWith(prefix));
}

async function readLimited(body: ReadableStream<Uint8Array> | null, maxBytes: number, url: string): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      // Counted after decompression, so compression bombs hit the same ceiling.
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new FetchError(`${url} exceeded the ${maxBytes}-byte limit`, "TOO_LARGE");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof FetchError) throw error;
    throw toFetchError(error, url);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function decode(buffer: Uint8Array, contentType: string): string {
  const charset = /charset=["']?([\w-]+)/.exec(contentType)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

function toFetchError(error: unknown, url: string): Error {
  if (error instanceof UnsafeTargetError || error instanceof FetchError) return error;
  // undici wraps connect errors (including our lookup refusal) in `cause`.
  const cause = (error as { cause?: unknown })?.cause;
  if (cause instanceof UnsafeTargetError) return cause;
  const name = (error as Error)?.name ?? "";
  const message = (error as Error)?.message ?? String(error);
  if (name === "TimeoutError" || name === "AbortError" || /timeout/i.test(message)) {
    return new FetchError(`Request to ${url} timed out`, "TIMEOUT");
  }
  const code = (cause as { code?: string } | undefined)?.code ?? (error as { code?: string })?.code;
  return new FetchError(`Network error for ${url}: ${code ?? message}`, "NETWORK");
}
