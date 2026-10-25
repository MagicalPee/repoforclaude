import { classifyFont, lookupFont, normalizeFamily } from "../knowledge/fonts.js";
import type {
  ColorEvidence,
  ColorRole,
  ComponentEvidence,
  FontDelivery,
  FontEvidence,
  SiteProfile,
  SourceKind,
  ValueCount,
} from "../types.js";
import { contrastRatio, deltaE, NAMED_COLORS, toHex, toOklch } from "./color.js";
import { type FontFaceRule, lengthsIn, parseFontFamily, parseTimeMs, splitTopLevel } from "./cssParser.js";

/** One styling fact: a CSS declaration, or a design token normalised into one. */
export interface StyleFact {
  selector: string;
  property: string;
  value: string;
  media: string | null;
  sourceRef: string;
  /** Token path for design-system sources, e.g. "color.button.primary.background". */
  tokenPath?: string;
}

export interface BuildInput {
  sourceKind: SourceKind;
  url: string;
  finalUrl: string;
  facts: StyleFact[];
  fontFaces: FontFaceRule[];
  fontLinks: string[];
  mediaQueries: string[];
  keyframes: number;
  themeColor?: string;
  rootFontSizePx?: number;
  limitations: string[];
}

export interface Roles {
  root: boolean;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  heading: boolean;
  bodyText: boolean;
  button: boolean;
  input: boolean;
  card: boolean;
  nav: boolean;
  link: boolean;
  badge: boolean;
  eyebrow: boolean;
  code: boolean;
  container: boolean;
  focus: boolean;
  hover: boolean;
  dark: boolean;
  decorative: boolean;
}

const word = (names: string) => new RegExp(`(^|[^a-z0-9])(${names})([^a-z0-9]|$)`, "i");
const RE = {
  root: /^(html|body|:root)([.[:#]|$)/i,
  hLevel: /^h([1-6])([.[:#]|$)|[._-]h([1-6])([^0-9a-z]|$)|(?:heading|title|headline)-?([1-6])\b/i,
  heading: word("heading|headline|title|display|hero-title|page-title|section-title"),
  subtitle: word("subtitle|sub-title|subheading"),
  bodyText: /^(p|li|article|\.prose|\.content p)([.[:#]|$)/i,
  button: word("btn|button|cta"),
  input: word("input|textarea|select|form-control|text-field|textfield|field|form-input"),
  nonTextInput: /\[type=["']?(checkbox|radio|submit|button|range|file|color)/i,
  card: word("card|tile|panel"),
  nav: word("nav|navbar|navigation|header|site-header|topbar|top-bar|menu|appbar"),
  link: /^a([.[:#]|$)/i,
  badge: word("badge|tag|chip|pill"),
  eyebrow: word("eyebrow|overline|kicker|label|caption"),
  code: /^(code|pre|kbd|samp)([.[:#]|$)|(^|[^a-z])(mono|code|monospace)([^a-z]|$)/i,
  container: /^main([.[:#]|$)|(^|[^a-z0-9])(container|wrapper|wrap|max-w[\w-]*|page-width|content-width|layout)([^a-z0-9]|$)/i,
  dark: /\.dark\b|\.theme-dark|\[data-(?:theme|color-mode|mode|color-scheme|bs-theme)=["']?dark|:root\.dark|\.dark-mode|\[class\*=["']?dark/i,
};

/** Classifies a selector by the element it styles (its rightmost compound selector). */
export function selectorRoles(selector: string): Roles {
  const roles: Roles = {
    root: false,
    heading: false,
    bodyText: false,
    button: false,
    input: false,
    card: false,
    nav: false,
    link: false,
    badge: false,
    eyebrow: false,
    code: false,
    container: false,
    focus: false,
    hover: false,
    dark: false,
    decorative: false,
  };
  for (const sel of splitTopLevel(selector, ",")) {
    if (RE.dark.test(sel)) roles.dark = true;
    const compounds = sel.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
    const subject = compounds[compounds.length - 1] ?? "";
    if (/::?(before|after|placeholder|selection|marker|backdrop|-webkit-)/i.test(subject)) {
      roles.decorative = true;
      continue;
    }
    if (/:hover|:active/i.test(subject)) roles.hover = true;
    if (/:focus/i.test(subject)) roles.focus = true;
    if (RE.root.test(subject)) roles.root = true;
    const h = RE.hLevel.exec(subject);
    if (h) {
      const level = Number(h[1] ?? h[3] ?? h[4]) as Roles["headingLevel"];
      roles.headingLevel = roles.headingLevel ? (Math.min(roles.headingLevel, level!) as Roles["headingLevel"]) : level;
      roles.heading = true;
    } else if (RE.heading.test(subject) && !RE.subtitle.test(subject)) {
      roles.heading = true;
    }
    if (RE.bodyText.test(subject)) roles.bodyText = true;
    if (RE.button.test(subject) && !/group|icon-only/i.test(subject)) roles.button = true;
    if (RE.input.test(subject) && !RE.nonTextInput.test(subject) && !roles.button) roles.input = true;
    if (RE.card.test(subject)) roles.card = true;
    if (RE.nav.test(subject) || /^nav([.[:#]|$)|^header([.[:#]|$)/i.test(subject)) roles.nav = true;
    if (RE.link.test(subject)) roles.link = true;
    if (RE.badge.test(subject)) roles.badge = true;
    if (RE.eyebrow.test(subject)) roles.eyebrow = true;
    if (RE.code.test(subject)) roles.code = true;
    if (RE.container.test(subject)) roles.container = true;
  }
  return roles;
}

const COLOR_PROPERTIES = new Set([
  "color",
  "background",
  "background-color",
  "background-image",
  "border",
  "border-color",
  "border-top",
  "border-bottom",
  "border-left",
  "border-right",
  "border-top-color",
  "border-bottom-color",
  "outline",
  "outline-color",
  "fill",
  "stroke",
  "text-decoration-color",
  "caret-color",
  "accent-color",
  "box-shadow",
]);

// Token names that describe a variant rather than the default page background or body text.
const VARIANT_WORDS =
  /muted|subtle|secondary|tertiary|disabled|placeholder|inverse|inverted|on-|emphasis|hover|active|pressed|selected|link|success|danger|error|warning|critical|caution|info|attention|accent|brand|primary-|white|black|overlay|backdrop|transparent|inset|sunken|alt|light|dark|weak|strong|severe|done|sponsor|open|closed|neutral-|highlight|contrast|reverse|shadow|code|tooltip|header|nav|button|btn|input|control|badge|tag|chart|data|viz|syntax|(^|[-_.\s])hc[-_.]|fill|scrollbar|guide|backdrop|skeleton/;
const PREFERRED_WORDS = /default|page|canvas|body|base|main|primary$|level-?0|surface-?1|[-_.]1$|\bbg\b|background$/;

const NAMED_COLOR_RE = new RegExp(`(^|[\\s,(])(${[...NAMED_COLORS.keys()].join("|")})(?=$|[\\s,)])`, "gi");

/** Color literals inside a declaration value. */
export function extractColorLiterals(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(/#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch|oklab|hwb)\([^()]*\)/g)) out.push(m[0]);
  if (!/url\(/i.test(value)) {
    for (const m of value.matchAll(NAMED_COLOR_RE)) out.push(m[2]!);
  }
  return out;
}

interface ColorTally {
  hex: string;
  count: number;
  roles: Map<ColorRole, number>;
  evidence: string[];
  darkOnly: boolean;
  lightCount: number;
  stateCount: number;
}

interface FontTally {
  family: string;
  count: number;
  roles: Map<FontEvidence["role"], number>;
  generic: string | null;
  isSystem: boolean;
  evidence: string[];
}

const median = (values: number[]): number | undefined => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function tally(values: number[], limit = 12): ValueCount[] {
  const map = new Map<number, number>();
  for (const v of values) {
    const key = round(v, 2);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value - b.value)
    .slice(0, limit);
}

function mostCommon(values: string[]): string | undefined {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function lengthToPx(token: string, rootPx: number): number | null {
  const m = /^(-?\d*\.?\d+)(px|rem|em|pt|%)?$/i.exec(token.trim());
  if (!m) return null;
  const n = Number.parseFloat(m[1]!);
  switch ((m[2] ?? "").toLowerCase()) {
    case "px":
      return n;
    case "rem":
    case "em":
      return n * rootPx;
    case "pt":
      return (n * 4) / 3;
    case "":
      return n === 0 ? 0 : null;
    default:
      return null;
  }
}

/** Pixel range for a length or clamp()/min()/max() expression at the given root size. */
export function rangePx(value: string, rootPx = 16): { min: number; max: number } | null {
  const v = value.trim().toLowerCase();
  const single = lengthToPx(v, rootPx);
  if (single !== null) return { min: single, max: single };
  const fn = /^(clamp|min|max)\((.*)\)$/.exec(v);
  if (!fn) return null;
  const args = splitTopLevel(fn[2]!, ",").map((a) => lengthToPx(a, rootPx));
  if (fn[1] === "clamp" && args.length === 3 && args[0] != null && args[2] != null) return { min: args[0], max: args[2] };
  const known = args.filter((a): a is number => a !== null);
  return known.length ? { min: Math.min(...known), max: Math.max(...known) } : null;
}

function parseFontShorthand(value: string): { size?: string; lineHeight?: string; weight?: string; family?: string } {
  const m = /(?:^|\s)((?:\d*\.?\d+)(?:px|rem|em|pt|%)|(?:clamp|min|max)\([^)]*\))(?:\s*\/\s*([\d.]+(?:px|rem|em|%)?))?\s+(.+)$/i.exec(value);
  if (!m) return {};
  const weight = /\b([1-9]00|bold|normal)\b/i.exec(value.slice(0, m.index + 1))?.[1];
  return { size: m[1], lineHeight: m[2], weight, family: m[3] };
}

function weightNumber(value: string): number | undefined {
  const v = value.trim().toLowerCase();
  if (v === "bold") return 700;
  if (v === "normal") return 400;
  if (v === "bolder") return 700;
  if (v === "lighter") return 300;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 100 && n <= 1000 ? n : undefined;
}

function lineHeightRatio(value: string, fontPx: number | undefined, rootPx: number): number | undefined {
  const v = value.trim();
  if (/^\d*\.?\d+$/.test(v)) {
    const n = Number.parseFloat(v);
    return n > 0.7 && n < 3 ? n : undefined;
  }
  if (v.endsWith("%")) {
    const n = Number.parseFloat(v) / 100;
    return n > 0.7 && n < 3 ? n : undefined;
  }
  const px = lengthToPx(v, rootPx);
  if (px && fontPx) {
    const n = px / fontPx;
    return n > 0.7 && n < 3 ? n : undefined;
  }
  return undefined;
}

function classifyShadow(value: string): "hard-offset" | "layered" | "pronounced" | "subtle" | null {
  if (/^\s*(none|0|initial|unset|inherit)\s*$/i.test(value)) return null;
  const layers = splitTopLevel(value, ",").filter((l) => !/^\s*inset\b/i.test(l));
  if (layers.length === 0) return null;
  if (layers.length >= 3) return "layered";
  let maxBlur = 0;
  let maxAlpha = 0;
  let hard = false;
  for (const layer of layers) {
    const withoutColors = layer.replace(/(?:rgba?|hsla?|oklch|oklab)\([^)]*\)|#[0-9a-f]{3,8}/gi, " ");
    const lengths = withoutColors
      .split(/\s+/)
      .map((t) => lengthToPx(t, 16))
      .filter((n): n is number => n !== null);
    const [x = 0, y = 0, blur = 0] = lengths;
    maxBlur = Math.max(maxBlur, blur);
    if (blur === 0 && (Math.abs(x) >= 2 || Math.abs(y) >= 2)) hard = true;
    const alpha = /(?:rgba|hsla)\([^)]*,\s*([\d.]+)\s*\)|\/\s*([\d.]+%?)\s*\)/i.exec(layer);
    if (alpha) {
      const raw = alpha[1] ?? alpha[2] ?? "1";
      maxAlpha = Math.max(maxAlpha, raw.endsWith("%") ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw));
    } else if (/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|\bblack\b/i.test(layer)) {
      maxAlpha = Math.max(maxAlpha, 1);
    }
  }
  if (hard) return "hard-offset";
  if (layers.length === 2) return "layered";
  if (maxBlur >= 24 || maxAlpha >= 0.25) return "pronounced";
  return "subtle";
}

const roleWord = (words: string) => new RegExp(`(^|[-_.\\s])(${words})([-_.\\s]|$)`);
const ROLE_PATTERNS: Array<[RegExp, ColorRole]> = [
  [roleWord("success|warning|error|danger|critical|caution|positive|negative|info|attention|severe"), "status"],
  [roleWord("primary|brand|accent|cta|action|interactive|highlight|signal"), "brand"],
  [roleWord("border|stroke|divider|outline|separator|line|hairline"), "border"],
  [roleWord("surface|card|panel|elevated|overlay|raised|container"), "surface"],
  [roleWord("bg|background|canvas|page|backdrop"), "background"],
  [roleWord("text|fg|foreground|ink|copy|body|heading|content|on-surface"), "text"],
  [roleWord("link"), "link"],
];

function customPropertyRole(name: string): ColorRole | null {
  const n = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  for (const [re, role] of ROLE_PATTERNS) if (re.test(n)) return role;
  return null;
}

function googleFontFamilies(links: string[]): Set<string> {
  const out = new Set<string>();
  for (const link of links) {
    try {
      const url = new URL(link);
      for (const fam of url.searchParams.getAll("family")) {
        for (const part of fam.split("|")) out.add(normalizeFamily(part.split(":")[0]!.replace(/\+/g, " ")));
      }
    } catch {
      /* ignore malformed */
    }
  }
  return out;
}

export function buildProfile(input: BuildInput): SiteProfile {
  const rootPx = input.rootFontSizePx ?? 16;
  const colors = new Map<string, ColorTally>();
  const fonts = new Map<string, FontTally>();
  const headingSizes: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  const headingMinSizes: number[] = [];
  const bodySizes: number[] = [];
  const allFontSizes = new Set<number>();
  const headingWeights: number[] = [];
  const bodyLineHeights: number[] = [];
  const headingLineHeights: number[] = [];
  const headingTracking: number[] = [];
  let uppercaseLabels = 0;
  const spacing: number[] = [];
  const radii: number[] = [];
  const buttonRadii: number[] = [];
  const cardRadii: number[] = [];
  const borderWidths: number[] = [];
  const shadowKinds: string[] = [];
  const maxWidths: number[] = [];
  let gridDecl = 0;
  let flexDecl = 0;
  let stickyHeader = false;
  let gradients = 0;
  let backdropBlur = 0;
  const durations: number[] = [];
  const easings: string[] = [];
  let focusVisible = false;
  let outlineNone = 0;
  const comp: Record<string, Record<string, string[]>> = {};
  const addComp = (component: string, property: string, value: string) => {
    comp[component] ??= {};
    (comp[component]![property] ??= []).push(value);
  };
  const backgroundCandidates: Array<{ hex: string; weight: number; evidence: string }> = [];
  const textCandidates: Array<{ hex: string; weight: number; evidence: string }> = [];
  let supportsDarkMode = input.mediaQueries.some((m) => /prefers-color-scheme:\s*dark/i.test(m));
  let customPropertyColors = 0;

  const addColor = (hex: string, role: ColorRole, evidence: string, dark: boolean, state: boolean) => {
    const t: ColorTally = colors.get(hex) ?? { hex, count: 0, roles: new Map(), evidence: [], darkOnly: true, lightCount: 0, stateCount: 0 };
    t.count++;
    if (state) t.stateCount++;
    t.roles.set(role, (t.roles.get(role) ?? 0) + 1);
    if (t.evidence.length < 3 && !t.evidence.includes(evidence)) t.evidence.push(evidence);
    if (!dark) {
      t.darkOnly = false;
      t.lightCount++;
    }
    colors.set(hex, t);
  };

  for (const fact of input.facts) {
    const roles = selectorRoles(fact.selector);
    if (roles.decorative) continue;
    const darkContext = roles.dark || /prefers-color-scheme:\s*dark/i.test(fact.media ?? "");
    if (darkContext) supportsDarkMode = true;
    const prop = fact.property;
    const value = fact.value;
    const where = fact.tokenPath ? `token ${fact.tokenPath}` : `${fact.selector.slice(0, 80)} { ${prop} }`;
    const evidence = `${where} in ${fact.sourceRef}`;

    // ----- colors -----
    if (COLOR_PROPERTIES.has(prop) || (prop.startsWith("--") && extractColorLiterals(value).length === 1)) {
      const literals = extractColorLiterals(value);
      for (const literal of literals) {
        const parsedAlpha = /(?:rgba|hsla)\([^)]*,\s*([\d.]+)\s*\)|\/\s*([\d.]+%?)\s*\)|^#[0-9a-f]{8}$|^#[0-9a-f]{4}$/i.exec(literal);
        if (parsedAlpha && (parsedAlpha[1] || parsedAlpha[2])) {
          const raw = parsedAlpha[1] ?? parsedAlpha[2]!;
          const alpha = raw.endsWith("%") ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw);
          if (alpha < 0.6) continue; // overlays and shadows, not palette colors
        }
        if (prop === "box-shadow") continue;
        const hex = toHex(literal);
        if (!hex) continue;
        let role: ColorRole = "other";
        if (prop.startsWith("--")) {
          customPropertyColors++;
          role = customPropertyRole(`${prop} ${fact.tokenPath ?? ""}`) ?? "other";
          const name = `${prop} ${fact.tokenPath ?? ""}`.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
          const variant = VARIANT_WORDS.test(name);
          // Canonical tokens tend to have short names ("bg", "bgColor.default"); long names are variants.
          const segments = (fact.tokenPath ?? prop.slice(2))
            .split(/[.\-_]/)
            .filter((w) => w && !/^(colou?rs?|theme|sys|semantic|base|global|alias|light|tokens?)$/i.test(w)).length;
          const preferred = (PREFERRED_WORDS.test(name) ? 2 : 0) + (segments <= 1 ? 2 : segments === 2 ? 1 : segments >= 4 ? -3 : 0);
          if (role === "background" && (roles.root || fact.tokenPath) && !darkContext && !variant) {
            backgroundCandidates.push({ hex, weight: (fact.tokenPath ? 3 : 2) + preferred, evidence });
          }
          if (role === "text" && (roles.root || fact.tokenPath) && !darkContext && !variant) {
            textCandidates.push({ hex, weight: (fact.tokenPath ? 3 : 2) + preferred, evidence });
          }
        } else if (prop === "background-image" || (prop === "background" && /gradient\(/i.test(value))) {
          role = "gradient";
        } else if (prop === "background" || prop === "background-color") {
          if (roles.root && !roles.hover) {
            role = "background";
            if (!darkContext) backgroundCandidates.push({ hex, weight: 5, evidence });
          } else if (roles.button && !roles.hover) role = "cta";
          else if (roles.card || roles.nav) role = "surface";
          else if (roles.badge) role = "accent";
        } else if (prop === "color") {
          if (roles.root && !roles.hover) {
            role = "text";
            if (!darkContext) textCandidates.push({ hex, weight: 5, evidence });
          } else if (roles.link) role = "link";
          else if (roles.heading || roles.bodyText) role = "text";
        } else if (prop.startsWith("border") || prop.startsWith("outline")) {
          role = "border";
        }
        // Hover/active/pressed variants are derived colors, not brand candidates.
        const state = roles.hover || roles.focus || /hover|active|pressed|focus|visited/i.test(`${prop} ${fact.tokenPath ?? ""}`);
        addColor(hex, role, evidence, darkContext, state);
      }
      if (/gradient\(/i.test(value) && !prop.startsWith("--")) gradients++;
    }

    // ----- typography -----
    let familyValue: string | undefined;
    let sizeValue: string | undefined;
    let lineHeightValue: string | undefined;
    let weightValue: string | undefined;
    if (prop === "font-family") familyValue = value;
    else if (prop === "font-size") sizeValue = value;
    else if (prop === "line-height") lineHeightValue = value;
    else if (prop === "font-weight") weightValue = value;
    else if (prop === "font") {
      const short = parseFontShorthand(value);
      familyValue = short.family;
      sizeValue = short.size;
      lineHeightValue = short.lineHeight;
      weightValue = short.weight;
    } else if (prop.startsWith("--") && /font-?family|font-?(sans|serif|mono|heading|body|display)|typeface/i.test(prop + (fact.tokenPath ?? ""))) {
      if (!/^\d/.test(value)) familyValue = value;
    }

    if (familyValue) {
      const stack = parseFontFamily(familyValue);
      const family = stack.isSystemStack ? "system-ui" : stack.primary;
      if (family) {
        const key = normalizeFamily(family);
        const t: FontTally = fonts.get(key) ?? { family, count: 0, roles: new Map(), generic: stack.generic, isSystem: stack.isSystemStack, evidence: [] };
        t.count++;
        const hint = `${prop} ${fact.tokenPath ?? ""}`.toLowerCase();
        const role: FontEvidence["role"] =
          roles.code || /mono|code/.test(hint) || stack.generic === "monospace"
            ? "mono"
            : roles.heading || /heading|display|headline|title/.test(hint)
              ? "heading"
              : roles.root || roles.bodyText || /body|sans|base|text|default/.test(hint)
                ? "body"
                : "declared";
        t.roles.set(role, (t.roles.get(role) ?? 0) + 1);
        if (t.evidence.length < 3) t.evidence.push(evidence);
        fonts.set(key, t);
      }
    }

    let fontPx: number | undefined;
    if (sizeValue) {
      const r = rangePx(sizeValue, rootPx);
      if (r && r.max > 6 && r.max < 220) {
        fontPx = r.max;
        allFontSizes.add(round(r.max, 1));
        const tokenLevel = /(?:^|[._-])(?:h|heading-?|title-?)([1-6])(?:$|[._-])/i.exec(fact.tokenPath ?? "");
        const level = roles.headingLevel ?? (tokenLevel ? (Number(tokenLevel[1]) as 1) : undefined);
        if (level && !darkContext) {
          headingSizes[level]!.push(r.max);
          if (level === 1 && r.min !== r.max) headingMinSizes.push(r.min);
        } else if ((roles.root || roles.bodyText || /(^|[._-])(body|base|paragraph|md|default)([._-]|$)/i.test(fact.tokenPath ?? "")) && r.max >= 12 && r.max <= 22) {
          bodySizes.push(r.max);
        }
      }
    }
    if (weightValue && (roles.heading || /heading|display|title/i.test(fact.tokenPath ?? ""))) {
      const w = weightNumber(weightValue);
      if (w) headingWeights.push(w);
    }
    if (lineHeightValue) {
      const isHeading = roles.heading || /heading|display|title/i.test(fact.tokenPath ?? "");
      const lh = lineHeightRatio(lineHeightValue, fontPx ?? (isHeading ? 40 : 16), rootPx);
      if (lh !== undefined) {
        if (isHeading) headingLineHeights.push(lh);
        else if (roles.root || roles.bodyText || /body|paragraph/i.test(fact.tokenPath ?? "")) bodyLineHeights.push(lh);
      }
    }
    if (prop === "letter-spacing" && (roles.heading || /heading|display/i.test(fact.tokenPath ?? ""))) {
      const v = value.trim();
      const em = v.endsWith("em") && !v.endsWith("rem") ? Number.parseFloat(v) : (lengthToPx(v, rootPx) ?? Number.NaN) / 40;
      if (Number.isFinite(em) && Math.abs(em) < 0.3) headingTracking.push(em);
    }
    if (prop === "text-transform" && /uppercase/i.test(value) && (roles.eyebrow || roles.badge || roles.nav || roles.button)) {
      uppercaseLabels++;
    }

    // ----- spacing, shape, elevation, layout -----
    if (/^(padding|margin|gap|row-gap|column-gap)(-|$)/.test(prop) || /(^|[._-])(space|spacing|gap|gutter)([._-]|$)/i.test(fact.tokenPath ?? "")) {
      for (const px of lengthsIn(value).map((n) => n)) {
        if (px > 0 && px <= 256) spacing.push(px * (rootPx / 16));
      }
      if (roles.button && /^padding/.test(prop)) addComp("button", "padding", value);
      if (roles.card && /^padding/.test(prop)) addComp("card", "padding", value);
      if (roles.input && /^padding/.test(prop)) addComp("input", "padding", value);
    }
    if (prop === "border-radius" || /radius|radii|rounded|corner/i.test(prop.startsWith("--") ? prop : fact.tokenPath ?? "")) {
      const first = value.split(/\s+/)[0] ?? "";
      let px: number | null = null;
      if (/^\d+%$/.test(first)) px = Number.parseFloat(first) >= 50 ? 9999 : null;
      else px = lengthToPx(first, rootPx);
      if (px !== null && px >= 0) {
        const capped = px >= 500 ? 9999 : px;
        radii.push(capped);
        if (roles.button) buttonRadii.push(capped);
        if (roles.card) cardRadii.push(capped);
        if (roles.input) addComp("input", "border-radius", `${capped}px`);
      }
    }
    if (prop === "border-width" || /^border(-(top|bottom|left|right))?$/.test(prop)) {
      const w = lengthsIn(value)[0];
      if (w !== undefined && w > 0 && w <= 8) borderWidths.push(w);
      if (roles.card && /^border$/.test(prop)) addComp("card", "border", value);
      if (roles.input && /^border$/.test(prop)) addComp("input", "border", value);
      if (roles.button && /^border$/.test(prop)) addComp("button", "border", value);
    }
    if (prop === "box-shadow" || (prop.startsWith("--") && /shadow|elevation/i.test(prop + (fact.tokenPath ?? "")))) {
      const kind = classifyShadow(value);
      if (kind) {
        shadowKinds.push(kind);
        if (roles.card) addComp("card", "shadow", kind);
        if (roles.button) addComp("button", "shadow", kind);
      }
    }
    if (prop === "max-width" || /(^|[._-])(container|content-width|max-width|layout-width)([._-]|$)/i.test(fact.tokenPath ?? "")) {
      const px = lengthToPx(value, rootPx);
      if (px && px >= 560 && px <= 2400 && (roles.container || roles.root || fact.tokenPath || /container|wrapper|layout/i.test(fact.selector))) {
        maxWidths.push(px);
      }
    }
    if (prop === "display") {
      if (/grid/.test(value)) gridDecl++;
      if (/flex/.test(value)) flexDecl++;
    }
    if (prop === "position" && /sticky|fixed/.test(value) && roles.nav) stickyHeader = true;
    if ((prop === "backdrop-filter" || prop === "-webkit-backdrop-filter") && /blur\(/i.test(value)) {
      backdropBlur++;
      if (roles.nav) addComp("nav", "backdrop", "blur");
    }

    // ----- motion -----
    if (/^(transition|animation)(-duration)?$/.test(prop) || /duration|timing|motion-/i.test(prop.startsWith("--") ? prop : fact.tokenPath ?? "")) {
      for (const ms of parseTimeMs(value)) if (ms > 0 && ms <= 3000) durations.push(ms);
    }
    if (/timing-function|^transition$|^animation$/.test(prop) || /easing|ease/i.test(fact.tokenPath ?? "")) {
      const ease = /cubic-bezier\([^)]*\)|\b(ease-in-out|ease-out|ease-in|linear|ease)\b/i.exec(value)?.[0];
      if (ease) easings.push(ease.replace(/\s+/g, ""));
    }

    // ----- focus & accessibility -----
    if (roles.focus && /^(outline|box-shadow|outline-color|outline-width|outline-style)$/.test(prop)) {
      if (/^(none|0)$/i.test(value.trim())) {
        if (!/focus-visible/.test(fact.selector)) outlineNone++;
      } else {
        focusVisible = true;
      }
    }

    // ----- component specifics -----
    if (roles.button && !roles.hover && !darkContext) {
      if (prop === "font-weight") addComp("button", "font-weight", value);
      if (prop === "text-transform") addComp("button", "text-transform", value);
      if (prop === "background" || prop === "background-color") {
        const hex = extractColorLiterals(value).map((c) => toHex(c)).find(Boolean);
        if (hex) addComp("button", "background", hex);
      }
      if (prop === "height" || prop === "min-height") addComp("button", "height", value);
    }
    if (roles.input && !darkContext && (prop === "height" || prop === "min-height")) addComp("input", "height", value);
    if (roles.card && !darkContext && (prop === "background" || prop === "background-color")) {
      const hex = extractColorLiterals(value).map((c) => toHex(c)).find(Boolean);
      if (hex) addComp("card", "background", hex);
    }
    if (roles.nav && !darkContext && (prop === "height" || prop === "min-height")) addComp("nav", "height", value);
  }

  // ----- resolve colors -----
  // The strongest single signal wins (a body rule or a "default" token); repetition breaks ties.
  // Token sources need a naming signal beyond the role word (a "default"/"page" name or a short
  // canonical name); otherwise the background/text stays unknown rather than guessed.
  const minWeight = input.sourceKind === "design_system" ? 5 : 0;
  const pick = (all: Array<{ hex: string; weight: number }>) => {
    const candidates = all.filter((c) => c.weight >= minWeight);
    const scores = new Map<string, number>();
    for (const c of candidates) scores.set(c.hex, Math.max(scores.get(c.hex) ?? 0, c.weight * 100) + 1);
    return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const background = pick(backgroundCandidates);
  let text = pick(textCandidates);
  if (!text && background) {
    // Fall back to the most-used text-role color that actually contrasts with the background.
    text = [...colors.values()]
      .filter((c) => (c.roles.get("text") ?? 0) > 0 && !c.darkOnly && contrastRatio(c.hex, background) >= 3)
      .sort((a, b) => (b.roles.get("text") ?? 0) - (a.roles.get("text") ?? 0))[0]?.hex;
  }

  // Token files expose whole palettes, so only role-named tokens count there; on websites,
  // plain usage frequency is a weak extra signal.
  const usageWeight = input.sourceKind === "website" ? 0.25 : 0;
  const brandScore = (t: ColorTally) =>
    (t.roles.get("brand") ?? 0) * 3 +
    (t.roles.get("cta") ?? 0) * 4 +
    (t.roles.get("link") ?? 0) * 2 +
    (t.roles.get("accent") ?? 0) +
    (t.roles.get("gradient") ?? 0) * 0.5 +
    t.lightCount * usageWeight;
  const chromatic = [...colors.values()].filter(
    (t) => (toOklch(t.hex)?.c ?? 0) >= 0.06 && (t.roles.get("status") ?? 0) < t.count && t.stateCount < t.count,
  );
  const brandCandidates: string[] = [];
  for (const t of chromatic.sort((a, b) => brandScore(b) - brandScore(a))) {
    if (brandScore(t) <= 0) continue;
    if (brandCandidates.some((b) => deltaE(b, t.hex) < 0.05)) continue;
    brandCandidates.push(t.hex);
    if (brandCandidates.length >= 3) break;
  }
  if (input.themeColor) {
    const theme = toHex(input.themeColor);
    if (theme && (toOklch(theme)?.c ?? 0) >= 0.06 && !brandCandidates.includes(theme) && brandCandidates.length < 3) brandCandidates.push(theme);
  }

  const palette: ColorEvidence[] = [...colors.values()]
    .filter((t) => !t.darkOnly || colors.size < 6)
    .sort((a, b) => b.count - a.count)
    .slice(0, 24)
    .map((t) => {
      const role = [...t.roles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
      const finalRole: ColorRole = t.hex === background ? "background" : t.hex === text ? "text" : brandCandidates.includes(t.hex) && role === "other" ? "brand" : role;
      const confidence = finalRole === "background" || finalRole === "text" ? 0.8 : finalRole === "other" ? 0.4 : 0.6;
      return { hex: t.hex, role: finalRole, frequency: t.count, confidence, evidence: t.evidence.join(" | ") };
    });

  const scheme: SiteProfile["colors"]["scheme"] = background ? ((toOklch(background)?.l ?? 1) < 0.45 ? "dark" : "light") : "unknown";

  // ----- resolve fonts -----
  const googleFamilies = googleFontFamilies(input.fontLinks);
  const faceFamilies = new Set(input.fontFaces.map((f) => normalizeFamily(f.family)));
  const adobe = input.fontLinks.some((l) => l.includes("typekit.net"));
  const fontEvidence: FontEvidence[] = [...fonts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([key, t]) => {
      const role = [...t.roles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "declared";
      let delivery: FontDelivery = "unknown";
      if (t.isSystem || key === "system-ui") delivery = "system";
      else if (googleFamilies.has(key)) delivery = "google-fonts";
      else if (faceFamilies.has(key)) delivery = "self-hosted";
      else if (adobe) delivery = "adobe-fonts";
      const known = lookupFont(t.family);
      return {
        family: known?.family ?? t.family,
        normalized: key,
        role,
        classification: t.isSystem ? "system" : classifyFont(t.family, t.generic),
        delivery,
        frequency: t.count,
        confidence: role === "declared" ? 0.45 : 0.7,
        evidence: t.evidence.join(" | "),
      };
    });
  const byRole = (role: FontEvidence["role"]) => {
    let best: FontEvidence | undefined;
    let bestCount = 0;
    for (const [key, t] of fonts) {
      const n = t.roles.get(role) ?? 0;
      if (n > bestCount) {
        bestCount = n;
        best = fontEvidence.find((f) => f.normalized === key);
      }
    }
    return best?.family;
  };
  const bodyFont = byRole("body") ?? fontEvidence.find((f) => f.classification !== "monospace")?.family;
  const headingFont = byRole("heading") ?? bodyFont;
  const monoFont = byRole("mono");

  const h: SiteProfile["typography"]["headingSizesPx"] = {};
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    const m = median(headingSizes[level]!);
    if (m) h[`h${level}` as const] = round(m, 1);
  }
  const bodySizePx = median(bodySizes);
  const chain = [h.h1, h.h2, h.h3, h.h4, bodySizePx].filter((v): v is number => v !== undefined);
  let typeScaleRatio: number | undefined;
  if (chain.length >= 3) {
    const ratios: number[] = [];
    for (let i = 0; i + 1 < chain.length; i++) if (chain[i + 1]! > 0 && chain[i]! > chain[i + 1]!) ratios.push(chain[i]! / chain[i + 1]!);
    if (ratios.length >= 2) typeScaleRatio = round(Math.exp(ratios.reduce((s, r) => s + Math.log(r), 0) / ratios.length), 3);
  }

  // ----- spacing summary -----
  const spacingTally = tally(spacing, 14);
  const nonZero = spacing.filter((v) => v > 0);
  const share = (unit: number) => (nonZero.length ? nonZero.filter((v) => Math.abs(v / unit - Math.round(v / unit)) < 0.01).length / nonZero.length : 0);
  const baseUnitPx = nonZero.length >= 10 ? (share(8) >= 0.6 ? 8 : share(4) >= 0.6 ? 4 : undefined) : undefined;
  const medianSpacing = median(nonZero);
  const density: SiteProfile["spacing"]["density"] =
    medianSpacing === undefined || nonZero.length < 10 ? undefined : medianSpacing < 12 ? "compact" : medianSpacing <= 24 ? "comfortable" : "airy";

  // ----- shape / elevation -----
  const radiusTally = tally(radii, 10);
  const dominantRadiusPx = tally(radii.filter((r) => r > 0 && r < 100), 1)[0]?.value;
  const buttonRadiusPx = median(buttonRadii);
  const cardRadiusPx = median(cardRadii);
  const shadowStyle = (mostCommon(shadowKinds) as SiteProfile["elevation"]["style"] | undefined) ?? "none";

  // ----- components -----
  const components: ComponentEvidence[] = [];
  for (const [component, props] of Object.entries(comp)) {
    for (const [property, values] of Object.entries(props)) {
      const value = mostCommon(values);
      if (!value) continue;
      components.push({
        component: component as ComponentEvidence["component"],
        property,
        value: value.slice(0, 120),
        confidence: round(Math.min(0.75, 0.35 + values.length * 0.05), 2),
        evidence: `${values.length} declaration(s) on ${component}-like selectors`,
      });
    }
  }
  if (buttonRadiusPx !== undefined) {
    components.push({ component: "button", property: "border-radius", value: `${buttonRadiusPx}px`, confidence: 0.6, evidence: `median of ${buttonRadii.length} button radius declarations` });
  }
  if (cardRadiusPx !== undefined) {
    components.push({ component: "card", property: "border-radius", value: `${cardRadiusPx}px`, confidence: 0.55, evidence: `median of ${cardRadii.length} card radius declarations` });
  }

  const breakpoints = input.mediaQueries.flatMap((q) => {
    const out: number[] = [];
    for (const m of q.matchAll(/(?:min|max)-width\s*:\s*(\d*\.?\d+)(px|em|rem)/gi)) {
      const n = Number.parseFloat(m[1]!);
      const px = m[2] === "px" ? n : n * 16;
      if (px >= 320 && px <= 2560) out.push(Math.round(px));
    }
    for (const m of q.matchAll(/width\s*[<>]=?\s*(\d*\.?\d+)(px|em|rem)/gi)) {
      const n = Number.parseFloat(m[1]!);
      const px = m[2] === "px" ? n : n * 16;
      if (px >= 320 && px <= 2560) out.push(Math.round(px));
    }
    return out;
  });

  return {
    sourceKind: input.sourceKind,
    url: input.url,
    finalUrl: input.finalUrl,
    fetchedAt: new Date().toISOString(),
    meta: { themeColor: input.themeColor },
    colors: {
      palette,
      background,
      text,
      brandCandidates,
      scheme,
      supportsDarkMode,
      customPropertyColorCount: customPropertyColors,
      uniqueColorCount: colors.size,
    },
    typography: {
      fonts: fontEvidence,
      headingFont,
      bodyFont,
      monoFont,
      bodySizePx: bodySizePx !== undefined ? round(bodySizePx, 1) : undefined,
      headingSizesPx: h,
      typeScaleRatio,
      headingWeight: median(headingWeights),
      bodyLineHeight: median(bodyLineHeights) !== undefined ? round(median(bodyLineHeights)!, 2) : undefined,
      headingLineHeight: median(headingLineHeights) !== undefined ? round(median(headingLineHeights)!, 2) : undefined,
      headingLetterSpacingEm: median(headingTracking) !== undefined ? round(median(headingTracking)!, 3) : undefined,
      uppercaseLabels: uppercaseLabels >= 2,
      distinctFontSizes: allFontSizes.size,
    },
    spacing: { baseUnitPx, commonValuesPx: spacingTally, density },
    shape: {
      radiiPx: radiusTally,
      dominantRadiusPx,
      buttonRadiusPx,
      cardRadiusPx,
      pillButtons: (buttonRadiusPx ?? 0) >= 40,
      borderWidthsPx: tally(borderWidths, 5),
    },
    elevation: { shadowCount: shadowKinds.length, style: shadowStyle },
    layout: {
      containerMaxWidthsPx: tally(maxWidths, 6),
      breakpointsPx: tally(breakpoints, 8),
      gridDeclarations: gridDecl,
      flexDeclarations: flexDecl,
      stickyHeader,
    },
    effects: {
      gradients,
      backdropBlur,
      keyframes: input.keyframes,
      transitionDurationsMs: tally(durations, 6),
      easings: [...new Set(easings)].slice(0, 6),
      reducedMotionSupport: input.mediaQueries.some((m) => /prefers-reduced-motion/i.test(m)),
    },
    components,
    structure: {
      headings: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
      sections: 0,
      navs: 0,
      forms: 0,
      buttons: 0,
      images: 0,
      svgs: 0,
      videos: 0,
      iconLibraries: [],
    },
    accessibility: {
      langAttribute: false,
      viewportZoomBlocked: false,
      imagesMissingAlt: 0,
      imagesTotal: 0,
      bodyTextContrast: background && text ? contrastRatio(text, background) : undefined,
      focusVisibleStyles: focusVisible,
      outlineNoneCount: outlineNone,
      skipLink: false,
      reducedMotion: input.mediaQueries.some((m) => /prefers-reduced-motion/i.test(m)),
      h1Count: 0,
    },
    tech: { frameworks: [], cssFrameworks: [] },
    limitations: input.limitations,
  };
}
