import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HostRateLimiter, Semaphore } from "../src/net/rateLimiter.js";
import { RobotsPolicy, RobotsTxt } from "../src/net/robots.js";
import { FetchError, SafeFetcher } from "../src/net/safeFetch.js";
import { createSafeLookup, isPublicAddress, type Resolver, UnsafeTargetError, validatePublicUrl } from "../src/net/ssrf.js";
import { startServer, type TestServer, testFetcher, text } from "./helpers.js";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "127.10.0.5",
    "10.0.0.1",
    "172.16.5.4",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "198.18.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::7f00:1",
    "2001:db8::1",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(["8.8.8.8", "185.199.108.133", "1.1.1.1", "2606:4700:4700::1111", "2a00:1450:4001:82a::200e"])("allows %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
});

describe("validatePublicUrl", () => {
  it.each([
    ["file:///etc/passwd", /Only http and https/],
    ["ftp://example.com/", /Only http and https/],
    ["http://user:pass@example.com/", /credentials/],
    ["http://localhost/", /reserved or internal|Single-label/],
    ["http://intranet/", /Single-label/],
    ["http://metadata.google.internal/computeMetadata/v1/", /internal suffix/],
    ["http://printer.local/", /internal suffix/],
    ["http://127.0.0.1/", /non-public/],
    ["http://2130706433/", /non-public/],
    ["http://0x7f.0.0.1/", /non-public/],
    ["http://[::1]/", /non-public/],
    ["http://[::ffff:169.254.169.254]/", /non-public/],
    ["http://169.254.169.254/latest/meta-data/", /non-public/],
    ["https://example.com:8443/", /Port 8443/],
    ["not a url", /valid absolute URL/],
  ])("refuses %s", (url, message) => {
    expect(() => validatePublicUrl(url)).toThrow(message);
  });

  it("accepts ordinary public URLs", () => {
    expect(validatePublicUrl("https://stripe.com/pricing").hostname).toBe("stripe.com");
    expect(validatePublicUrl("http://example.org/").protocol).toBe("http:");
  });
});

function fakeResolver(map: Record<string, string[]>): Resolver {
  return (hostname, _options, callback) => {
    const list = map[hostname];
    if (!list) return callback(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }), []);
    callback(null, list.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })));
  };
}

describe("connect-time DNS validation", () => {
  it("refuses hosts that resolve to private addresses, even when mixed with public ones", async () => {
    const lookup = createSafeLookup(isPublicAddress, fakeResolver({ "evil.example.com": ["93.184.216.34", "10.0.0.5"], "ok.example.com": ["93.184.216.34"] }));
    const resolve = (host: string) =>
      new Promise<string>((res, rej) => lookup(host, {}, (err, address) => (err ? rej(err) : res(address as string))));
    await expect(resolve("evil.example.com")).rejects.toBeInstanceOf(UnsafeTargetError);
    await expect(resolve("ok.example.com")).resolves.toBe("93.184.216.34");
  });

  it("defeats DNS rebinding: the address checked is the address connected to", async () => {
    // First resolution says public, later ones say loopback. Only the connect-time lookup counts.
    let calls = 0;
    const rebinding: Resolver = (_h, _o, cb) => {
      calls++;
      cb(null, [{ address: calls === 1 ? "93.184.216.34" : "127.0.0.1", family: 4 }]);
    };
    const fetcher = new SafeFetcher({
      userAgent: "test",
      timeoutMs: 3000,
      maxRetries: 0,
      perHostIntervalMs: 0,
      resolver: rebinding,
      urlPolicy: { allowedPorts: { http: ["", "8080"], https: [""] } },
    });
    calls = 1; // pretend a pre-check already happened
    await expect(fetcher.fetchText("http://rebind.example.com:8080/", { allowedContentTypes: null, maxBytes: 1000 })).rejects.toBeInstanceOf(UnsafeTargetError);
    await fetcher.close();
  });
});

describe("SafeFetcher against a local server", () => {
  let server: TestServer;
  let fetcher: SafeFetcher;
  beforeAll(async () => {
    const big = "x".repeat(50_000);
    server = await startServer({
      "/page": text("<html><body>hello</body></html>", "text/html; charset=utf-8"),
      "/big": text(big, "text/html"),
      "/bomb": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
        res.end(gzipSync(Buffer.alloc(5_000_000, 32)));
      },
      "/image": text("binary", "image/png"),
      "/redirect-private": (_req, res) => {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
      },
      "/redirect-loop": (_req, res) => {
        res.writeHead(302, { location: "/redirect-loop" });
        res.end();
      },
      "/redirect-ok": (_req, res) => {
        res.writeHead(301, { location: "/page" });
        res.end();
      },
      "/hang": () => {
        /* never responds */
      },
      "/flaky": (() => {
        let n = 0;
        return (_req, res) => {
          n++;
          if (n === 1) {
            res.writeHead(503, { "retry-after": "0" });
            res.end("busy");
          } else {
            res.writeHead(200, { "content-type": "text/html" });
            res.end("ok now");
          }
        };
      })(),
    });
    fetcher = testFetcher(server.port);
  });
  afterAll(async () => {
    await fetcher.close();
    await server.close();
  });

  it("fetches and decodes allowed content", async () => {
    const res = await fetcher.fetchText(`${server.url}/page`, { allowedContentTypes: ["text/html"], maxBytes: 10_000 });
    expect(res.status).toBe(200);
    expect(res.body).toContain("hello");
    expect(res.sha256).toHaveLength(64);
  });

  it("enforces the response size limit", async () => {
    await expect(fetcher.fetchText(`${server.url}/big`, { allowedContentTypes: ["text/html"], maxBytes: 1000 })).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("counts decompressed bytes, stopping compression bombs", async () => {
    await expect(fetcher.fetchText(`${server.url}/bomb`, { allowedContentTypes: ["text/html"], maxBytes: 100_000 })).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("rejects unexpected and binary content types", async () => {
    await expect(fetcher.fetchText(`${server.url}/image`, { allowedContentTypes: ["text/css"], maxBytes: 1000 })).rejects.toMatchObject({ code: "CONTENT_TYPE" });
    await expect(fetcher.fetchText(`${server.url}/image`, { allowedContentTypes: null, maxBytes: 1000 })).rejects.toMatchObject({ code: "CONTENT_TYPE" });
  });

  it("re-validates redirect targets", async () => {
    await expect(fetcher.fetchText(`${server.url}/redirect-private`, { allowedContentTypes: null, maxBytes: 1000 })).rejects.toBeInstanceOf(UnsafeTargetError);
    const ok = await fetcher.fetchText(`${server.url}/redirect-ok`, { allowedContentTypes: ["text/html"], maxBytes: 1000 });
    expect(ok.url).toBe(`${server.url}/page`);
    expect(ok.redirects).toHaveLength(1);
  });

  it("stops redirect loops", async () => {
    await expect(fetcher.fetchText(`${server.url}/redirect-loop`, { allowedContentTypes: null, maxBytes: 1000, maxRedirects: 3 })).rejects.toMatchObject({ code: "TOO_MANY_REDIRECTS" });
  });

  it("times out", async () => {
    const quick = testFetcher(server.port, { timeoutMs: 300 });
    await expect(quick.fetchText(`${server.url}/hang`, { allowedContentTypes: null, maxBytes: 1000 })).rejects.toBeInstanceOf(FetchError);
    await quick.close();
  });

  it("retries 503 with Retry-After", async () => {
    const retrying = testFetcher(server.port, { maxRetries: 2 });
    const res = await retrying.fetchText(`${server.url}/flaky`, { allowedContentTypes: ["text/html"], maxBytes: 1000 });
    expect(res.body).toBe("ok now");
    await retrying.close();
  });

  it("refuses loopback when the production address policy is used", async () => {
    const strict = new SafeFetcher({ userAgent: "t", timeoutMs: 2000, maxRetries: 0, perHostIntervalMs: 0, urlPolicy: { allowedPorts: { http: ["", String(server.port)], https: [""] } } });
    await expect(strict.fetchText(`${server.url}/page`, { allowedContentTypes: null, maxBytes: 1000 })).rejects.toBeInstanceOf(UnsafeTargetError);
    await strict.close();
  });
});

describe("rate limiting", () => {
  it("spaces requests to the same host and not across hosts", async () => {
    let now = 0;
    const waits: number[] = [];
    const limiter = new HostRateLimiter(1000, 10_000, () => now, async (ms) => {
      waits.push(ms);
    });
    expect(await limiter.acquire("a.com")).toBe(0);
    expect(await limiter.acquire("a.com")).toBe(1000);
    expect(await limiter.acquire("A.COM")).toBe(2000);
    expect(await limiter.acquire("b.com")).toBe(0);
    now = 5000;
    expect(await limiter.acquire("a.com")).toBe(0);
    limiter.setCrawlDelay("c.com", 60_000);
    await limiter.acquire("c.com");
    expect(await limiter.acquire("c.com")).toBe(10_000); // crawl-delay is capped
  });

  it("caps concurrency", async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 8 }, () =>
        sem.run(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 10));
          active--;
        }),
      ),
    );
    expect(peak).toBe(2);
  });
});

describe("robots.txt", () => {
  const robots = new RobotsTxt(
    [
      "User-agent: *",
      "Disallow: /private",
      "Allow: /private/public",
      "Disallow: /*.json$",
      "Crawl-delay: 2",
      "",
      "User-agent: DesignIntelligenceBot",
      "Disallow: /no-design-bots",
    ].join("\n"),
  );

  it("uses the most specific group for our agent", () => {
    expect(robots.check("/no-design-bots/x", "DesignIntelligenceBot/0.1").allowed).toBe(false);
    // Our group exists, so the * group no longer applies to us.
    expect(robots.check("/private", "DesignIntelligenceBot/0.1").allowed).toBe(true);
  });

  it("applies longest-match with wildcards and anchors for other agents", () => {
    expect(robots.check("/private/x", "OtherBot").allowed).toBe(false);
    expect(robots.check("/private/public/x", "OtherBot").allowed).toBe(true);
    expect(robots.check("/data/file.json", "OtherBot").allowed).toBe(false);
    expect(robots.check("/data/file.json?x=1", "OtherBot").allowed).toBe(true);
    expect(robots.check("/private", "OtherBot").crawlDelayMs).toBe(2000);
  });

  it("follows RFC 9309 for unavailable and unreachable robots.txt", async () => {
    const server = await startServer({ "/robots.txt": text("gone", "text/plain", 404) });
    const fetcher = testFetcher(server.port);
    const policy = new RobotsPolicy(fetcher, "DesignIntelligenceBot");
    expect((await policy.check(new URL(`${server.url}/anything`))).allowed).toBe(true);
    await server.close();
    const down = await startServer({ "/robots.txt": text("error", "text/plain", 500) });
    const fetcher2 = testFetcher(down.port);
    const policy2 = new RobotsPolicy(fetcher2, "DesignIntelligenceBot");
    expect((await policy2.check(new URL(`${down.url}/anything`))).allowed).toBe(false);
    await fetcher.close();
    await fetcher2.close();
    await down.close();
  });
});
