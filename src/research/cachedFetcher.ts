import type { ReferenceInput, Store } from "../db/store.js";
import type { FetchRequest, FetchResult, SafeFetcher } from "../net/safeFetch.js";

export interface CachedFetchOutcome {
  result: FetchResult;
  fromCache: boolean;
  reference: ReferenceInput;
}

/**
 * Wraps SafeFetcher with the SQLite HTTP cache. Fresh entries are reused without network
 * access; stale entries are revalidated with ETag/Last-Modified so unchanged files cost a 304.
 */
export class CachedFetcher {
  constructor(
    readonly fetcher: SafeFetcher,
    private readonly store: Store | undefined,
    private readonly ttlMs: number,
  ) {}

  async get(url: string, request: FetchRequest, kind: string, options: { refresh?: boolean } = {}): Promise<CachedFetchOutcome> {
    const cached = this.store?.getCached(url);
    const now = Date.now();
    if (cached && cached.body !== null && !options.refresh && Date.parse(cached.expiresAt) > now && cached.status < 300) {
      this.store?.touchCache(url);
      return {
        fromCache: true,
        result: {
          url: cached.url,
          status: cached.status,
          contentType: cached.contentType ?? "",
          headers: {},
          body: cached.body,
          bytes: cached.bytes,
          sha256: cached.sha256 ?? "",
          redirects: [],
          fetchedAt: cached.fetchedAt,
        },
        reference: { url, kind, httpStatus: cached.status, contentType: cached.contentType ?? undefined, bytes: cached.bytes, sha256: cached.sha256 ?? undefined, fetchedAt: cached.fetchedAt, fromCache: true },
      };
    }

    const headers: Record<string, string> = { ...request.headers };
    const canRevalidate = cached && cached.body !== null && cached.status < 300;
    if (canRevalidate && cached.etag) headers["if-none-match"] = cached.etag;
    if (canRevalidate && cached.lastModified) headers["if-modified-since"] = cached.lastModified;

    const result = await this.fetcher.fetchText(url, { ...request, headers });
    const expiresAt = new Date(Date.now() + this.ttlMs).toISOString();
    if (result.status === 304 && canRevalidate) {
      this.store?.touchCache(url, expiresAt);
      return {
        fromCache: true,
        result: { ...result, status: cached.status, body: cached.body!, bytes: cached.bytes, sha256: cached.sha256 ?? "", contentType: cached.contentType ?? result.contentType },
        reference: { url, kind, httpStatus: 304, contentType: cached.contentType ?? undefined, bytes: cached.bytes, sha256: cached.sha256 ?? undefined, fetchedAt: result.fetchedAt, fromCache: true, note: "revalidated (304 Not Modified)" },
      };
    }
    if (result.status >= 200 && result.status < 300) {
      this.store?.putCached({
        url,
        status: result.status,
        contentType: result.contentType || null,
        etag: result.headers.etag ?? null,
        lastModified: result.headers["last-modified"] ?? null,
        body: result.body,
        bytes: result.bytes,
        sha256: result.sha256,
        fetchedAt: result.fetchedAt,
        expiresAt,
      });
    }
    return {
      fromCache: false,
      result,
      reference: {
        url: result.url,
        kind,
        httpStatus: result.status,
        contentType: result.contentType,
        bytes: result.bytes,
        sha256: result.sha256,
        fetchedAt: result.fetchedAt,
        fromCache: false,
        note: result.redirects.length ? `redirected via ${result.redirects.length} hop(s)` : undefined,
      },
    };
  }
}
