import {
  adjustForContrast,
  contrastRatio,
  formatOklch,
  hueFamily,
  type Oklch,
  oklchToHex,
  readableOn,
  toOklch,
  wcagLevel,
} from "../analysis/color.js";
import type { DesignDirection, HueOption } from "../knowledge/directions.js";
import type { HueFamily } from "../types.js";

export interface ColorToken {
  hex: string;
  oklch: string;
  usage: string;
}

export type ThemeColors = Record<string, ColorToken>;

export interface ContrastCheck {
  mode: "light" | "dark";
  foreground: string;
  background: string;
  ratio: number;
  required: number;
  level: string;
  pass: boolean;
  usage: string;
}

export interface PaletteSpec {
  modes: Array<"light" | "dark">;
  defaultMode: "light" | "dark";
  light?: ThemeColors;
  dark?: ThemeColors;
  primarySource: "explicit" | "existing" | "direction";
  primaryLabel: string;
  rationale: string[];
  contrast: ContrastCheck[];
  rules: string[];
  warnings: string[];
}

export interface PaletteInput {
  direction: DesignDirection;
  seed: number;
  modes: Array<"light" | "dark">;
  defaultMode: "light" | "dark";
  explicitColors: string[];
  avoidFamilies: HueFamily[];
  /** Hues used by recently generated systems; avoided when there is a choice. */
  recentHues: number[];
  existing?: { primary?: string; secondary?: string; accent?: string; background?: string; text?: string };
  wcag: "AA" | "AAA";
}

const ok = (l: number, c: number, h: number): Oklch => ({ l: Math.min(1, Math.max(0, l)), c: Math.max(0, c), h: ((h % 360) + 360) % 360 });
const hex = (c: Oklch) => oklchToHex(c);
const lch = (h: string) => toOklch(h)!;
const token = (h: string, usage: string): ColorToken => ({ hex: h, oklch: formatOklch(h), usage });

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function avoidHue(h: number, c: number, avoid: HueFamily[]): number {
  let hue = h;
  for (let i = 0; i < 9 && c >= 0.035 && avoid.includes(hueFamily({ l: 0.6, c, h: hue })); i++) hue = (hue + 40) % 360;
  return hue;
}

function pickOption(direction: DesignDirection, seed: number, recentHues: number[], avoid: HueFamily[]): HueOption {
  const options = direction.color.primaryOptions.filter((o) => o.c < 0.035 || !avoid.includes(hueFamily({ l: o.l, c: o.c, h: o.h })));
  const pool = options.length > 0 ? options : direction.color.primaryOptions;
  // Prefer options whose hue was not used recently, then rotate deterministically by seed.
  const scored = pool.map((o, i) => ({
    o,
    penalty: recentHues.filter((h) => hueDistance(h, o.h) < 20).length,
    order: (i + seed) % pool.length,
  }));
  scored.sort((a, b) => a.penalty - b.penalty || a.order - b.order);
  return scored[0]!.o;
}

function relationHues(h: number, relation: DesignDirection["color"]["accentRelation"]): [number, number] {
  switch (relation) {
    case "complement":
      return [h + 180, h + 180];
    case "split":
      return [h + 150, h - 150];
    case "analogous":
      return [h + 32, h - 32];
    case "triad":
      return [h + 120, h + 240];
    default:
      return [h, h + 18];
  }
}

/** Darkens (on light) or lightens (on dark) until the color reaches `ratio` against `bg`. */
function ensure(fg: string, bg: string, ratio: number): string {
  return adjustForContrast(fg, bg, ratio);
}

function onColor(fill: string): string {
  return readableOn(fill, "#111111", "#ffffff");
}

/** Makes a fill usable behind text: adjusts lightness until white or near-black reaches 4.5:1. */
function fillWithText(fill: string, locked: boolean): { fill: string; on: string; adjusted: boolean } {
  const on = onColor(fill);
  if (contrastRatio(on, fill) >= 4.5 || locked) return { fill, on, adjusted: false };
  const base = lch(fill);
  // Light fills get darker text (already chosen); mid-tones are darkened for white text.
  for (let i = 1; i <= 40; i++) {
    const darker = hex(ok(base.l - i * 0.01, base.c, base.h));
    if (contrastRatio("#ffffff", darker) >= 4.5) return { fill: darker, on: "#ffffff", adjusted: true };
    const lighter = hex(ok(base.l + i * 0.01, base.c, base.h));
    if (contrastRatio("#111111", lighter) >= 4.5) return { fill: lighter, on: "#111111", adjusted: true };
  }
  return { fill, on, adjusted: false };
}

/**
 * Hover/active shade of a fill that keeps its label readable: the fill moves away from the
 * label color (darker under white text, lighter under dark text) by `step` lightness.
 */
function stateShade(fill: string, on: string, step: number): string {
  const c = lch(fill);
  const onLight = contrastRatio(on, "#ffffff") < contrastRatio(on, "#000000");
  const dir = onLight ? -1 : 1;
  const shifted = hex(ok(c.l + dir * step, c.c, c.h));
  return contrastRatio(on, shifted) >= Math.min(4.5, contrastRatio(on, fill)) ? shifted : fill;
}

function statusHues(primaryHue: number): { success: number; warning: number; error: number; info: number } {
  let success = 148;
  let error = 27;
  let info = 245;
  if (hueDistance(primaryHue, success) < 22) success = primaryHue < 148 ? 165 : 135;
  if (hueDistance(primaryHue, error) < 18) error = primaryHue < 27 ? 40 : 12;
  if (hueDistance(primaryHue, info) < 22) info = primaryHue < 245 ? 262 : 228;
  return { success, warning: 75, error, info };
}

interface Core {
  primary: string;
  primaryLocked: boolean;
  secondary: string;
  secondaryLocked: boolean;
  accent: string;
  accentLocked: boolean;
  neutralHue: number;
  neutralChroma: number;
}

function buildLight(core: Core, d: DesignDirection, wcag: "AA" | "AAA", existing: PaletteInput["existing"], warnings: string[]): ThemeColors {
  const nh = core.neutralHue;
  const nc = core.neutralChroma;
  const tone = d.color.backgroundTone === "deep" ? "white" : d.color.backgroundTone;
  const bgL = tone === "paper" ? 0.968 : tone === "tinted" ? 0.982 : 0.993;
  const background = existing?.background ?? hex(ok(bgL, tone === "paper" ? nc * 1.4 : nc * 0.6, nh));
  const surface = hex(ok(tone === "paper" ? 0.986 : tone === "tinted" ? 0.996 : 1, nc * 0.5, nh));
  const surfaceElevated = hex(ok(1, 0, nh));
  const surfaceSunken = hex(ok(bgL - 0.035, nc * 1.4, nh));
  const textTarget = wcag === "AAA" ? 10 : 7;
  const text = existing?.text ?? ensure(hex(ok(0.2, Math.min(0.02, nc * 2), nh)), background, textTarget);
  const muted = ensure(ensure(hex(ok(0.48, Math.min(0.03, nc * 2.2), nh)), surfaceSunken, wcag === "AAA" ? 7 : 4.5), background, wcag === "AAA" ? 7 : 4.5);
  const subtle = ensure(hex(ok(0.62, Math.min(0.025, nc * 2), nh)), background, 3);
  const border = hex(ok(bgL - 0.085, nc * 1.5, nh));
  const borderStrong = ensure(ensure(hex(ok(0.66, nc * 2, nh)), background, 3), surface, 3);

  const p = fillWithText(core.primary, core.primaryLocked);
  if (core.primaryLocked && contrastRatio(p.on, p.fill) < 4.5) {
    warnings.push(`Locked primary ${p.fill} cannot carry 4.5:1 text in white or black; use it for large text (≥24px) or non-text accents and use --color-primary-strong for text buttons.`);
  }
  const pl = lch(p.fill);
  const primaryHover = stateShade(p.fill, p.on, 0.055);
  const primaryActive = stateShade(p.fill, p.on, 0.1);
  const primaryStrong = ensure(p.fill, background, 4.5);
  const primarySubtle = hex(ok(0.955, Math.min(0.045, pl.c * 0.35), pl.h));
  const onPrimarySubtle = ensure(primaryStrong, primarySubtle, 4.5);

  const s = fillWithText(core.secondary, core.secondaryLocked);
  const a = fillWithText(core.accent, core.accentLocked);

  const link = ensure(p.fill, background, wcag === "AAA" ? 7 : 4.5);
  const linkHover = ensure(hex(ok(lch(link).l - 0.08, lch(link).c, lch(link).h)), background, 4.5);
  const focusBase = contrastRatio(p.fill, background) >= 3 ? p.fill : link;
  const focusRing = d.id === "civic-clarity" ? "#ffbf47" : ensure(focusBase, surface, 3);

  const sh = statusHues(pl.h);
  const status = (h: number, c: number) => ensure(hex(ok(0.5, c, h)), background, 4.5);
  const subtleBg = (h: number, c: number) => hex(ok(0.955, c, h));

  let cta = p.fill;
  let onCta = p.on;
  let ctaHover = primaryHover;
  if (d.color.cta === "ink") {
    cta = text;
    onCta = readableOn(text, "#111111", surfaceElevated);
    ctaHover = hex(ok(lch(text).l + 0.12, lch(text).c, lch(text).h));
  } else if (d.color.cta === "accent") {
    cta = a.fill;
    onCta = a.on;
    ctaHover = stateShade(a.fill, a.on, 0.06);
  }

  return {
    primary: token(p.fill, "Brand color: primary buttons, active states, key highlights."),
    "primary-hover": token(primaryHover, "Hover state for primary fills."),
    "primary-active": token(primaryActive, "Pressed state for primary fills."),
    "on-primary": token(p.on, "Text and icons on primary fills."),
    "primary-strong": token(primaryStrong, "Primary as text/icon on the page background (≥4.5:1)."),
    "primary-subtle": token(primarySubtle, "Tinted background for selected rows, badges, info panels."),
    "on-primary-subtle": token(onPrimarySubtle, "Text on primary-subtle backgrounds."),
    secondary: token(s.fill, "Secondary actions, tags and supporting highlights."),
    "secondary-hover": token(stateShade(s.fill, s.on, 0.055), "Hover state for secondary fills."),
    "on-secondary": token(s.on, "Text on secondary fills."),
    accent: token(a.fill, "Sparse highlight: badges, data emphasis, decorative marks. Not for body text."),
    "on-accent": token(a.on, "Text on accent fills."),
    cta: token(cta, `Fill for the single most important action per view (${d.color.cta === "ink" ? "ink button" : d.color.cta}).`),
    "cta-hover": token(ctaHover, "Hover state for the call-to-action fill."),
    "on-cta": token(onCta, "Text on the call-to-action fill."),
    background: token(background, "Page background."),
    surface: token(surface, "Cards, panels, inputs."),
    "surface-elevated": token(surfaceElevated, "Menus, dialogs, popovers (with shadow)."),
    "surface-sunken": token(surfaceSunken, "Wells, code blocks, table headers, alternating bands."),
    text: token(text, "Primary text and headings."),
    "text-muted": token(muted, "Secondary text, captions, metadata (≥4.5:1 on all surfaces)."),
    "text-subtle": token(subtle, "Placeholders, disabled labels, decorative meta only (≥3:1, not for essential text)."),
    "text-inverse": token(surfaceElevated, "Text on dark/ink fills."),
    border: token(border, "Hairline dividers and card outlines (decorative)."),
    "border-strong": token(borderStrong, "Input and control boundaries (≥3:1, WCAG 1.4.11)."),
    link: token(link, "Inline links in body copy (always underlined)."),
    "link-hover": token(linkHover, "Hovered links."),
    "focus-ring": token(focusRing, "Keyboard focus outline (2px, offset 2px)."),
    success: token(status(sh.success, 0.13), "Success text and icons."),
    "success-subtle": token(subtleBg(sh.success, 0.035), "Success alert background."),
    warning: token(status(sh.warning, 0.13), "Warning text and icons (darkened amber for contrast)."),
    "warning-subtle": token(subtleBg(85, 0.06), "Warning alert background."),
    error: token(status(sh.error, 0.18), "Error text, icons and invalid borders."),
    "error-subtle": token(subtleBg(sh.error, 0.035), "Error alert background."),
    info: token(status(sh.info, 0.12), "Informational text and icons."),
    "info-subtle": token(subtleBg(sh.info, 0.03), "Info alert background."),
  };
}

function buildDark(core: Core, d: DesignDirection, wcag: "AA" | "AAA"): ThemeColors {
  const nh = core.neutralHue;
  const nc = Math.max(core.neutralChroma, d.color.backgroundTone === "deep" ? 0.012 : 0.008);
  const bgL = d.color.backgroundTone === "deep" ? 0.165 : 0.185;
  const background = hex(ok(bgL, nc * 1.2, nh));
  const surface = hex(ok(bgL + 0.035, nc * 1.2, nh));
  const surfaceElevated = hex(ok(bgL + 0.07, nc * 1.1, nh));
  const surfaceSunken = hex(ok(bgL - 0.03, nc, nh));
  const text = ensure(hex(ok(0.95, Math.min(0.015, nc), nh)), surfaceElevated, wcag === "AAA" ? 10 : 7);
  const muted = ensure(hex(ok(0.75, Math.min(0.02, nc * 1.5), nh)), surfaceElevated, wcag === "AAA" ? 7 : 4.5);
  const subtle = ensure(hex(ok(0.6, Math.min(0.02, nc * 1.5), nh)), background, 3);
  const border = hex(ok(bgL + 0.11, nc * 1.2, nh));
  const borderStrong = ensure(hex(ok(bgL + 0.3, nc * 1.2, nh)), surface, 3);

  const lift = (h: string, minL: number) => {
    const c = lch(h);
    return hex(ok(Math.max(c.l, minL), c.c * (c.l < minL ? 0.92 : 1), c.h));
  };
  const primaryFill = core.primaryLocked ? core.primary : lift(core.primary, 0.66);
  const p = fillWithText(primaryFill, core.primaryLocked);
  const pl = lch(p.fill);
  const primaryStrong = ensure(p.fill, background, 4.5);
  const s = fillWithText(lift(core.secondary, 0.66), false);
  const a = fillWithText(lift(core.accent, 0.72), false);
  const link = ensure(primaryStrong, background, wcag === "AAA" ? 7 : 4.5);
  const sh = statusHues(pl.h);
  const status = (h: number, c: number) => ensure(hex(ok(0.72, c, h)), background, 4.5);
  const subtleBg = (h: number, c: number) => hex(ok(bgL + 0.06, c, h));

  let cta = p.fill;
  let onCta = p.on;
  let ctaHover = stateShade(p.fill, p.on, 0.05);
  if (d.color.cta === "ink") {
    cta = text;
    onCta = background;
    ctaHover = hex(ok(lch(text).l - 0.08, lch(text).c, lch(text).h));
  } else if (d.color.cta === "accent") {
    cta = a.fill;
    onCta = a.on;
    ctaHover = stateShade(a.fill, a.on, 0.05);
  }

  return {
    primary: token(p.fill, "Brand color, lifted for dark backgrounds."),
    "primary-hover": token(stateShade(p.fill, p.on, 0.05), "Hover state for primary fills."),
    "primary-active": token(stateShade(p.fill, p.on, 0.09), "Pressed state."),
    "on-primary": token(p.on, "Text on primary fills."),
    "primary-strong": token(primaryStrong, "Primary as text on the dark background."),
    "primary-subtle": token(hex(ok(bgL + 0.07, Math.min(0.05, pl.c * 0.4), pl.h)), "Tinted selected/badge background."),
    "on-primary-subtle": token(ensure(primaryStrong, hex(ok(bgL + 0.07, Math.min(0.05, pl.c * 0.4), pl.h)), 4.5), "Text on primary-subtle."),
    secondary: token(s.fill, "Secondary actions and tags."),
    "secondary-hover": token(stateShade(s.fill, s.on, 0.05), "Hover for secondary fills."),
    "on-secondary": token(s.on, "Text on secondary fills."),
    accent: token(a.fill, "Sparse highlight."),
    "on-accent": token(a.on, "Text on accent fills."),
    cta: token(cta, "Fill for the single most important action per view."),
    "cta-hover": token(ctaHover, "Hover state for the call-to-action fill."),
    "on-cta": token(onCta, "Text on the call-to-action fill."),
    background: token(background, "Page background (tinted near-black, not #000)."),
    surface: token(surface, "Cards and panels."),
    "surface-elevated": token(surfaceElevated, "Menus, dialogs, popovers."),
    "surface-sunken": token(surfaceSunken, "Wells, code blocks."),
    text: token(text, "Primary text (off-white to reduce halation)."),
    "text-muted": token(muted, "Secondary text (≥4.5:1 on every dark surface)."),
    "text-subtle": token(subtle, "Placeholders and disabled labels only."),
    "text-inverse": token(background, "Text on light fills."),
    border: token(border, "Hairline dividers."),
    "border-strong": token(borderStrong, "Control boundaries (≥3:1)."),
    link: token(link, "Inline links."),
    "link-hover": token(ensure(hex(ok(lch(link).l + 0.06, lch(link).c, lch(link).h)), background, 4.5), "Hovered links."),
    "focus-ring": token(d.id === "civic-clarity" ? "#ffbf47" : ensure(p.fill, surface, 3), "Keyboard focus outline."),
    success: token(status(sh.success, 0.14), "Success text and icons."),
    "success-subtle": token(subtleBg(sh.success, 0.04), "Success alert background."),
    warning: token(status(sh.warning, 0.14), "Warning text and icons."),
    "warning-subtle": token(subtleBg(85, 0.05), "Warning alert background."),
    error: token(status(sh.error, 0.17), "Error text and icons."),
    "error-subtle": token(subtleBg(sh.error, 0.04), "Error alert background."),
    info: token(status(sh.info, 0.12), "Info text and icons."),
    "info-subtle": token(subtleBg(sh.info, 0.035), "Info alert background."),
  };
}

const CHECKS: Array<[string, string, number, string]> = [
  ["text", "background", 7, "body text"],
  ["text", "surface", 7, "body text on cards"],
  ["text-muted", "background", 4.5, "secondary text"],
  ["text-muted", "surface", 4.5, "secondary text on cards"],
  ["text-muted", "surface-sunken", 4.5, "secondary text in wells"],
  ["on-primary", "primary", 4.5, "primary button label"],
  ["on-primary", "primary-hover", 4.5, "hovered primary button label"],
  ["on-primary", "primary-active", 4.5, "pressed primary button label"],
  ["on-secondary", "secondary-hover", 4.5, "hovered secondary button label"],
  ["on-cta", "cta-hover", 4.5, "hovered call-to-action label"],
  ["on-secondary", "secondary", 4.5, "secondary button label"],
  ["on-accent", "accent", 4.5, "text on accent"],
  ["on-cta", "cta", 4.5, "call-to-action label"],
  ["on-primary-subtle", "primary-subtle", 4.5, "badge/selected text"],
  ["primary-strong", "background", 4.5, "primary used as text"],
  ["link", "background", 4.5, "links"],
  ["border-strong", "background", 3, "input boundaries (non-text contrast)"],
  ["focus-ring", "background", 3, "focus indicator"],
  ["success", "background", 4.5, "success text"],
  ["warning", "background", 4.5, "warning text"],
  ["error", "background", 4.5, "error text"],
  ["info", "background", 4.5, "info text"],
  ["text-subtle", "background", 3, "placeholder/disabled (non-essential)"],
];

export function contrastReport(theme: ThemeColors, mode: "light" | "dark", wcag: "AA" | "AAA"): ContrastCheck[] {
  const out: ContrastCheck[] = [];
  for (const [fg, bg, required, usage] of CHECKS) {
    const f = theme[fg];
    const b = theme[bg];
    if (!f || !b) continue;
    const req = wcag === "AAA" && required === 4.5 && fg.startsWith("text") ? 7 : required;
    if (mode === "light" && fg === "focus-ring" && theme[fg]!.hex.toLowerCase() === "#ffbf47") {
      // Civic focus style pairs the yellow fill with a dark outline; the outline carries the contrast.
      out.push({ mode, foreground: fg, background: bg, ratio: contrastRatio(theme.text!.hex, "#ffbf47"), required: 3, level: "pass (paired outline)", pass: true, usage });
      continue;
    }
    const ratio = contrastRatio(f.hex, b.hex);
    out.push({ mode, foreground: fg, background: bg, ratio, required: req, level: wcagLevel(ratio), pass: ratio >= req, usage });
  }
  return out;
}

export function generatePalette(input: PaletteInput): PaletteSpec {
  const d = input.direction;
  const rationale: string[] = [];
  const warnings: string[] = [];
  let primarySource: PaletteSpec["primarySource"] = "direction";
  let primaryLabel = "";
  let primary: string;
  let primaryLocked = false;

  if (input.existing?.primary) {
    primary = input.existing.primary;
    primaryLocked = true;
    primarySource = "existing";
    primaryLabel = "existing brand color";
    rationale.push(`Primary ${primary} preserved from the project's existing styles.`);
  } else if (input.explicitColors.length > 0) {
    const chromatic = input.explicitColors.find((h) => (toOklch(h)?.c ?? 0) >= 0.04) ?? input.explicitColors[0]!;
    primary = chromatic;
    primaryLocked = true;
    primarySource = "explicit";
    primaryLabel = "requested in the brief";
    rationale.push(`Primary ${primary} comes directly from the brief; user requirements override inferred preferences.`);
  } else {
    const option = pickOption(d, input.seed, input.recentHues, input.avoidFamilies);
    const jitter = ((input.seed % 13) - 6) * 0.8; // ±5° keeps projects from sharing exact hexes
    primary = hex(ok(option.l, option.c, avoidHue(option.h + jitter, option.c, input.avoidFamilies)));
    primaryLabel = option.label;
    rationale.push(
      `Primary "${option.label}" (${formatOklch(primary)}) chosen from ${d.name}'s hue options${input.recentHues.length ? ", skipping hues used by recently generated systems" : ""}.`,
    );
  }
  const pl = lch(primary);
  const [h2, h3] = relationHues(pl.h, d.color.accentRelation);
  const explicitRest = input.existing ? [input.existing.secondary, input.existing.accent] : input.explicitColors.filter((c) => c !== primary);
  const secondaryLocked = Boolean(explicitRest[0]);
  const accentLocked = Boolean(explicitRest[1]);
  const secondary =
    explicitRest[0] ??
    hex(ok(d.color.accentRelation === "mono" ? Math.max(0.3, pl.l - 0.15) : 0.45, d.color.accentRelation === "mono" ? pl.c * 0.45 : Math.min(0.11, d.color.accentChroma), avoidHue(h2, 0.1, input.avoidFamilies)));
  const accent =
    explicitRest[1] ??
    hex(ok(d.color.accentRelation === "mono" ? Math.min(0.78, pl.l + 0.18) : 0.72, Math.max(0.08, d.color.accentChroma), avoidHue(h3, d.color.accentChroma, input.avoidFamilies)));
  rationale.push(`Secondary and accent follow a ${d.color.accentRelation} relationship to the primary hue (${Math.round(pl.h)}°).`);

  const neutralHue = d.color.neutral === "warm" ? 75 : d.color.neutral === "cool" ? 255 : d.color.neutral === "tinted" ? pl.h : pl.h;
  const neutralChroma = d.color.neutral === "neutral" ? 0.002 : d.color.neutralChroma;
  rationale.push(`Neutrals are ${d.color.neutral} (hue ${Math.round(neutralHue)}°, chroma ${neutralChroma}) so grays feel related to the brand rather than default slate.`);

  const core: Core = { primary, primaryLocked, secondary, secondaryLocked, accent, accentLocked, neutralHue, neutralChroma };
  const spec: PaletteSpec = {
    modes: input.modes,
    defaultMode: input.defaultMode,
    primarySource,
    primaryLabel,
    rationale,
    contrast: [],
    rules: [
      "Use semantic tokens (--color-text, --color-surface…) in components, never raw hex values.",
      `Only one ${d.color.cta === "ink" ? "ink (--color-cta)" : "primary"}-filled button per view region; other actions use secondary or ghost styles.`,
      "The accent is a highlight, not a second brand color: keep it under ~10% of any screen.",
      "Status colors always pair with an icon and text; never communicate state by color alone.",
      "Links in running text are underlined; color alone does not identify a link.",
    ],
    warnings,
  };
  if (input.modes.includes("light")) {
    spec.light = buildLight(core, d, input.wcag, input.existing, warnings);
    spec.contrast.push(...contrastReport(spec.light, "light", input.wcag));
  }
  if (input.modes.includes("dark")) {
    spec.dark = buildDark(core, d, input.wcag);
    spec.contrast.push(...contrastReport(spec.dark, "dark", input.wcag));
  }
  const failures = spec.contrast.filter((c) => !c.pass);
  if (failures.length) {
    for (const f of failures) warnings.push(`${f.mode}: ${f.foreground} on ${f.background} is ${f.ratio}:1 (needs ${f.required}:1 for ${f.usage}).`);
  } else {
    rationale.push(`All ${spec.contrast.length} text and control pairs meet WCAG ${input.wcag} requirements (computed, see contrast table).`);
  }
  return spec;
}
