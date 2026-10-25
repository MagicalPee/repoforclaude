import { contrastRatio, deltaE, toHex, wcagLevel } from "../analysis/color.js";
import { rangePx } from "../analysis/profileBuilder.js";

export type Severity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: Severity;
  category: "contrast" | "consistency" | "typography" | "duplicates" | "missing" | "components" | "spacing" | "radius";
  message: string;
  tokens?: string[];
  recommendation: string;
}

export interface ValidationResult {
  score: number;
  summary: string;
  issues: ValidationIssue[];
  contrast: Array<{ mode: string; pair: string; ratio: number; required: number; level: string; pass: boolean }>;
  normalized: { colors: Record<string, Record<string, string>>; fontSizes: Record<string, number>; spacing: Record<string, number>; radii: Record<string, number> };
  recommendations: string[];
}

type Flat = Map<string, string>;

function flatten(value: unknown, path: string[], out: Flat): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string" || typeof value === "number") {
    out.set(path.join("."), String(value));
    return;
  }
  if (typeof value !== "object" || Array.isArray(value)) return;
  const obj = value as Record<string, unknown>;
  if ("$value" in obj) return flatten(obj.$value, path, out);
  if ("hex" in obj && typeof obj.hex === "string") return flatten(obj.hex, path, out);
  if ("value" in obj && (typeof obj.value === "string" || typeof obj.value === "number")) return flatten(obj.value, path, out);
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("$")) continue;
    flatten(v, [...path, k], out);
  }
}

/** Canonical semantic role for a token name, or null. */
function colorRole(name: string): string | null {
  const n = name.toLowerCase().replace(/^--/, "").replace(/^colou?rs?[-._]/, "").replace(/[._]/g, "-");
  const table: Array<[RegExp, string]> = [
    [/^(on-primary|primary-foreground|primary-contrast|text-on-primary)$/, "on-primary"],
    [/^(on-secondary|secondary-foreground)$/, "on-secondary"],
    [/^(on-accent|accent-foreground)$/, "on-accent"],
    [/^(on-cta|cta-foreground)$/, "on-cta"],
    [/^(primary-hover|primary-hovered)$/, "primary-hover"],
    [/^(primary-active|primary-pressed)$/, "primary-active"],
    [/^(primary|brand|brand-primary)$/, "primary"],
    [/^(secondary|brand-secondary)$/, "secondary"],
    [/^(accent|highlight)$/, "accent"],
    [/^cta$/, "cta"],
    [/^(background|bg|page|canvas|bg-default|background-default)$/, "background"],
    [/^(surface|card|panel|bg-surface)$/, "surface"],
    [/^(surface-elevated|popover|elevated)$/, "surface-elevated"],
    [/^(text|foreground|fg|text-primary|text-default|body|ink)$/, "text"],
    [/^(text-muted|muted-foreground|text-secondary|fg-muted|muted)$/, "text-muted"],
    [/^(border|divider|border-default)$/, "border"],
    [/^(border-strong|input|input-border|border-input|control-border)$/, "border-strong"],
    [/^(link|text-link)$/, "link"],
    [/^(focus|focus-ring|ring|outline)$/, "focus-ring"],
    [/^(success|positive)$/, "success"],
    [/^(warning|caution|attention)$/, "warning"],
    [/^(error|danger|destructive|critical|negative)$/, "error"],
    [/^(info|informative)$/, "info"],
  ];
  for (const [re, role] of table) if (re.test(n)) return role;
  return null;
}

interface Normalized {
  light: Map<string, string>;
  dark: Map<string, string>;
  all: Map<string, string>;
  fontSizes: Map<string, number>;
  lineHeights: Map<string, number>;
  spacing: Map<string, number>;
  radii: Map<string, number>;
}

function normalize(tokens: unknown): Normalized {
  const flat: Flat = new Map();
  if (typeof tokens === "string") {
    // CSS custom properties pasted as text.
    for (const m of tokens.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) flat.set(m[1]!, m[2]!.trim());
  } else {
    flatten(tokens, [], flat);
  }
  const n: Normalized = { light: new Map(), dark: new Map(), all: new Map(), fontSizes: new Map(), lineHeights: new Map(), spacing: new Map(), radii: new Map() };
  for (const [path, raw] of flat) {
    const segs = path.split(".");
    const leaf = segs[segs.length - 1]!;
    const lowerPath = path.toLowerCase();
    const isDark = /(^|\.)(dark|night)(\.|$)/.test(lowerPath);
    const hex = /^(#|rgb|hsl|oklch|oklab)/i.test(raw.trim()) ? toHex(raw.trim()) : null;
    if (hex) {
      const name = segs.filter((s) => !/^(color|colors|light|dark|palette|semantic|tokens?)$/i.test(s)).join("-") || leaf;
      const role = colorRole(name) ?? colorRole(leaf);
      const key = role ?? name;
      (isDark ? n.dark : n.light).set(key, hex);
      n.all.set(`${isDark ? "dark:" : ""}${key}`, hex);
      continue;
    }
    const sizeMatch = /(^|[.-])(text|font-?size|size|fontsize|typography|styles)([.-]|$)/i.test(path) || /^(h[1-6]|body|display|small|caption|lead)$/i.test(leaf);
    if (/line-?height|leading/i.test(path)) {
      const v = Number.parseFloat(raw);
      if (Number.isFinite(v)) n.lineHeights.set(path, v);
      continue;
    }
    const range = rangePx(raw);
    if (!range) continue;
    if (/radius|rounded|corner/i.test(path)) n.radii.set(leaf, range.max);
    else if (/space|spacing|gap|padding|margin|inset/i.test(path)) n.spacing.set(leaf, range.max);
    else if (sizeMatch && !/weight|tracking|letter/i.test(path)) {
      const heading = /(^|[^a-z0-9])(h[1-6]|display|body|small|caption|lead)([^a-z0-9]|$)/i.exec(path)?.[2]?.toLowerCase();
      n.fontSizes.set(heading ?? leaf, range.max);
    }
  }
  return n;
}

const REQUIRED_COLORS = ["primary", "primary-hover", "on-primary", "background", "surface", "text", "text-muted", "border", "focus-ring", "success", "warning", "error"];

export function validateDesignSystem(tokens: unknown, components?: Record<string, unknown>): ValidationResult {
  const n = normalize(tokens);
  const issues: ValidationIssue[] = [];
  const contrast: ValidationResult["contrast"] = [];

  const checkPairs = (mode: string, map: Map<string, string>) => {
    if (map.size === 0) return;
    const pairs: Array<[string, string, number, string]> = [
      ["text", "background", 4.5, "body text"],
      ["text", "surface", 4.5, "text on cards"],
      ["text-muted", "background", 4.5, "secondary text"],
      ["text-muted", "surface", 4.5, "secondary text on cards"],
      ["on-primary", "primary", 4.5, "primary button label"],
      ["on-primary", "primary-hover", 4.5, "hovered primary button label"],
      ["on-secondary", "secondary", 4.5, "secondary button label"],
      ["on-accent", "accent", 4.5, "accent label"],
      ["on-cta", "cta", 4.5, "call-to-action label"],
      ["link", "background", 4.5, "links"],
      ["border-strong", "background", 3, "input boundaries"],
      ["focus-ring", "background", 3, "focus indicator"],
      ["error", "background", 4.5, "error text"],
      ["success", "background", 4.5, "success text"],
      ["warning", "background", 4.5, "warning text"],
    ];
    for (const [fg, bg, req, usage] of pairs) {
      const f = map.get(fg);
      const b = map.get(bg);
      if (!f || !b) continue;
      const ratio = contrastRatio(f, b);
      const pass = ratio >= req;
      contrast.push({ mode, pair: `${fg} on ${bg}`, ratio, required: req, level: wcagLevel(ratio), pass });
      if (!pass) {
        issues.push({
          severity: req >= 4.5 && (fg === "text" || fg.startsWith("on-") || fg === "link") ? "error" : "warning",
          category: "contrast",
          message: `${mode}: ${fg} (${f}) on ${bg} (${b}) is ${ratio}:1; ${usage} needs ${req}:1 (WCAG 2.2 AA).`,
          tokens: [fg, bg],
          recommendation: `Adjust the lightness of ${fg} until it reaches ${req}:1 against ${bg} (keep hue and chroma).`,
        });
      }
    }
    const textOnBg = map.get("text") && map.get("background") ? contrastRatio(map.get("text")!, map.get("background")!) : undefined;
    if (textOnBg !== undefined && textOnBg >= 4.5 && textOnBg < 7) {
      issues.push({ severity: "info", category: "contrast", message: `${mode}: body text contrast is ${textOnBg}:1 (AA, not AAA).`, tokens: ["text", "background"], recommendation: "Consider ≥7:1 for long-form reading." });
    }
  };
  checkPairs("light", n.light);
  checkPairs("dark", n.dark);

  // Missing semantic roles.
  const present = new Set([...n.light.keys(), ...n.dark.keys()]);
  if (present.size > 0) {
    const missing = REQUIRED_COLORS.filter((r) => !present.has(r));
    for (const r of missing) {
      issues.push({
        severity: ["text", "background", "primary", "focus-ring"].includes(r) ? "warning" : "info",
        category: "missing",
        message: `No token for the "${r}" role.`,
        tokens: [r],
        recommendation:
          r === "focus-ring"
            ? "Add a focus color with ≥3:1 contrast against the background; never rely on browser defaults being removed."
            : r.endsWith("hover")
              ? "Define hover/active variants (±5–10% lightness) so states are consistent across components."
              : `Add a semantic token for ${r} instead of reusing raw palette values.`,
      });
    }
    if (n.dark.size > 0 && n.light.size > 0) {
      for (const k of n.light.keys()) {
        if (REQUIRED_COLORS.includes(k) && !n.dark.has(k)) {
          issues.push({ severity: "info", category: "missing", message: `Dark theme has no "${k}" override.`, tokens: [k], recommendation: "Every semantic color needs a value in each supported theme." });
        }
      }
    }
  }

  // Duplicates and near-duplicates among distinct roles.
  for (const [mode, map] of [["light", n.light], ["dark", n.dark]] as const) {
    const brandish = ["primary", "secondary", "accent", "success", "warning", "error", "info", "link"].filter((k) => map.has(k));
    for (let i = 0; i < brandish.length; i++) {
      for (let j = i + 1; j < brandish.length; j++) {
        const a = brandish[i]!;
        const b = brandish[j]!;
        if ((a === "primary" && b === "link") || (a === "link" && b === "primary")) continue;
        const d = deltaE(map.get(a)!, map.get(b)!);
        if (d < 0.03) {
          issues.push({
            severity: ["success", "warning", "error", "info"].some((s) => a === s || b === s) ? "warning" : "info",
            category: "duplicates",
            message: `${mode}: ${a} and ${b} are ${d === 0 ? "identical" : "nearly identical"} (${map.get(a)} / ${map.get(b)}).`,
            tokens: [a, b],
            recommendation: "Either merge the roles or separate them by hue or lightness so users can tell them apart.",
          });
        }
      }
    }
  }

  // Typography hierarchy.
  const sizes = n.fontSizes;
  const order = ["h1", "h2", "h3", "h4", "h5", "h6"].filter((h) => sizes.has(h));
  for (let i = 0; i + 1 < order.length; i++) {
    const a = sizes.get(order[i]!)!;
    const b = sizes.get(order[i + 1]!)!;
    if (a < b) {
      issues.push({ severity: "error", category: "typography", message: `${order[i]} (${a}px) is smaller than ${order[i + 1]} (${b}px).`, tokens: [order[i]!, order[i + 1]!], recommendation: "Heading sizes must decrease monotonically from h1 to h6." });
    } else if (a === b && i < 3) {
      issues.push({ severity: "warning", category: "typography", message: `${order[i]} and ${order[i + 1]} share ${a}px.`, tokens: [order[i]!, order[i + 1]!], recommendation: "Differentiate adjacent heading levels by size (≥1.125×) or weight." });
    }
  }
  const body = sizes.get("body") ?? sizes.get("base") ?? sizes.get("md");
  if (body !== undefined && body < 14) {
    issues.push({ severity: "error", category: "typography", message: `Body text is ${body}px.`, tokens: ["body"], recommendation: "Use at least 16px for body text (14px only for dense UI secondary text)." });
  }
  if (order.length >= 3) {
    const ratios = order.slice(0, -1).map((h, i) => sizes.get(h)! / sizes.get(order[i + 1]!)!).filter((r) => r > 1);
    if (ratios.length >= 2) {
      const mean = ratios.reduce((s, r) => s + r, 0) / ratios.length;
      const cv = Math.sqrt(ratios.reduce((s, r) => s + (r - mean) ** 2, 0) / ratios.length) / mean;
      if (cv > 0.12) {
        issues.push({ severity: "info", category: "typography", message: `Heading steps vary irregularly (ratios ${ratios.map((r) => r.toFixed(2)).join(", ")}).`, recommendation: "Derive sizes from one modular ratio (e.g. 1.2–1.333) for a coherent rhythm." });
      }
    }
  }
  for (const [path, lh] of n.lineHeights) {
    if (/body|paragraph|base/i.test(path) && (lh < 1.35 || lh > 1.9) && lh < 4) {
      issues.push({ severity: "warning", category: "typography", message: `Body line-height ${lh} at ${path}.`, recommendation: "Keep body line-height between 1.4 and 1.75." });
    }
  }

  // Spacing consistency.
  const spaceValues = [...n.spacing.values()].filter((v) => v > 0);
  const offGrid = [...n.spacing.entries()].filter(([, v]) => v > 8 && v % 4 !== 0);
  if (offGrid.length > 0) {
    issues.push({ severity: "warning", category: "spacing", message: `${offGrid.length} spacing value(s) are off the 4px grid: ${offGrid.slice(0, 5).map(([k, v]) => `${k}=${v}px`).join(", ")}.`, recommendation: "Snap spacing to multiples of 4px (2px allowed below 8px)." });
  }
  if (new Set(spaceValues).size > 24) {
    issues.push({ severity: "info", category: "spacing", message: `${new Set(spaceValues).size} distinct spacing values.`, recommendation: "Reduce to a scale of ~12–17 steps." });
  }

  // Radius monotonicity.
  const rOrder = ["xs", "sm", "md", "lg", "xl"].filter((k) => n.radii.has(k));
  for (let i = 0; i + 1 < rOrder.length; i++) {
    if (n.radii.get(rOrder[i]!)! > n.radii.get(rOrder[i + 1]!)!) {
      issues.push({ severity: "warning", category: "radius", message: `radius-${rOrder[i]} is larger than radius-${rOrder[i + 1]}.`, recommendation: "Radius scale should increase from xs to xl." });
    }
  }

  // Component states.
  if (components && typeof components === "object") {
    for (const [name, spec] of Object.entries(components)) {
      const interactive = /button|input|select|checkbox|radio|switch|link|tab|toggle|dropdown|menu/i.test(name);
      if (!interactive || !spec || typeof spec !== "object") continue;
      const states = new Set(Object.keys((spec as { states?: Record<string, unknown> }).states ?? spec).map((s) => s.toLowerCase()));
      // Text fields have no meaningful pressed state; everything else that is clickable does.
      const want = /input|select|textarea|field/i.test(name) ? ["hover", "focus-visible", "disabled"] : ["hover", "focus-visible", "active", "disabled"];
      const missing = want.filter((s) => !states.has(s) && !(s === "focus-visible" && states.has("focus")));
      if (missing.length) {
        issues.push({ severity: missing.includes("focus-visible") ? "error" : "warning", category: "components", message: `${name} lacks ${missing.join(", ")} state(s).`, tokens: [name], recommendation: "Define hover, active, focus-visible and disabled for every interactive component." });
      }
    }
  }

  if (n.light.size === 0 && n.dark.size === 0 && n.fontSizes.size === 0 && n.spacing.size === 0) {
    issues.push({ severity: "warning", category: "missing", message: "No recognisable tokens were found in the input.", recommendation: "Pass tokens as JSON (DTCG, nested objects or a flat map of CSS variable names) or as CSS custom properties text." });
  }

  const penalty = issues.reduce((s, i) => s + (i.severity === "error" ? 10 : i.severity === "warning" ? 4 : 1), 0);
  const score = Math.max(0, 100 - penalty);
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  return {
    score,
    summary: `${errors} error(s), ${warnings} warning(s), ${issues.length - errors - warnings} note(s); ${contrast.filter((c) => c.pass).length}/${contrast.length} contrast checks pass.`,
    issues,
    contrast,
    normalized: {
      colors: { light: Object.fromEntries(n.light), dark: Object.fromEntries(n.dark) },
      fontSizes: Object.fromEntries(n.fontSizes),
      spacing: Object.fromEntries(n.spacing),
      radii: Object.fromEntries(n.radii),
    },
    recommendations: [...new Set(issues.filter((i) => i.severity !== "info").map((i) => i.recommendation))].slice(0, 12),
  };
}
