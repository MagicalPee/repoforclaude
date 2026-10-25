// Extracts design-relevant structure from HTML with a tag scanner. Script contents are
// discarded unread; nothing in the document is executed or followed except stylesheets.

export interface ParsedHtml {
  baseUrl: string;
  lang?: string;
  title?: string;
  themeColor?: string;
  viewport?: string;
  generator?: string;
  stylesheets: string[];
  inlineStyles: string[];
  styleAttributes: string[];
  fontLinks: string[];
  preloadedFonts: string[];
  scriptSources: string[];
  counts: Record<string, number>;
  imagesMissingAlt: number;
  classTokens: Map<string, number>;
  skipLink: boolean;
  h1WordCount?: number;
  hero?: { hasMedia: boolean; ctaCount: number };
}

const COUNTED = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "section",
  "nav",
  "header",
  "footer",
  "main",
  "article",
  "aside",
  "form",
  "input",
  "textarea",
  "select",
  "button",
  "a",
  "img",
  "svg",
  "video",
  "picture",
  "table",
  "dialog",
  "ul",
];

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16) || 32);
    if (lower.startsWith("#")) return ENTITY[lower] ?? String.fromCodePoint(Number.parseInt(lower.slice(1), 10) || 32);
    return ENTITY[lower] ?? m;
  });
}

export function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = m[1]!.toLowerCase();
    if (name in attrs) continue;
    attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

function resolveUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

export function parseHtml(input: string, pageUrl: string): ParsedHtml {
  // Remove comments, then pull out scripts (keeping only src) and styles (keeping content).
  let html = input.replace(/<!--[\s\S]*?-->/g, "");
  const scriptSources: string[] = [];
  html = html.replace(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi, (_m, attrs: string) => {
    const src = parseAttributes(attrs).src;
    if (src) scriptSources.push(src);
    return "";
  });
  const inlineStyles: string[] = [];
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_m, css: string) => {
    inlineStyles.push(css);
    return "";
  });
  html = html.replace(/<(noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");

  const result: ParsedHtml = {
    baseUrl: pageUrl,
    stylesheets: [],
    inlineStyles,
    styleAttributes: [],
    fontLinks: [],
    preloadedFonts: [],
    scriptSources: [],
    counts: Object.fromEntries(COUNTED.map((t) => [t, 0])),
    imagesMissingAlt: 0,
    classTokens: new Map(),
    skipLink: false,
  };

  const base = /<base\b([^>]*)>/i.exec(html);
  if (base) {
    const href = parseAttributes(base[1]!).href;
    const resolved = href ? resolveUrl(href, pageUrl) : null;
    if (resolved) result.baseUrl = resolved;
  }
  result.scriptSources = scriptSources
    .map((s) => resolveUrl(s, result.baseUrl))
    .filter((s): s is string => s !== null)
    .slice(0, 50);

  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title) result.title = stripTags(title[1]!).slice(0, 160);

  for (const m of html.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)(\s[^<>]*?)?\s*\/?>/g)) {
    const tag = m[1]!.toLowerCase();
    const attrs = parseAttributes(m[2] ?? "");
    if (tag in result.counts) result.counts[tag]!++;

    if (attrs.class && result.classTokens.size < 5000) {
      for (const token of attrs.class.split(/\s+/)) {
        if (!token || token.length > 60) continue;
        result.classTokens.set(token, (result.classTokens.get(token) ?? 0) + 1);
      }
    }
    if (attrs.style && result.styleAttributes.length < 400) result.styleAttributes.push(attrs.style);

    switch (tag) {
      case "html":
        if (attrs.lang) result.lang = attrs.lang.slice(0, 20);
        break;
      case "meta": {
        const name = (attrs.name ?? attrs.property ?? "").toLowerCase();
        if (name === "theme-color" && attrs.content && !result.themeColor) result.themeColor = attrs.content.slice(0, 60);
        if (name === "viewport" && attrs.content) result.viewport = attrs.content.slice(0, 200);
        if (name === "generator" && attrs.content) result.generator = attrs.content.slice(0, 80);
        break;
      }
      case "link": {
        const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
        const href = attrs.href ? resolveUrl(attrs.href, result.baseUrl) : null;
        if (!href) break;
        if (rel.includes("stylesheet") && !rel.includes("alternate") && (attrs.media ?? "all") !== "print") {
          result.stylesheets.push(href);
        } else if (rel.includes("preload") && attrs.as === "style") {
          result.stylesheets.push(href);
        } else if (rel.includes("preload") && attrs.as === "font") {
          result.preloadedFonts.push(href);
        }
        if (/fonts\.googleapis\.com|use\.typekit\.net|fonts\.bunny\.net|fonts\.cdnfonts\.com|api\.fontshare\.com/.test(href)) {
          result.fontLinks.push(href);
        }
        break;
      }
      case "img":
        if (!("alt" in attrs)) result.imagesMissingAlt++;
        break;
      case "a":
        if (!result.skipLink && attrs.href?.startsWith("#") && /skip|main|content/i.test(`${attrs.href} ${attrs.class ?? ""}`)) {
          result.skipLink = true;
        }
        break;
      default:
        break;
    }
  }
  result.stylesheets = [...new Set(result.stylesheets)];
  result.fontLinks = [...new Set(result.fontLinks)];

  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(html);
  if (h1) {
    const text = stripTags(h1[1]!);
    if (text) result.h1WordCount = text.split(/\s+/).length;
    // Approximate the hero as the region around the first h1: from the closest preceding
    // section/header opening to ~8KB after the heading.
    const h1Pos = h1.index;
    const before = html.slice(Math.max(0, h1Pos - 6000), h1Pos);
    const openRel = Math.max(before.lastIndexOf("<section"), before.lastIndexOf("<header"), before.lastIndexOf("<main"));
    const start = openRel >= 0 ? Math.max(0, h1Pos - 6000) + openRel : h1Pos;
    const region = html.slice(start, h1Pos + 8000);
    const hasMedia = /<(img|video|picture|canvas)\b/i.test(region) || /<svg\b[^>]*(?:width|viewbox)=["']?\s*(?:[3-9]\d{2}|\d{4})/i.test(region);
    const ctaCount = (region.match(/<(a|button)\b[^>]*class=["'][^"']*(btn|button|cta)[^"']*["']/gi) ?? []).length;
    result.hero = { hasMedia, ctaCount };
  }
  return result;
}

export function detectIconLibraries(parsed: ParsedHtml): string[] {
  const libs = new Set<string>();
  const tokens = [...parsed.classTokens.keys()];
  const has = (re: RegExp) => tokens.some((t) => re.test(t));
  if (has(/^lucide/)) libs.add("lucide");
  if (has(/^(fa|fas|far|fab|fa-solid|fa-regular)$|^fa-/)) libs.add("font-awesome");
  if (has(/^material-(icons|symbols)/)) libs.add("material-symbols");
  if (has(/^bi-|^bi$/)) libs.add("bootstrap-icons");
  if (has(/^ph-|^ph$/)) libs.add("phosphor");
  if (has(/^heroicon/)) libs.add("heroicons");
  if (parsed.scriptSources.some((s) => /unpkg\.com\/(lucide|feather|ionicons)|kit\.fontawesome/.test(s))) libs.add("icon-script");
  return [...libs];
}

export function detectTech(parsed: ParsedHtml, cssText: string): { frameworks: string[]; cssFrameworks: string[] } {
  const frameworks = new Set<string>();
  const css = new Set<string>();
  const scripts = parsed.scriptSources.join(" ");
  const tokens = [...parsed.classTokens.keys()];
  if (/\/_next\//.test(scripts)) frameworks.add("next.js");
  if (/\/_nuxt\//.test(scripts)) frameworks.add("nuxt");
  if (/\/_astro\//.test(scripts) || tokens.some((t) => t.startsWith("astro-"))) frameworks.add("astro");
  if (/\/_app\/immutable\//.test(scripts)) frameworks.add("sveltekit");
  if (/gatsby/.test(scripts)) frameworks.add("gatsby");
  if (/cdn\.shopify\.com/.test(scripts)) frameworks.add("shopify");
  if (/wp-content|wp-includes/.test(scripts) || /wordpress/i.test(parsed.generator ?? "")) frameworks.add("wordpress");
  if (/webflow/i.test(`${scripts} ${parsed.generator ?? ""}`)) frameworks.add("webflow");
  if (/framer/i.test(`${scripts} ${parsed.generator ?? ""}`)) frameworks.add("framer");
  if (/squarespace/i.test(`${scripts} ${parsed.generator ?? ""}`)) frameworks.add("squarespace");
  const twLike = tokens.filter((t) => /^(?:[a-z]+:)*(?:p[xytrbl]?|m[xytrbl]?|text|bg|rounded|flex|grid|gap|w|h|font)-[\w./[\]-]+$/.test(t)).length;
  if (cssText.includes("--tw-") || twLike > 40) css.add("tailwind");
  if (tokens.includes("btn") && tokens.some((t) => /^(col|row|container)(-|$)/.test(t))) css.add("bootstrap");
  if (tokens.some((t) => t.startsWith("chakra-"))) css.add("chakra-ui");
  if (tokens.some((t) => t.startsWith("Mui"))) css.add("mui");
  if (tokens.some((t) => t.startsWith("mantine-"))) css.add("mantine");
  return { frameworks: [...frameworks], cssFrameworks: [...css] };
}
