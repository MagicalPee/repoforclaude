import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseCss, parseFontFamily, resolveVars } from "../src/analysis/cssParser.js";
import { parseHtml } from "../src/analysis/htmlParser.js";
import { rangePx, selectorRoles } from "../src/analysis/profileBuilder.js";
import {
  analyzeDesignSystem,
  flattenJsObjects,
  flattenJson,
  flattenScss,
  flattenYaml,
  json5ToJson,
  resolveReferences,
  tokenToFact,
} from "../src/analysis/tokenAnalyzer.js";
import { analyzeWebsite } from "../src/analysis/websiteAnalyzer.js";
import { CachedFetcher } from "../src/research/cachedFetcher.js";
import { file, FIXTURES, startServer, type TestServer, testDeps, testFetcher, testResearchConfig, text, tempStore } from "./helpers.js";

describe("CSS parser", () => {
  it("handles nesting, at-rules, strings with braces and comments", () => {
    const css = `
      /* a comment with { braces } */
      :root { --brand: #0f766e; --font: "Inter", sans-serif; }
      .a::before { content: "}{;"; color: red; }
      @media (min-width: 768px) { .b { padding: 8px 16px; } @supports (display: grid) { .c { display: grid; } } }
      @font-face { font-family: "Fraunces"; src: url("/f.woff2") format("woff2"); font-display: swap; }
      @import url("/more.css");
      @keyframes spin { from { transform: rotate(0) } to { transform: rotate(1turn) } }
      .card { color: blue; &:hover { color: navy; } .title { font-weight: 700 !important; } }
    `;
    const parsed = parseCss(css);
    expect(parsed.customProperties.get("--brand")?.[0]?.value).toBe("#0f766e");
    expect(parsed.declarations.find((d) => d.selector === ".a::before" && d.property === "content")?.value).toBe('"}{;"');
    expect(parsed.declarations.find((d) => d.selector === ".b")?.media).toBe("(min-width: 768px)");
    expect(parsed.declarations.some((d) => d.selector === ".c" && d.property === "display")).toBe(true);
    expect(parsed.fontFaces[0]).toMatchObject({ family: "Fraunces", src: ["/f.woff2"], display: "swap" });
    expect(parsed.imports).toEqual(["/more.css"]);
    expect(parsed.keyframes).toBe(1);
    expect(parsed.declarations.find((d) => d.selector === ".card:hover")?.value).toBe("navy");
    const title = parsed.declarations.find((d) => d.selector === ".card .title");
    expect(title).toMatchObject({ property: "font-weight", value: "700", important: true });
  });

  it("resolves custom properties with fallbacks", () => {
    const parsed = parseCss(":root { --a: var(--b); --b: #123456; } .x { color: var(--a); background: var(--missing, #fff); }");
    expect(resolveVars("var(--a)", parsed.customProperties)).toBe("#123456");
    expect(resolveVars("var(--missing, #fff)", parsed.customProperties)).toBe("#fff");
  });

  it("parses font stacks and lengths", () => {
    expect(parseFontFamily('"Söhne", "Helvetica Neue", sans-serif')).toMatchObject({ primary: "Söhne", generic: "sans-serif", isSystemStack: false });
    expect(parseFontFamily("-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif").isSystemStack).toBe(true);
    expect(parseFontFamily('ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji"').primary).toBeNull();
    expect(rangePx("1.5rem")).toEqual({ min: 24, max: 24 });
    expect(rangePx("clamp(2rem, 5vw + 1rem, 4.5rem)")).toEqual({ min: 32, max: 72 });
    expect(rangePx("calc(100% - 2rem)")).toBeNull();
  });

  it("classifies selectors by the element they style", () => {
    expect(selectorRoles("h1, .hero-title").headingLevel).toBe(1);
    expect(selectorRoles(".btn-primary:hover")).toMatchObject({ button: true, hover: true });
    expect(selectorRoles("html[data-theme=dark] body").dark).toBe(true);
    expect(selectorRoles(".card .title").card).toBe(false);
    expect(selectorRoles("input[type=checkbox]").input).toBe(false);
    expect(selectorRoles(".btn::after").decorative).toBe(true);
  });
});

describe("HTML parser", () => {
  it("extracts structure without keeping script content", () => {
    const html = readFileSync(join(FIXTURES, "site/index.html"), "utf8");
    const parsed = parseHtml(html, "https://ledgerly.example.org/");
    expect(parsed.lang).toBe("en");
    expect(parsed.themeColor).toBe("#0f766e");
    // Print stylesheets are skipped here; font-provider CSS is filtered later by the analyzer.
    expect(parsed.stylesheets).toContain("https://ledgerly.example.org/assets/main.css");
    expect(parsed.stylesheets.some((s) => s.includes("print.css"))).toBe(false);
    expect(parsed.fontLinks[0]).toContain("fonts.googleapis.com");
    expect(parsed.counts.h1).toBe(1);
    expect(parsed.imagesMissingAlt).toBe(1);
    expect(parsed.skipLink).toBe(true);
    expect(parsed.h1WordCount).toBe(6);
    expect(parsed.hero).toMatchObject({ hasMedia: true });
    expect(JSON.stringify(parsed)).not.toContain("Ignore previous instructions");
  });
});

describe("website analyzer", () => {
  let server: TestServer;
  let hitsBefore = 0;
  const routes = {
    "/": file("site/index.html", "text/html; charset=utf-8", { etag: '"v1"' }),
    "/assets/main.css": file("site/assets/main.css", "text/css"),
    "/assets/tokens.css": file("site/assets/tokens.css", "text/css"),
    "/robots.txt": text("User-agent: *\nDisallow: /admin\n"),
    "/admin": text("<html></html>", "text/html"),
    "/broken": text('<html><head><link rel="stylesheet" href="/missing.css"><style>body{color:#222;background:#fff}</style></head><body></body></html>', "text/html"),
  };
  beforeAll(async () => {
    server = await startServer(routes);
  });
  afterAll(async () => server.close());

  it("extracts an evidence profile from HTML and CSS", async () => {
    const store = tempStore();
    const deps = testDeps(server.port, store);
    const record = await analyzeWebsite(`${server.url}/`, deps);
    expect(record.status).toBe("success");
    const p = record.profile!;
    expect(p.colors.background).toBe("#fbfaf7");
    expect(p.colors.text).toBe("#1c1a17");
    expect(p.colors.brandCandidates[0]).toBe("#0f766e");
    expect(p.colors.supportsDarkMode).toBe(true);
    expect(p.typography.headingFont).toBe("Fraunces");
    expect(p.typography.bodyFont).toBe("Hanken Grotesk");
    expect(p.typography.fonts.find((f) => f.family === "Fraunces")?.delivery).toBe("google-fonts");
    expect(p.typography.headingSizesPx.h1).toBe(72);
    expect(p.typography.bodySizePx).toBe(17);
    expect(p.shape.buttonRadiusPx).toBe(8);
    expect(p.layout.stickyHeader).toBe(true);
    expect(p.effects.reducedMotionSupport).toBe(true);
    expect(p.accessibility.bodyTextContrast).toBeGreaterThan(15);
    expect(p.tech.frameworks).toContain("next.js");
    expect(record.classification?.headingClass).toBe("display-serif");
    expect(record.observations.length).toBeGreaterThan(20);
    expect(record.observations.every((o) => o.confidence >= 0 && o.confidence <= 1 && o.evidence.length > 0)).toBe(true);
    expect(record.references.map((r) => r.kind)).toEqual(["html", "css", "css"]);
    expect(record.limitations[0]).toMatch(/Static analysis/);
    expect(JSON.stringify(record)).not.toContain("Ignore previous instructions");
    await deps.fetcher.close();
  });

  it("serves repeat analyses from the HTTP cache", async () => {
    const store = tempStore();
    const deps = testDeps(server.port, store);
    await analyzeWebsite(`${server.url}/`, deps);
    hitsBefore = server.hits.get("/") ?? 0;
    const second = await analyzeWebsite(`${server.url}/`, deps);
    expect(server.hits.get("/")).toBe(hitsBefore);
    expect(second.references.every((r) => r.fromCache)).toBe(true);
    await deps.fetcher.close();
  });

  it("revalidates stale cache entries with ETag", async () => {
    const store = tempStore();
    const fetcher = testFetcher(server.port);
    const etagServer = await startServer({
      "/": (req, res) => {
        if (req.headers["if-none-match"] === '"v1"') {
          res.writeHead(304);
          return res.end();
        }
        res.writeHead(200, { "content-type": "text/html", etag: '"v1"' });
        res.end("<html><head><style>body{color:#111;background:#fff}</style></head></html>");
      },
    });
    const ef = testFetcher(etagServer.port);
    const http = new CachedFetcher(ef, store, 0);
    const first = await http.get(`${etagServer.url}/`, { allowedContentTypes: ["text/html"], maxBytes: 10_000 }, "html");
    const second = await http.get(`${etagServer.url}/`, { allowedContentTypes: ["text/html"], maxBytes: 10_000 }, "html");
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.reference.httpStatus).toBe(304);
    expect(second.result.body).toContain("#111");
    await ef.close();
    await fetcher.close();
    await etagServer.close();
  });

  it("respects robots.txt", async () => {
    const deps = testDeps(server.port);
    const record = await analyzeWebsite(`${server.url}/admin`, deps);
    expect(record.status).toBe("blocked");
    expect(record.error).toMatch(/robots\.txt disallows/);
    await deps.fetcher.close();
  });

  it("reports partial results when stylesheets fail", async () => {
    const deps = testDeps(server.port);
    const record = await analyzeWebsite(`${server.url}/broken`, deps);
    expect(record.status).toBe("partial");
    expect(record.limitations.join(" ")).toMatch(/could not be fetched/);
    expect(record.profile?.colors.text).toBe("#222222");
    await deps.fetcher.close();
  });

  it("fails cleanly for unsafe targets without network access", async () => {
    const deps = testDeps(server.port);
    const record = await analyzeWebsite("http://169.254.169.254/latest/meta-data/", deps);
    expect(record.status).toBe("failed");
    expect(record.error).toMatch(/non-public/);
    await deps.fetcher.close();
  });
});

describe("design-token analysis", () => {
  it("converts JSON5 and flattens DTCG values, colour objects and references", () => {
    expect(JSON.parse(json5ToJson("{a: 'x', // c\n b: [1, 2,], }"))).toEqual({ a: "x", b: [1, 2] });
    const flat = flattenJson(readFileSync(join(FIXTURES, "tokens/primer-like.json5"), "utf8"), true);
    expect(flat.get("base.color.neutral.0")).toBe("#ffffff");
    const resolved = resolveReferences(flat);
    expect(resolved.get("bgColor.default")).toBe("#ffffff");
    expect(resolved.get("button.primary.bgColor.rest")).toBe("#0969da");
  });

  it("flattens YAML, SCSS and JS/TS sources statically", () => {
    const yaml = flattenYaml(readFileSync(join(FIXTURES, "tokens/aliases.yml"), "utf8"));
    expect(yaml.get("props.color-background")).toBe("#ffffff");
    const scss = flattenScss(readFileSync(join(FIXTURES, "tokens/settings.scss"), "utf8"));
    expect(scss.get("link-colour")).toBe("#1d70b8");
    expect(scss.get("breakpoints.tablet")).toBe("641px");
    expect(scss.get("focus-colour")).toBe("#ffdd00");
    const ts = resolveReferences(flattenJsObjects(readFileSync(join(FIXTURES, "tokens/colors.ts"), "utf8")));
    expect(ts.get("gray.15")).toBe("rgba(48, 48, 48, 1)");
    expect(ts.get("color.color-text")).toBe("rgba(48, 48, 48, 1)");
    expect(ts.get("fontFamily")).toBe("Inter, -apple-system, sans-serif");
  });

  it("maps token paths to CSS properties", () => {
    expect(tokenToFact("radius.md", "6px", "x", "light")?.property).toBe("border-radius");
    expect(tokenToFact("space.4", "16px", "x", "light")?.property).toBe("padding");
    expect(tokenToFact("font.family.body", "Inter, sans-serif", "x", "light")?.property).toBe("--font-family");
    expect(tokenToFact("font.family.body", "body", "x", "light")).toBeNull();
    expect(tokenToFact("color.bg.default", "#fff", "x", "dark")?.media).toMatch(/dark/);
    expect(tokenToFact("breakpoints.md", "768px", "x", "light")?.property).toBe("--breakpoint");
  });

  it("analyzes a design system end to end", async () => {
    const server = await startServer({
      "/acme/ds/main/tokens.json5": file("tokens/primer-like.json5", "text/plain"),
      "/acme/ds/main/settings.scss": file("tokens/settings.scss", "text/plain"),
    });
    const http = new CachedFetcher(testFetcher(server.port), undefined, 60_000);
    const record = await analyzeDesignSystem(
      "https://github.com/acme/ds",
      { repo: "acme/ds", ref: "main", rawBaseUrl: server.url, files: [{ path: "tokens.json5" }, { path: "settings.scss" }, { path: "missing.json" }] },
      { http, config: testResearchConfig() },
    );
    expect(record.status).toBe("partial");
    expect(record.profile?.colors.background).toBe("#ffffff");
    expect(record.profile?.colors.text).toBe("#1f2328");
    expect(record.profile?.typography.bodyFont).toBe("Mona Sans");
    expect(record.profile?.layout.breakpointsPx.map((b) => b.value)).toEqual(expect.arrayContaining([544, 768]));
    expect(record.limitations.join(" ")).toMatch(/missing\.json/);
    await http.fetcher.close();
    await server.close();
  });
});
