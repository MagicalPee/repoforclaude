import { classifyFont, type FontInfo, fontsourcePackage, googleFontsCssUrl, lookupFont, nextFontImportName, recommendableFonts } from "../knowledge/fonts.js";
import type { DesignDirection } from "../knowledge/directions.js";
import type { FontClass } from "../types.js";
import type { Traits } from "./inference.js";

export interface FontChoice {
  family: string;
  role: "heading" | "body" | "mono";
  classification: FontClass;
  source: "google-fonts" | "system" | "existing" | "user-requested";
  license: string;
  variable: boolean;
  weights: number[];
  stack: string;
  googleFontsFamily?: string;
  fontsourcePackage?: string;
  nextFontImport?: string;
  reason: string;
}

export interface TypeStep {
  token: string;
  px: number;
  rem: string;
  fluid?: string;
  lineHeight: number;
  letterSpacing: string;
}

export interface TextStyle {
  step: string;
  size: string;
  fontFamily: "heading" | "body" | "mono";
  weight: number;
  lineHeight: number;
  letterSpacing: string;
  textTransform?: "uppercase";
  usage: string;
}

export interface TypographySpec {
  heading: FontChoice;
  body: FontChoice;
  mono: FontChoice;
  monoUse: "required" | "accent" | "optional";
  scale: { ratio: number; basePx: number; steps: TypeStep[] };
  styles: Record<string, TextStyle>;
  weights: { regular: number; medium: number; semibold: number; bold: number; heading: number };
  sourcing: { googleFontsUrl?: string; preconnect: string[]; fontDisplay: "swap"; notes: string[] };
  rules: string[];
  rationale: string[];
}

export interface TypographyInput {
  direction: DesignDirection;
  traits: Traits;
  seed: number;
  styleKeywords: string[];
  explicitFonts: string[];
  existingFonts?: { heading?: string; body?: string; mono?: string };
  recentFonts: string[];
  systemFontsOnly: boolean;
  density: "compact" | "comfortable" | "airy";
  audience: string[];
  websiteType: string;
}

const SANS_FALLBACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF_FALLBACK = 'ui-serif, Georgia, Cambria, "Times New Roman", serif';
const MONO_FALLBACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const CONDENSED_FALLBACK = '"Arial Narrow", "Helvetica Neue Condensed", Impact, sans-serif';

const SERIFS: FontClass[] = ["transitional-serif", "old-style-serif", "didone", "slab-serif", "display-serif"];

function fallbackFor(cls: FontClass): string {
  if (cls === "monospace") return MONO_FALLBACK;
  if (SERIFS.includes(cls)) return SERIF_FALLBACK;
  if (cls === "condensed-sans") return CONDENSED_FALLBACK;
  return SANS_FALLBACK;
}

function quote(family: string): string {
  return /^[a-z-]+$/i.test(family) && !family.includes(" ") ? family : `"${family}"`;
}

function rnd(seed: number, salt: string): number {
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 0x85ebca6b);
  return ((h >>> 0) % 1000) / 1000;
}

function weightsFor(info: FontInfo | undefined, wanted: number[]): number[] {
  if (!info?.weights) return [...new Set(wanted)];
  const [lo, hi] = info.weights;
  const out = wanted.map((w) => Math.min(hi, Math.max(lo, w)));
  return [...new Set(out)].sort((a, b) => a - b);
}

function choice(info: FontInfo, role: FontChoice["role"], weights: number[], source: FontChoice["source"], reason: string): FontChoice {
  const usable = weightsFor(info, weights);
  return {
    family: info.family,
    role,
    classification: info.class,
    source,
    license: info.recommendable ? "SIL Open Font License 1.1 (free for commercial use; self-hosting allowed)" : "Not verified by this server; confirm you hold a license before use.",
    variable: Boolean(info.variable),
    weights: usable,
    stack: `${quote(info.family)}, ${fallbackFor(info.class)}`,
    googleFontsFamily: info.recommendable ? info.family : undefined,
    fontsourcePackage: info.recommendable ? fontsourcePackage(info) : undefined,
    nextFontImport: info.recommendable ? nextFontImportName(info.family) : undefined,
    reason,
  };
}

function external(family: string, role: FontChoice["role"], source: FontChoice["source"], reason: string): FontChoice {
  const info = lookupFont(family);
  if (info) return choice(info, role, role === "heading" ? [600, 700] : [400, 500, 600], source, reason);
  const cls = classifyFont(family, null);
  return {
    family,
    role,
    classification: cls,
    source,
    license: "Unknown to this server: verify the license and hosting rights before shipping.",
    variable: false,
    weights: role === "heading" ? [600, 700] : [400, 500, 600],
    stack: `${quote(family)}, ${fallbackFor(cls)}`,
    reason,
  };
}

function systemChoice(role: FontChoice["role"]): FontChoice {
  const stack = role === "mono" ? MONO_FALLBACK : SANS_FALLBACK;
  return {
    family: role === "mono" ? "ui-monospace" : "system-ui",
    role,
    classification: role === "mono" ? "monospace" : "system",
    source: "system",
    license: "Operating-system fonts; nothing to license or load.",
    variable: true,
    weights: role === "heading" ? [600, 700] : [400, 500, 600],
    stack,
    reason: "System fonts requested: zero font loading and native rendering on every platform.",
  };
}

function scoreFont(
  font: FontInfo,
  role: "heading" | "body" | "mono",
  classes: FontClass[],
  traits: string[],
  input: TypographyInput,
): number {
  if (role === "mono") {
    if (font.class !== "monospace" || !font.roles.includes("mono")) return -Infinity;
  } else {
    const roleOk = role === "heading" ? font.roles.some((r) => r === "heading" || r === "display") : font.roles.some((r) => r === "body" || r === "ui");
    if (!roleOk) return -Infinity;
  }
  let score = 0;
  const idx = classes.indexOf(font.class);
  if (role !== "mono") {
    if (idx < 0) return -Infinity;
    score += 3 - idx * 0.6;
  }
  const wanted = new Set([...traits, ...input.styleKeywords]);
  for (const t of font.traits) if (wanted.has(t)) score += 0.6;
  if (font.overused) score -= 1.1;
  if (input.recentFonts.some((f) => f.toLowerCase() === font.family.toLowerCase())) score -= 0.9;
  if (role === "heading") {
    const [lo, hi] = font.weights ?? [400, 400];
    if (input.direction.type.headingWeight > hi + 100 || input.direction.type.headingWeight < lo - 100) score -= 1.5;
  }
  if (role === "body" && font.variable) score += 0.2;
  if (input.audience.includes("older adults") || input.audience.includes("kids and families")) {
    if (font.traits.includes("legible") || font.traits.includes("accessible")) score += 0.6;
  }
  return score + rnd(input.seed, `${role}:${font.family}`) * 0.7;
}

function best(role: "heading" | "body" | "mono", classes: FontClass[], traits: string[], input: TypographyInput, exclude: string[] = []): FontInfo {
  const ranked = recommendableFonts()
    .filter((f) => !exclude.includes(f.family))
    .map((f) => ({ f, s: scoreFont(f, role, classes, traits, input) }))
    .filter((x) => Number.isFinite(x.s))
    .sort((a, b) => b.s - a.s);
  if (ranked.length === 0) {
    // Relax class constraints rather than fail.
    return best(role, ["neo-grotesque", "grotesque", "humanist-sans", "geometric-sans"], traits, input, exclude);
  }
  return ranked[0]!.f;
}

const round = (n: number) => (n >= 18 ? Math.round(n) : Math.round(n * 2) / 2);
const rem = (px: number) => `${Math.round((px / 16) * 1000) / 1000}rem`;

/** clamp() that scales linearly between 360px and 1280px viewports. */
export function fluid(minPx: number, maxPx: number, minVw = 360, maxVw = 1280): string {
  if (maxPx <= minPx) return rem(maxPx);
  const slope = (maxPx - minPx) / (maxVw - minVw);
  const intercept = minPx - slope * minVw;
  return `clamp(${rem(minPx)}, ${rem(intercept)} + ${Math.round(slope * 10000) / 100}vw, ${rem(maxPx)})`;
}

export function generateTypography(input: TypographyInput): TypographySpec {
  const d = input.direction;
  const rationale: string[] = [];
  let heading: FontChoice;
  let body: FontChoice;
  let mono: FontChoice;

  if (input.systemFontsOnly) {
    heading = systemChoice("heading");
    body = systemChoice("body");
    mono = systemChoice("mono");
    rationale.push("System fonts only, as requested; hierarchy comes from weight, size and spacing.");
  } else {
    const requested = input.explicitFonts.map((f) => lookupFont(f)?.family ?? f);
    const existing = input.existingFonts ?? {};
    // Priority: explicit request > existing project fonts > direction-based selection.
    if (requested[0]) {
      heading = external(requested[0], "heading", "user-requested", "Requested in the brief.");
    } else if (existing.heading) {
      heading = external(existing.heading, "heading", "existing", "Already used for headings in this project; preserved.");
    } else {
      const f = best("heading", d.type.heading, d.type.headingTraits, input);
      heading = choice(f, "heading", [d.type.headingWeight, 700], "google-fonts", `Fits ${d.name}: ${f.class} with ${f.traits.slice(0, 3).join(", ")} character.`);
    }
    if (requested[1]) {
      body = external(requested[1], "body", "user-requested", "Requested in the brief.");
    } else if (existing.body) {
      body = external(existing.body, "body", "existing", "Already used for body text in this project; preserved.");
    } else if (d.type.sameFamily && lookupFont(heading.family)?.roles.some((r) => r === "body" || r === "ui")) {
      body = external(heading.family, "body", heading.source, "Same family as headings, as this direction relies on weight contrast rather than a second typeface.");
    } else {
      // Pairing: contrast in classification, never two display faces.
      const headingIsSerif = SERIFS.includes(heading.classification);
      const classes = d.type.body.filter((c) => (headingIsSerif ? !SERIFS.includes(c) || c === "transitional-serif" : true));
      const f = best("body", classes.length ? classes : d.type.body, d.type.bodyTraits, input, [heading.family]);
      body = choice(f, "body", [400, 500, 600, 700], "google-fonts", `Readable ${f.class} for running text; pairs with ${heading.family} by contrast of ${headingIsSerif ? "serif and sans" : "voice and neutrality"}.`);
    }
    if (existing.mono) {
      mono = external(existing.mono, "mono", "existing", "Already used for code in this project; preserved.");
    } else {
      const f = best("mono", ["monospace"], ["technical", "code", ...d.type.bodyTraits], input);
      mono = choice(f, "mono", [400, 500], "google-fonts", d.type.mono === "required" ? "Monospace is part of this direction's voice (metadata, code, numbers)." : "For code and tabular data when needed.");
    }
    rationale.push(`Heading: ${heading.family} (${heading.classification}); body: ${body.family} (${body.classification}); mono: ${mono.family}.`);
    if (heading.source === "google-fonts") rationale.push("Overused defaults (Inter, Poppins, Montserrat…) are penalised unless they are clearly the best fit, so different projects land on different typefaces.");
  }

  // ----- scale -----
  let basePx = d.type.bodyPx;
  if (input.density === "compact") basePx -= 1;
  if (input.density === "airy" && basePx < 18) basePx += 0.5;
  if (input.audience.includes("older adults")) basePx = Math.max(basePx, 18);
  if (input.audience.includes("kids and families")) basePx = Math.max(basePx, 17);
  basePx = Math.max(14, Math.min(20, Math.round(basePx * 2) / 2));
  let ratio = d.type.ratio + input.traits.boldness * 0.04 - Math.max(0, input.traits.density) * 0.03;
  ratio = Math.round(Math.max(1.125, Math.min(1.6, ratio)) * 1000) / 1000;
  const names = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"];
  const steps: TypeStep[] = names.map((token, i) => {
    const px = round(basePx * ratio ** (i - 2));
    const isLarge = px >= 32;
    const minPx = px >= 48 ? Math.max(basePx * 1.6, px * 0.58) : px >= 32 ? Math.max(basePx * 1.35, px * 0.72) : px >= 24 ? px * 0.86 : px;
    const lineHeight = px >= 48 ? d.type.headingLineHeight : px >= 32 ? d.type.headingLineHeight + 0.05 : px >= 20 ? 1.3 : i <= 1 ? 1.45 : d.type.bodyLineHeight;
    const tracking = px >= 40 ? d.type.headingTracking : px >= 24 ? d.type.headingTracking * 0.6 : 0;
    return {
      token,
      px,
      rem: rem(px),
      fluid: isLarge || px >= 24 ? fluid(round(minPx), px) : undefined,
      lineHeight: Math.round(lineHeight * 100) / 100,
      letterSpacing: tracking === 0 ? "0" : `${Math.round(tracking * 1000) / 1000}em`,
    };
  });
  const stepAt = (name: string) => steps.find((s) => s.token === name)!;
  const headingCandidates = ["5xl", "4xl", "3xl", "2xl"].map(stepAt);
  const h1Step = headingCandidates.find((s) => s.px <= d.type.maxH1Px) ?? stepAt("2xl");
  const h1Index = names.indexOf(h1Step.token);
  const level = (offset: number) => steps[Math.max(2, h1Index - offset)]!;
  const displayStep = steps[Math.min(names.length - 1, h1Index + 1)]!;

  const headingWeight = Math.min(heading.weights[heading.weights.length - 1] ?? 700, Math.max(heading.weights[0] ?? 400, d.type.headingWeight));
  const upper = d.type.headingCase === "uppercase";
  const style = (s: TypeStep, family: TextStyle["fontFamily"], weight: number, usage: string, extra: Partial<TextStyle> = {}): TextStyle => ({
    step: s.token,
    size: s.fluid ?? s.rem,
    fontFamily: family,
    weight,
    lineHeight: s.lineHeight,
    letterSpacing: upper && family === "heading" ? "0.01em" : s.letterSpacing,
    usage,
    ...extra,
  });
  const styles: Record<string, TextStyle> = {
    display: style(displayStep.px <= d.type.maxH1Px * 1.3 ? displayStep : h1Step, "heading", headingWeight, "Hero headline only; one per page.", upper ? { textTransform: "uppercase" } : {}),
    h1: style(h1Step, "heading", headingWeight, "Page title.", upper ? { textTransform: "uppercase" } : {}),
    h2: style(level(1), "heading", headingWeight, "Section titles.", upper ? { textTransform: "uppercase" } : {}),
    h3: style(level(2), "heading", Math.min(headingWeight, 700), "Sub-sections, card titles in feature grids."),
    h4: style(level(3), "heading", Math.min(headingWeight, 650), "Card titles, dialog titles."),
    h5: style(stepAt("lg"), "body", 600, "Small group headings."),
    h6: style(stepAt("base"), "body", 600, "Inline headings, list group labels."),
    "body-lg": style(stepAt("lg"), "body", 400, "Lead paragraphs and intros.", { lineHeight: Math.min(1.6, d.type.bodyLineHeight) }),
    body: style(stepAt("base"), "body", 400, "Default running text.", { lineHeight: d.type.bodyLineHeight }),
    small: style(stepAt("sm"), "body", 400, "Secondary text, table cells in dense views.", { lineHeight: 1.45 }),
    caption: style(stepAt("xs"), "body", 500, "Captions, timestamps, footnotes.", { lineHeight: 1.4 }),
    label: style(stepAt("sm"), d.type.mono === "required" ? "mono" : "body", 600, "Form labels, eyebrows, nav items.", d.type.uppercaseLabels ? { textTransform: "uppercase", letterSpacing: "0.08em" } : {}),
    button: style(stepAt(input.density === "compact" ? "sm" : "base"), "body", 600, "Button labels.", { lineHeight: 1, letterSpacing: d.type.uppercaseLabels && d.id !== "precision-instrument" ? "0.04em" : "0" }),
    code: style(stepAt("sm"), "mono", 400, "Inline code and code blocks.", { lineHeight: 1.6 }),
  };
  rationale.push(
    `Scale: ${basePx}px base × ${ratio} ratio (${names.length} steps). h1 is capped at ${d.type.maxH1Px}px for this direction so headings stay proportional to their copy.`,
  );

  const googleFamilies = [heading, body, ...(d.type.mono !== "optional" ? [mono] : [])]
    .filter((f, i, arr) => f.googleFontsFamily && arr.findIndex((x) => x.family === f.family) === i)
    .map((f) => ({ family: f.googleFontsFamily!, weights: f.weights }));
  const sourcingNotes = [
    "Self-hosting (Fontsource or downloaded WOFF2) is preferred for privacy and performance; the Google Fonts CSS API is the zero-setup alternative.",
    "Load only the weights listed; subset to the languages you ship (latin by default).",
    "Use font-display: swap and preload the heading font's WOFF2 used above the fold.",
  ];
  if ([heading, body, mono].some((f) => f.source === "existing" || f.source === "user-requested")) {
    sourcingNotes.push("Fonts preserved from the project or requested by the user keep their current loading method; verify their licenses if they are not open-source.");
  }
  return {
    heading,
    body,
    mono,
    monoUse: d.type.mono,
    scale: { ratio, basePx, steps },
    styles,
    weights: { regular: 400, medium: 500, semibold: 600, bold: 700, heading: headingWeight },
    sourcing: {
      googleFontsUrl: googleFamilies.length ? googleFontsCssUrl(googleFamilies) : undefined,
      preconnect: googleFamilies.length ? ["https://fonts.googleapis.com", "https://fonts.gstatic.com"] : [],
      fontDisplay: "swap",
      notes: sourcingNotes,
    },
    rules: [
      `Body text stays at ${basePx}px or larger on mobile; never shrink below 14px for any readable text.`,
      "Limit line length to 60–75 characters (max-width: 65ch on text containers).",
      "Use font-variant-numeric: tabular-nums for prices, tables, timers and metrics.",
      `Headings use ${heading.family} at weight ${headingWeight}${upper ? " in uppercase" : ""}; never fake bold or italic styles that are not loaded.`,
      "Apply text-wrap: balance to headings and text-wrap: pretty to paragraphs where supported.",
    ],
    rationale,
  };
}
