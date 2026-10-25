import { ANALYZER_VERSION, type ResearchConfig } from "../config.js";
import type { AnalysisRecord, ReferenceInput } from "../db/store.js";
import { log } from "../logger.js";
import type { RobotsPolicy } from "../net/robots.js";
import { FetchError } from "../net/safeFetch.js";
import { UnsafeTargetError } from "../net/ssrf.js";
import { classifyProfile } from "../patterns/classifier.js";
import type { CachedFetcher } from "../research/cachedFetcher.js";
import { type ParsedCss, parseCss, resolveVars } from "./cssParser.js";
import { detectIconLibraries, detectTech, parseHtml } from "./htmlParser.js";
import { profileToObservations } from "./observations.js";
import { buildProfile, type StyleFact } from "./profileBuilder.js";

export interface AnalyzerDeps {
  http: CachedFetcher;
  robots: RobotsPolicy;
  config: ResearchConfig;
}

export const STATIC_ANALYSIS_LIMITATION =
  "Static analysis of the initial HTML and its stylesheets without rendering: computed styles, styles injected by JavaScript, images, and true on-screen dominance of colors are not measured.";

const FONT_PROVIDER_CSS = /fonts\.googleapis\.com|use\.typekit\.net|fonts\.bunny\.net|api\.fontshare\.com|fonts\.cdnfonts\.com/;

function rootFontSize(css: ParsedCss[]): number | undefined {
  for (const sheet of css) {
    for (const d of sheet.declarations) {
      if (d.property !== "font-size" || d.media) continue;
      if (!/^(html|:root)$/i.test(d.selector.trim())) continue;
      const v = d.value.trim();
      if (v.endsWith("%")) return (16 * Number.parseFloat(v)) / 100;
      if (v.endsWith("px")) return Number.parseFloat(v);
    }
  }
  return undefined;
}

function prioritiseStylesheets(urls: string[], page: URL, max: number): string[] {
  const site = page.hostname.split(".").slice(-2).join(".");
  const scored = urls
    .filter((u) => !FONT_PROVIDER_CSS.test(u))
    .map((u, i) => {
      let score = i;
      try {
        const host = new URL(u).hostname;
        if (host.endsWith(site)) score -= 1000; // first-party first
      } catch {
        score += 10_000;
      }
      return { u, score };
    })
    .sort((a, b) => a.score - b.score);
  return scored.slice(0, max).map((s) => s.u);
}

export async function analyzeWebsite(
  rawUrl: string,
  deps: AnalyzerDeps,
  options: { sourceId?: number; refresh?: boolean } = {},
): Promise<AnalysisRecord> {
  const startedAt = new Date();
  const references: ReferenceInput[] = [];
  const limitations: string[] = [STATIC_ANALYSIS_LIMITATION];
  let bytes = 0;
  const finish = (partial: Omit<AnalysisRecord, "startedAt" | "finishedAt" | "durationMs" | "analyzerVersion" | "references" | "bytesFetched" | "limitations" | "observations"> & { observations?: AnalysisRecord["observations"] }): AnalysisRecord => {
    const finishedAt = new Date();
    return {
      ...partial,
      sourceId: options.sourceId,
      observations: partial.observations ?? [],
      references,
      limitations,
      bytesFetched: bytes,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      analyzerVersion: ANALYZER_VERSION,
    };
  };

  let page: URL;
  try {
    page = deps.http.fetcher.validate(rawUrl);
  } catch (error) {
    return finish({ url: rawUrl, status: "failed", error: (error as Error).message });
  }

  const robotsGate = async (url: URL) => {
    const decision = await deps.robots.check(url);
    if (!decision.allowed) {
      throw new FetchError(`robots.txt disallows ${url.href} (${decision.reason})`, "ROBOTS_DISALLOWED");
    }
  };

  // ----- HTML -----
  let html;
  try {
    await robotsGate(page);
    html = await deps.http.get(
      page.href,
      {
        allowedContentTypes: ["text/html", "application/xhtml+xml"],
        maxBytes: deps.config.maxHtmlBytes,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        beforeRedirect: robotsGate,
      },
      "html",
      { refresh: options.refresh },
    );
  } catch (error) {
    const blocked = error instanceof FetchError && error.code === "ROBOTS_DISALLOWED";
    if (blocked) limitations.push("Not analyzed: the site's robots.txt disallows this page for our crawler.");
    if (error instanceof UnsafeTargetError) limitations.push("Not analyzed: the target resolved to a non-public network address.");
    return finish({
      url: page.href,
      status: blocked ? "blocked" : "failed",
      error: (error as Error).message,
      httpStatus: error instanceof FetchError ? error.status : undefined,
    });
  }
  references.push(html.reference);
  bytes += html.result.bytes;
  const finalUrl = html.result.url;
  const parsedHtml = parseHtml(html.result.body, finalUrl);

  // ----- CSS -----
  const sheets: Array<{ css: ParsedCss; ref: string }> = [];
  parsedHtml.inlineStyles.forEach((css, i) => sheets.push({ css: parseCss(css), ref: `${finalUrl} <style #${i + 1}>` }));
  if (parsedHtml.styleAttributes.length > 0) {
    sheets.push({ css: parseCss(parsedHtml.styleAttributes.map((s) => `[style]{${s}}`).join("\n")), ref: `${finalUrl} style attributes` });
  }

  const external = prioritiseStylesheets(parsedHtml.stylesheets, new URL(finalUrl), deps.config.maxStylesheets);
  if (parsedHtml.stylesheets.length > external.length) {
    limitations.push(`${parsedHtml.stylesheets.length - external.length} stylesheet(s) not fetched (per-page limit or font-provider CSS).`);
  }
  let cssBytes = 0;
  let cssFailures = 0;
  const queue = [...external];
  const seen = new Set<string>();
  let imports = 0;
  while (queue.length > 0) {
    const href = queue.shift()!;
    if (seen.has(href)) continue;
    seen.add(href);
    if (cssBytes >= deps.config.maxTotalCssBytes) {
      limitations.push("Total CSS byte budget reached; remaining stylesheets skipped.");
      break;
    }
    try {
      const target = deps.http.fetcher.validate(href);
      await robotsGate(target);
      const res = await deps.http.get(
        target.href,
        {
          allowedContentTypes: ["text/css"],
          maxBytes: Math.min(deps.config.maxCssBytes, deps.config.maxTotalCssBytes - cssBytes),
          accept: "text/css,*/*;q=0.1",
          beforeRedirect: robotsGate,
        },
        "css",
        { refresh: options.refresh },
      );
      references.push(res.reference);
      bytes += res.result.bytes;
      cssBytes += res.result.bytes;
      const parsed = parseCss(res.result.body);
      if (parsed.truncated) limitations.push(`${target.href} had more declarations than the analysis cap; the rest were ignored.`);
      sheets.push({ css: parsed, ref: res.result.url });
      for (const imp of parsed.imports) {
        if (imports >= 4) break;
        try {
          const abs = new URL(imp, res.result.url).href;
          if (!FONT_PROVIDER_CSS.test(abs)) {
            queue.push(abs);
            imports++;
          }
        } catch {
          /* ignore malformed import */
        }
      }
    } catch (error) {
      cssFailures++;
      references.push({ url: href, kind: "css", bytes: 0, fetchedAt: new Date().toISOString(), fromCache: false, note: `failed: ${(error as Error).message}`.slice(0, 300) });
      log.debug("stylesheet failed", { href, error: (error as Error).message });
    }
  }
  if (cssFailures > 0) limitations.push(`${cssFailures} stylesheet(s) could not be fetched; colors and type may be incomplete.`);

  // ----- facts -----
  const customProperties: ParsedCss["customProperties"] = new Map();
  for (const { css } of sheets) {
    for (const [name, defs] of css.customProperties) {
      const list = customProperties.get(name) ?? [];
      list.push(...defs.slice(0, 12 - list.length));
      customProperties.set(name, list);
    }
  }
  const facts: StyleFact[] = [];
  for (const { css, ref } of sheets) {
    for (const d of css.declarations) {
      facts.push({ selector: d.selector, property: d.property, value: resolveVars(d.value, customProperties), media: d.media, sourceRef: ref });
    }
  }
  const allCssText = sheets.length ? [...customProperties.keys()].join(" ") : "";
  const profile = buildProfile({
    sourceKind: "website",
    url: page.href,
    finalUrl,
    facts,
    fontFaces: sheets.flatMap((s) => s.css.fontFaces),
    fontLinks: parsedHtml.fontLinks,
    mediaQueries: sheets.flatMap((s) => s.css.mediaQueries),
    keyframes: sheets.reduce((n, s) => n + s.css.keyframes, 0),
    themeColor: parsedHtml.themeColor,
    rootFontSizePx: rootFontSize(sheets.map((s) => s.css)),
    limitations,
  });

  const counts = parsedHtml.counts;
  profile.meta = {
    title: parsedHtml.title,
    lang: parsedHtml.lang,
    themeColor: parsedHtml.themeColor,
    viewport: parsedHtml.viewport,
  };
  profile.structure = {
    headings: { h1: counts.h1 ?? 0, h2: counts.h2 ?? 0, h3: counts.h3 ?? 0, h4: counts.h4 ?? 0, h5: counts.h5 ?? 0, h6: counts.h6 ?? 0 },
    sections: counts.section ?? 0,
    navs: counts.nav ?? 0,
    forms: counts.form ?? 0,
    buttons: counts.button ?? 0,
    images: (counts.img ?? 0) + (counts.picture ?? 0),
    svgs: counts.svg ?? 0,
    videos: counts.video ?? 0,
    iconLibraries: detectIconLibraries(parsedHtml),
    heroHasMedia: parsedHtml.hero?.hasMedia,
    heroCtaCount: parsedHtml.hero?.ctaCount,
    h1WordCount: parsedHtml.h1WordCount,
  };
  profile.accessibility = {
    ...profile.accessibility,
    langAttribute: Boolean(parsedHtml.lang),
    viewportZoomBlocked: /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(parsedHtml.viewport ?? ""),
    imagesMissingAlt: parsedHtml.imagesMissingAlt,
    imagesTotal: counts.img ?? 0,
    skipLink: parsedHtml.skipLink,
    h1Count: counts.h1 ?? 0,
  };
  profile.tech = detectTech(parsedHtml, allCssText);
  if (parsedHtml.scriptSources.length > 0 && facts.length < 50) {
    limitations.push("Very little CSS was found in the initial HTML; the site likely renders styles with JavaScript, which this analyzer does not execute.");
  }

  const classification = classifyProfile(profile);
  const usable = facts.length > 0 && (profile.colors.uniqueColorCount > 0 || profile.typography.fonts.length > 0);
  return finish({
    url: page.href,
    finalUrl,
    status: usable ? (cssFailures > 0 ? "partial" : "success") : "partial",
    httpStatus: html.result.status,
    profile,
    classification,
    observations: profileToObservations(profile),
  });
}
