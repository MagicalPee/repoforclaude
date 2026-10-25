import { ANALYZER_VERSION, type ResearchConfig } from "../config.js";
import type { AnalysisRecord, ReferenceInput } from "../db/store.js";
import { classifyProfile } from "../patterns/classifier.js";
import type { CachedFetcher } from "../research/cachedFetcher.js";
import { parseColor } from "./color.js";
import { parseCss, resolveVars } from "./cssParser.js";
import { profileToObservations } from "./observations.js";
import { buildProfile, type StyleFact } from "./profileBuilder.js";

export interface TokenFileConfig {
  path: string;
  /** Which theme the file describes; dark files only signal dark-mode support. */
  theme?: "light" | "dark" | "any";
}

export interface DesignSystemConfig {
  repo: string; // owner/name
  ref: string;
  files: TokenFileConfig[];
  docsUrl?: string;
  /** Raw-file host; defaults to raw.githubusercontent.com (overridable for mirrors and tests). */
  rawBaseUrl?: string;
}

export type FlatTokens = Map<string, string>;

// ---------- format parsers (no evaluation, ever) ----------

/** Strips comments and trailing commas, quotes bare keys and single-quoted strings. */
export function json5ToJson(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let s = "";
      while (j < text.length && text[j] !== quote) {
        if (text[j] === "\\") {
          s += text[j]! + (text[j + 1] ?? "");
          j += 2;
          continue;
        }
        s += text[j] === '"' && quote === "'" ? '\\"' : text[j];
        j++;
      }
      out += `"${s}"`;
      i = j + 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out
    .replace(/([{,]\s*)([A-Za-z_$][\w$-]*|\d+)\s*:/g, '$1"$2":')
    .replace(/,(\s*[}\]])/g, "$1");
}

function flattenObject(value: unknown, path: string[], out: FlatTokens, depth = 0): void {
  if (depth > 14 || out.size > 20_000) return;
  if (value === null || value === undefined) return;
  if (typeof value === "string" || typeof value === "number") {
    out.set(path.join("."), String(value));
    return;
  }
  if (Array.isArray(value)) {
    // Font stacks and shadow layers come as arrays.
    if (value.every((v) => typeof v === "string")) out.set(path.join("."), value.join(", "));
    else value.forEach((v, i) => flattenObject(v, [...path, String(i)], out, depth + 1));
    return;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const leaf = obj.$value ?? obj.value;
    if (leaf !== undefined && (typeof leaf !== "object" || Array.isArray(leaf) || leaf === null)) {
      flattenObject(leaf, path, out, depth + 1);
      return;
    }
    if (leaf !== null && typeof leaf === "object" && typeof (leaf as { hex?: unknown }).hex === "string") {
      // DTCG 2025 color objects: { colorSpace, components, hex }.
      out.set(path.join("."), (leaf as { hex: string }).hex);
      return;
    }
    if (leaf !== undefined && typeof leaf === "object") {
      // Composite DTCG values (typography, shadow): flatten their fields.
      flattenObject(leaf, path, out, depth + 1);
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("$") || k === "type" || k === "description" || k === "comment" || k === "attributes" || k === "extensions") continue;
      flattenObject(v, [...path, k], out, depth + 1);
    }
  }
}

export function flattenJson(text: string, json5 = false): FlatTokens {
  const out: FlatTokens = new Map();
  try {
    flattenObject(JSON.parse(json5 ? json5ToJson(text) : text), [], out);
  } catch {
    if (!json5) return flattenJson(text, true);
  }
  return out;
}

/** Minimal YAML subset: nested mappings and scalars (enough for token files). */
export function flattenYaml(text: string): FlatTokens {
  const out: FlatTokens = new Map();
  const stack: Array<{ indent: number; key: string }> = [];
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(raw) || /^\s*-\s/.test(raw)) continue;
    const m = /^(\s*)(["']?)([^:"']+)\2\s*:\s*(.*)$/.exec(raw);
    if (!m) continue;
    const indent = m[1]!.length;
    const key = m[3]!.trim();
    let value = m[4]!.replace(/\s+#.*$/, "").trim();
    while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop();
    if (value === "" || value === "|" || value === ">") {
      stack.push({ indent, key });
      continue;
    }
    value = value.replace(/^["']|["']$/g, "");
    const path = [...stack.map((s) => s.key), key];
    // Salesforce/Theo style files nest values under "value:".
    if (key === "value" && stack.length) path.pop();
    out.set(path.join("."), value);
  }
  return out;
}

/** SCSS: $variables, custom properties and simple maps. */
export function flattenScss(text: string): FlatTokens {
  const out: FlatTokens = new Map();
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const m of clean.matchAll(/(?:^|[;{\s])\$([\w-]+)\s*:\s*([^;]+?)\s*(?:!default|!global)?\s*;/g)) {
    const name = m[1]!;
    const value = m[2]!.trim();
    if (value.startsWith("(")) {
      for (const e of value.slice(1, -1).matchAll(/["']?([\w-]+)["']?\s*:\s*([^,()]+(?:\([^)]*\))?)/g)) {
        out.set(`${name}.${e[1]}`, e[2]!.trim());
      }
    } else {
      out.set(name, value);
    }
  }
  for (const m of clean.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) out.set(m[1]!.slice(2), m[2]!.trim());
  // Resolve $var references in two passes.
  for (let pass = 0; pass < 3; pass++) {
    for (const [k, v] of out) {
      if (!v.includes("$")) continue;
      out.set(
        k,
        v.replace(/\$([\w-]+)(?:\.([\w-]+))?/g, (whole, a: string, b?: string) => out.get(b ? `${a}.${b}` : a) ?? whole),
      );
    }
  }
  return out;
}

/** JS/TS object literals: tracks nesting by braces and records `key: "literal"` pairs. */
export function flattenJsObjects(text: string): FlatTokens {
  const out: FlatTokens = new Map();
  const src = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    // Member references such as `colors.gray[16]` become "{gray.16}" for resolveReferences.
    .replace(/\b[A-Za-z_$][\w$]*\.([A-Za-z_$][\w$]*)\[\s*["']?([\w-]+)["']?\s*\]/g, '"{$1.$2}"');
  // Top-level `const name = "literal"` declarations (e.g. color constants).
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[\w<>[\]|]+)?\s*=\s*(["'`])([^"'`\n]{1,200})\2/g)) {
    out.set(m[1]!, m[3]!);
  }
  const stack: string[] = [];
  let pendingKey: string | null = null;
  const tokenRe = /([A-Za-z_$][\w$]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`$]*`|-?\d*\.?\d+(?:px|rem|em|ms|s|%)?)\s*(:)?|([{}\[\],])/g;
  let lastKeyCandidate: string | null = null;
  for (const m of src.matchAll(tokenRe)) {
    const [, word, colon, punct] = m;
    if (punct === "{") {
      stack.push(pendingKey ?? lastKeyCandidate ?? "_");
      pendingKey = null;
      continue;
    }
    if (punct === "}") {
      stack.pop();
      pendingKey = null;
      continue;
    }
    if (punct === "[" || punct === "]" || punct === ",") {
      if (punct !== ",") pendingKey = null;
      continue;
    }
    if (!word) continue;
    const unquoted = /^["'`]/.test(word) ? word.slice(1, -1) : word;
    if (colon) {
      pendingKey = unquoted;
      continue;
    }
    if (pendingKey !== null) {
      const isLiteral = /^["'`]/.test(word) || /^-?\d/.test(word);
      if (isLiteral) {
        const parts = [...stack.filter((s) => s !== "_"), pendingKey];
        if (parts.length > 1 && (pendingKey === "value" || pendingKey === "$value")) parts.pop();
        const path = parts.join(".");
        if (out.size < 20_000) out.set(path, unquoted);
      } else {
        // `name: Type = {` — the key before a type annotation names the object.
        lastKeyCandidate = pendingKey;
      }
      pendingKey = null;
    } else {
      // e.g. `export const colors = {` → the identifier before "=" names the object.
      lastKeyCandidate = unquoted;
    }
  }
  return out;
}

export function flattenTokenFile(path: string, text: string): FlatTokens {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json")) return flattenJson(text);
  if (lower.endsWith(".json5")) return flattenJson(text, true);
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return flattenYaml(text);
  if (lower.endsWith(".scss") || lower.endsWith(".sass")) return flattenScss(text);
  if (lower.endsWith(".css")) {
    const parsed = parseCss(text);
    const out: FlatTokens = new Map();
    for (const [name, defs] of parsed.customProperties) out.set(name.slice(2), resolveVars(defs[0]!.value, parsed.customProperties));
    return out;
  }
  if (/\.(ts|js|mjs|cjs|tsx)$/.test(lower)) return flattenJsObjects(text);
  return new Map();
}

/** Resolves `{a.b.c}` (DTCG/Style Dictionary) references across all files of one source. */
export function resolveReferences(tokens: FlatTokens): FlatTokens {
  const lowerIndex = new Map<string, string>();
  for (const k of tokens.keys()) lowerIndex.set(k.toLowerCase(), k);
  const lookup = (ref: string) => {
    const lower = ref.toLowerCase();
    const key = lowerIndex.get(lower) ?? lowerIndex.get(`${lower}.value`) ?? lowerIndex.get(`${lower}.hex`);
    return key ? tokens.get(key) : undefined;
  };
  const out: FlatTokens = new Map(tokens);
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (const [k, v] of out) {
      if (!v.includes("{")) continue;
      const next = v.replace(/\{([\w.$-]+)\}/g, (whole, ref: string) => lookup(ref.replace(/\.value$/, "")) ?? whole);
      if (next !== v) {
        out.set(k, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

// ---------- tokens → style facts ----------

function pathWords(path: string): string {
  return path.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/** Maps a token to the CSS property it most plausibly drives, from its path and value. */
export function tokenToFact(path: string, value: string, sourceRef: string, theme: TokenFileConfig["theme"]): StyleFact | null {
  const words = pathWords(path);
  const selector = `.${words.replace(/[^a-z0-9]+/g, "-")}`;
  const media = theme === "dark" ? "(prefers-color-scheme: dark)" : null;
  const v = value.trim();
  if (!v || v.includes("{") || v.length > 400) return null;
  const fact = (property: string, val = v): StyleFact => ({ selector, property, value: val, media, sourceRef, tokenPath: path });

  if (/(^|[.-])(breakpoint|breakpoints|screen|screens|bp|mq)([.-]|$)/.test(words)) {
    return fact("--breakpoint", v);
  }
  if (parseColor(v) && !/(shadow|elevation)/.test(words)) return fact(`--${words.replace(/[^a-z0-9]+/g, "-")}`);
  if (/font-?family|font-?stack|(^|[.-])(family|families|typeface)([.-]|$)|font\.(sans|serif|mono)|fonts?\.(heading|body|display|code|base)/.test(words) && /[a-z]/i.test(v) && !/^\d/.test(v)) {
    // Skip role aliases ("body", "sans") and function calls; keep real family names.
    if (/^["']?(ui|body|heading|display|sans|serif|mono|code|alt|base|primary|secondary|[a-z]+-[a-z]+)["']?$/.test(v) || /\(/.test(v)) return null;
    return fact("--font-family", v);
  }
  if (/(shadow|elevation)/.test(words) && /\d/.test(v)) return fact("box-shadow");
  if (/(radius|radii|rounded|corner)/.test(words)) return fact("border-radius");
  if (/line-?height|leading/.test(words)) return fact("line-height");
  if (/letter-?spacing|tracking/.test(words)) return fact("letter-spacing");
  if (/font-?weight|(^|[.-])weight([.-]|$)/.test(words)) return fact("font-weight");
  if (/duration|(^|[.-])(time|timing)([.-]|$)/.test(words) && /\d(ms|s)\b/.test(v)) return fact("transition-duration");
  if (/easing|ease|curve|timing-function/.test(words)) return fact("transition-timing-function");
  if (/font-?size|text-?size|type-?scale|(^|[.-])(size|sizes)([.-]|$).*?(heading|body|display|title|text|caption|label)|(^|[.-])(heading|body|display|title|caption)[.-].*size/.test(words) && /\d(px|rem|em)?$/.test(v)) {
    return fact("font-size");
  }
  if (/(space|spacing|spacer|gap|gutter|inset|padding|margin)/.test(words) && /^-?\d*\.?\d+(px|rem|em)?$/.test(v)) return fact("padding");
  if (/(container|content-width|max-width|layout-width|page-width)/.test(words) && /^\d+(px|rem)$/.test(v)) return fact("max-width");
  return null;
}

export async function analyzeDesignSystem(
  sourceUrl: string,
  config: DesignSystemConfig,
  deps: { http: CachedFetcher; config: ResearchConfig },
  options: { sourceId?: number; refresh?: boolean } = {},
): Promise<AnalysisRecord> {
  const startedAt = new Date();
  const references: ReferenceInput[] = [];
  const limitations = [
    "Design-token analysis: values come from the published token/source files of a public design system, not from a rendered product UI.",
  ];
  const facts: StyleFact[] = [];
  const mediaQueries: string[] = [];
  let bytes = 0;
  let ok = 0;
  const all: Array<{ tokens: FlatTokens; ref: string; theme: TokenFileConfig["theme"] }> = [];

  for (const file of config.files) {
    const url = `${(config.rawBaseUrl ?? "https://raw.githubusercontent.com").replace(/\/$/, "")}/${config.repo}/${config.ref}/${file.path}`;
    try {
      const res = await deps.http.get(
        url,
        {
          allowedContentTypes: ["text/plain", "application/json", "text/css", "text/x-scss", "application/javascript", "text/javascript", "text/yaml", "application/x-yaml", "application/octet-stream"],
          maxBytes: deps.config.maxTokenFileBytes,
        },
        "token_file",
        { refresh: options.refresh },
      );
      references.push(res.reference);
      bytes += res.result.bytes;
      all.push({ tokens: flattenTokenFile(file.path, res.result.body), ref: url, theme: file.theme ?? "light" });
      ok++;
    } catch (error) {
      references.push({ url, kind: "token_file", bytes: 0, fetchedAt: new Date().toISOString(), fromCache: false, note: `failed: ${(error as Error).message}`.slice(0, 300) });
      limitations.push(`Could not read ${file.path}: ${(error as Error).message}`.slice(0, 300));
    }
  }

  // References may point across files (e.g. functional → base tokens), so resolve on the union.
  const union: FlatTokens = new Map();
  for (const f of all) for (const [k, v] of f.tokens) if (!union.has(k)) union.set(k, v);
  const resolvedUnion = resolveReferences(union);
  for (const f of all) {
    for (const [path, raw] of f.tokens) {
      const value = raw.includes("{") ? (resolvedUnion.get(path) ?? raw) : raw;
      const fact = tokenToFact(path, value, f.ref, f.theme);
      if (!fact) continue;
      if (fact.property === "--breakpoint") {
        const px = /^(\d*\.?\d+)(px|rem|em)?$/.exec(value.trim());
        if (px) mediaQueries.push(`(min-width: ${px[2] && px[2] !== "px" ? Number(px[1]) * 16 : Number(px[1])}px)`);
        continue;
      }
      facts.push(fact);
    }
  }

  const finishedAt = new Date();
  const base = {
    sourceId: options.sourceId,
    url: sourceUrl,
    finalUrl: sourceUrl,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    bytesFetched: bytes,
    references,
    limitations,
    analyzerVersion: ANALYZER_VERSION,
  };
  if (ok === 0) {
    return { ...base, status: "failed", error: "No token files could be fetched.", observations: [] };
  }
  const profile = buildProfile({
    sourceKind: "design_system",
    url: sourceUrl,
    finalUrl: sourceUrl,
    facts,
    fontFaces: [],
    fontLinks: [],
    mediaQueries,
    keyframes: 0,
    limitations,
  });
  if (all.some((f) => f.theme === "dark")) profile.colors.supportsDarkMode = true;
  const classification = classifyProfile(profile);
  return {
    ...base,
    status: ok === config.files.length ? "success" : "partial",
    profile,
    classification,
    observations: profileToObservations(profile),
  };
}
