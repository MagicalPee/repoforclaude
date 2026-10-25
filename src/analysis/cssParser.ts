// A tolerant CSS scanner. It does not build a full CSSOM; it extracts the declarations,
// custom properties, @font-face rules, imports and media conditions needed for design
// analysis, and never evaluates anything.

export interface CssDeclaration {
  selector: string;
  property: string;
  value: string;
  media: string | null;
  important: boolean;
}

export interface FontFaceRule {
  family: string;
  src: string[];
  weight?: string;
  style?: string;
  display?: string;
}

export interface ParsedCss {
  declarations: CssDeclaration[];
  customProperties: Map<string, Array<{ value: string; selector: string; media: string | null }>>;
  fontFaces: FontFaceRule[];
  imports: string[];
  mediaQueries: string[];
  keyframes: number;
  truncated: boolean;
}

export interface ParseOptions {
  maxDeclarations?: number;
}

function stripComments(css: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < css.length) {
    const ch = css[i]!;
    if (quote) {
      out += ch;
      if (ch === "\\" && i + 1 < css.length) {
        out += css[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end < 0 ? css.length : end + 2;
      out += " ";
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Index of the `}` matching the `{` at `open`, respecting strings and parentheses. */
function matchingBrace(css: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < css.length; i++) {
    const ch = css[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return css.length;
}

/** Next index of `;`, `{` or `}` at paren depth 0, outside strings. */
function nextBoundary(css: string, from: number, end: number): number {
  let paren = 0;
  let quote: string | null = null;
  for (let i = from; i < end; i++) {
    const ch = css[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    else if (paren === 0 && (ch === ";" || ch === "{" || ch === "}")) return i;
  }
  return end;
}

function splitDeclaration(chunk: string): { property: string; value: string; important: boolean } | null {
  const idx = chunk.indexOf(":");
  if (idx <= 0) return null;
  const property = chunk.slice(0, idx).trim();
  if (!/^(--[\w-]+|-?[a-zA-Z][\w-]*)$/.test(property)) return null;
  let value = chunk.slice(idx + 1).trim();
  let important = false;
  const imp = /!\s*important\s*$/i.exec(value);
  if (imp) {
    important = true;
    value = value.slice(0, imp.index).trim();
  }
  if (!value) return null;
  return { property: property.startsWith("--") ? property : property.toLowerCase(), value, important };
}

function combineSelectors(parent: string, child: string): string {
  if (!parent) return child;
  const parents = splitTopLevel(parent, ",");
  const children = splitTopLevel(child, ",");
  const out: string[] = [];
  for (const p of parents) {
    for (const c of children) {
      out.push(c.includes("&") ? c.replace(/&/g, p.trim()) : `${p.trim()} ${c.trim()}`);
    }
  }
  return out.join(", ");
}

/** Splits on `sep` at depth 0 (outside parentheses, brackets and strings). */
export function splitTopLevel(input: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    else if (depth === 0 && ch === sep) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(input.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function unquote(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

export function parseCss(input: string, options: ParseOptions = {}): ParsedCss {
  const css = stripComments(input);
  const result: ParsedCss = {
    declarations: [],
    customProperties: new Map(),
    fontFaces: [],
    imports: [],
    mediaQueries: [],
    keyframes: 0,
    truncated: false,
  };
  const maxDecl = options.maxDeclarations ?? 120_000;

  const walk = (start: number, end: number, selector: string, media: string | null, depth: number): void => {
    if (depth > 12) return;
    let i = start;
    while (i < end) {
      const b = nextBoundary(css, i, end);
      const chunk = css.slice(i, b).trim();
      const ch = css[b];
      if (ch === "{") {
        const close = Math.min(matchingBrace(css, b), end);
        const prelude = chunk;
        handleBlock(prelude, b + 1, close, selector, media, depth);
        i = close + 1;
        continue;
      }
      if (chunk) {
        if (chunk.startsWith("@")) {
          const imp = /^@import\s+(?:url\(\s*)?["']?([^"')\s]+)["']?\s*\)?/i.exec(chunk);
          if (imp) result.imports.push(imp[1]!);
        } else if (selector) {
          const decl = splitDeclaration(chunk);
          if (decl) {
            if (result.declarations.length >= maxDecl) {
              result.truncated = true;
            } else {
              result.declarations.push({ selector, media, ...decl });
            }
            if (decl.property.startsWith("--")) {
              const list = result.customProperties.get(decl.property) ?? [];
              if (list.length < 12) list.push({ value: decl.value, selector, media });
              result.customProperties.set(decl.property, list);
            }
          }
        }
      }
      i = b + 1;
    }
  };

  const handleBlock = (prelude: string, start: number, end: number, selector: string, media: string | null, depth: number) => {
    if (prelude.startsWith("@")) {
      const name = /^@([\w-]+)/.exec(prelude)?.[1]?.toLowerCase() ?? "";
      const condition = prelude.slice(name.length + 1).trim();
      if (name === "media") {
        result.mediaQueries.push(condition);
        walk(start, end, selector, media ? `${media} and ${condition}` : condition, depth + 1);
      } else if (name === "supports" || name === "layer" || name === "container" || name === "scope" || name === "document") {
        walk(start, end, selector, media, depth + 1);
      } else if (name === "font-face") {
        result.fontFaces.push(parseFontFace(css.slice(start, end)));
      } else if (name.endsWith("keyframes")) {
        result.keyframes++;
      } else if (name === "theme") {
        // Tailwind v4 @theme blocks hold custom properties like :root.
        walk(start, end, ":root", media, depth + 1);
      }
      return;
    }
    walk(start, end, combineSelectors(selector, prelude), media, depth + 1);
  };

  walk(0, css.length, "", null, 0);
  return result;
}

function parseFontFace(block: string): FontFaceRule {
  const rule: FontFaceRule = { family: "", src: [] };
  for (const chunk of splitTopLevel(block, ";")) {
    const decl = splitDeclaration(chunk);
    if (!decl) continue;
    if (decl.property === "font-family") rule.family = unquote(decl.value);
    else if (decl.property === "src") {
      for (const m of decl.value.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) rule.src.push(m[1]!);
    } else if (decl.property === "font-weight") rule.weight = decl.value;
    else if (decl.property === "font-style") rule.style = decl.value;
    else if (decl.property === "font-display") rule.display = decl.value;
  }
  return rule;
}

// ---------- value helpers ----------

/** Replaces var(--x, fallback) using the first :root-level definition, recursively. */
export function resolveVars(
  value: string,
  customProperties: ParsedCss["customProperties"],
  depth = 0,
): string {
  if (depth > 6 || !value.includes("var(")) return value;
  const replaced = value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (_m, name: string, fallback?: string) => {
    const defs = customProperties.get(name);
    const preferred = defs?.find((d) => !d.media && /(^|,\s*)(:root|html)(\s*,|$)/.test(d.selector)) ?? defs?.[0];
    if (preferred) return preferred.value;
    return fallback?.trim() ?? "";
  });
  return replaced === value ? value : resolveVars(replaced, customProperties, depth + 1);
}

export interface LengthPx {
  min: number;
  max: number;
}

const ROOT_PX = 16;

function singleLengthPx(token: string): number | null {
  const m = /^(-?\d*\.?\d+)(px|rem|em|pt|)$/i.exec(token.trim());
  if (!m) return null;
  const n = Number.parseFloat(m[1]!);
  const unit = m[2]!.toLowerCase();
  if (unit === "px") return n;
  if (unit === "rem" || unit === "em") return n * ROOT_PX;
  if (unit === "pt") return (n * 4) / 3;
  return n === 0 ? 0 : null;
}

/** Parses px/rem/em/pt lengths, and clamp()/min()/max() of them, into a pixel range at a 16px root. */
export function parseLengthPx(value: string): LengthPx | null {
  const v = value.trim().toLowerCase();
  const single = singleLengthPx(v);
  if (single !== null) return { min: single, max: single };
  const fn = /^(clamp|min|max)\((.*)\)$/.exec(v);
  if (fn) {
    const args = splitTopLevel(fn[2]!, ",").map((a) => singleLengthPx(a));
    const known = args.filter((a): a is number => a !== null);
    if (fn[1] === "clamp" && args.length === 3) {
      const lo = args[0];
      const hi = args[2];
      if (lo !== null && lo !== undefined && hi !== null && hi !== undefined) return { min: lo, max: hi };
    }
    if (known.length > 0) return { min: Math.min(...known), max: Math.max(...known) };
  }
  return null;
}

/** All px-convertible lengths in a shorthand like `padding: 12px 1.5rem`. */
export function lengthsIn(value: string): number[] {
  const out: number[] = [];
  for (const token of value.split(/\s+/)) {
    const px = singleLengthPx(token);
    if (px !== null) out.push(px);
  }
  return out;
}

export function parseTimeMs(value: string): number[] {
  const out: number[] = [];
  for (const m of value.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)) {
    const n = Number.parseFloat(m[1]!);
    out.push(m[2] === "s" ? n * 1000 : n);
  }
  return out;
}

const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
  "inherit",
  "initial",
  "unset",
  "revert",
]);

export interface FontStack {
  families: string[];
  primary: string | null;
  generic: string | null;
  isSystemStack: boolean;
}

export function parseFontFamily(value: string): FontStack {
  // Some token files wrap a whole stack in one quoted string; unwrap it once.
  const trimmed = value.trim();
  const raw = /^"[^"]*"$|^'[^']*'$/.test(trimmed) ? unquote(trimmed) : trimmed;
  const families = splitTopLevel(raw, ",")
    .map((f) => unquote(f).trim())
    .filter((f) => f && !/emoji|symbol|^#\{|\(/i.test(f));
  const lower = families.map((f) => f.toLowerCase());
  const generic = lower.find((f) => GENERIC_FAMILIES.has(f)) ?? null;
  const systemMarkers = ["-apple-system", "blinkmacsystemfont", "system-ui", "segoe ui", "ui-sans-serif"];
  const firstNonGeneric = families.find((f) => !GENERIC_FAMILIES.has(f.toLowerCase()) && !f.startsWith("var("));
  const isSystemStack =
    systemMarkers.includes(lower[0] ?? "") || (firstNonGeneric !== undefined && systemMarkers.includes(firstNonGeneric.toLowerCase()));
  return { families, primary: firstNonGeneric ?? null, generic, isSystemStack };
}
