import type { HueFamily } from "../types.js";

export interface Rgba {
  r: number; // 0..255
  g: number;
  b: number;
  a: number; // 0..1
}

export interface Oklch {
  l: number; // 0..1
  c: number; // 0..~0.4
  h: number; // degrees 0..360
}

// CSS Color Module Level 4 named colors.
const NAMED_SOURCE =
  "aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000 " +
  "blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 " +
  "chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b " +
  "darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b " +
  "darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a darkseagreen 8fbc8f " +
  "darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 " +
  "deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22 " +
  "fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080 green 008000 greenyellow adff2f " +
  "grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa " +
  "lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff " +
  "lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a " +
  "lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 " +
  "lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd " +
  "mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a " +
  "mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 " +
  "navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 " +
  "palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 " +
  "peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f " +
  "royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d " +
  "silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f " +
  "steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 " +
  "white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32";

export const NAMED_COLORS: ReadonlyMap<string, string> = (() => {
  const parts = NAMED_SOURCE.split(/\s+/);
  const map = new Map<string, string>();
  for (let i = 0; i + 1 < parts.length; i += 2) map.set(parts[i]!, `#${parts[i + 1]!}`);
  return map;
})();

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function parseNumberOrPercent(token: string, percentScale: number): number | null {
  const t = token.trim();
  if (t === "none") return 0;
  if (t.endsWith("%")) {
    const v = Number.parseFloat(t.slice(0, -1));
    return Number.isFinite(v) ? (v / 100) * percentScale : null;
  }
  const v = Number.parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

function parseHue(token: string): number | null {
  const t = token.trim().toLowerCase();
  if (t === "none") return 0;
  const v = Number.parseFloat(t);
  if (!Number.isFinite(v)) return null;
  if (t.endsWith("turn")) return v * 360;
  if (t.endsWith("grad")) return v * 0.9;
  if (t.endsWith("rad")) return (v * 180) / Math.PI;
  return v;
}

function splitArgs(inner: string): { parts: string[]; alpha?: string } {
  const [main, alpha] = inner.split("/");
  const parts = (main ?? "")
    .replace(/,/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  // Legacy comma syntax carries alpha as a 4th argument.
  if (alpha === undefined && parts.length === 4) return { parts: parts.slice(0, 3), alpha: parts[3] };
  return { parts, alpha: alpha?.trim() };
}

function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 1;
  const v = parseNumberOrPercent(token, 1);
  return v === null ? 1 : clamp(v, 0, 1);
}

/** Parses the CSS color syntaxes that show up in real stylesheets and token files. */
export function parseColor(input: string): Rgba | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  if (raw.startsWith("#")) return parseHex(raw);
  const named = NAMED_COLORS.get(raw);
  if (named) return parseHex(named);
  if (raw === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const fn = /^(rgba?|hsla?|oklch|oklab|hwb)\(\s*([^)]*)\)$/.exec(raw);
  if (!fn) return null;
  const name = fn[1]!;
  const { parts, alpha } = splitArgs(fn[2]!);
  if (parts.length !== 3 || parts.some((p) => p.startsWith("var(") || p === "from")) return null;
  const a = parseAlpha(alpha);
  if (name === "rgb" || name === "rgba") {
    const [r, g, b] = parts.map((p) => parseNumberOrPercent(p, 255));
    if (r == null || g == null || b == null) return null;
    return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a };
  }
  if (name === "hsl" || name === "hsla") {
    const h = parseHue(parts[0]!);
    const s = parseNumberOrPercent(parts[1]!, 100);
    const l = parseNumberOrPercent(parts[2]!, 100);
    if (h == null || s == null || l == null) return null;
    return { ...hslToRgb(h, clamp(s, 0, 100) / 100, clamp(l, 0, 100) / 100), a };
  }
  if (name === "hwb") {
    const h = parseHue(parts[0]!);
    const w = parseNumberOrPercent(parts[1]!, 100);
    const bl = parseNumberOrPercent(parts[2]!, 100);
    if (h == null || w == null || bl == null) return null;
    return { ...hwbToRgb(h, clamp(w, 0, 100) / 100, clamp(bl, 0, 100) / 100), a };
  }
  if (name === "oklch") {
    const l = parseNumberOrPercent(parts[0]!, 1);
    const c = parseNumberOrPercent(parts[1]!, 0.4);
    const h = parseHue(parts[2]!);
    if (l == null || c == null || h == null) return null;
    return { ...oklchToRgb({ l: clamp(l, 0, 1), c: Math.max(0, c), h }), a };
  }
  // oklab
  const l = parseNumberOrPercent(parts[0]!, 1);
  const A = parseNumberOrPercent(parts[1]!, 0.4);
  const B = parseNumberOrPercent(parts[2]!, 0.4);
  if (l == null || A == null || B == null) return null;
  return { ...oklabToRgb(clamp(l, 0, 1), A, B), a };
}

function parseHex(hex: string): Rgba | null {
  const h = hex.replace("#", "");
  if (!/^[0-9a-f]+$/i.test(h)) return null;
  if (h.length === 3 || h.length === 4) {
    const [r, g, b, a] = h.split("").map((c) => Number.parseInt(c + c, 16));
    return { r: r!, g: g!, b: b!, a: a === undefined ? 1 : a / 255 };
  }
  if (h.length === 6 || h.length === 8) {
    const r = Number.parseInt(h.slice(0, 2), 16);
    const g = Number.parseInt(h.slice(2, 4), 16);
    const b = Number.parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  return null;
}

function hslToRgb(h: number, s: number, l: number): Omit<Rgba, "a"> {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

function hwbToRgb(h: number, w: number, b: number): Omit<Rgba, "a"> {
  if (w + b >= 1) {
    const gray = (w / (w + b)) * 255;
    return { r: gray, g: gray, b: gray };
  }
  const base = hslToRgb(h, 1, 0.5);
  const f = (v: number) => (v / 255) * (1 - w - b) * 255 + w * 255;
  return { r: f(base.r), g: f(base.g), b: f(base.b) };
}

export function rgbToHex(c: Pick<Rgba, "r" | "g" | "b">): string {
  const to = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${to(c.r)}${to(c.g)}${to(c.b)}`;
}

/** Normalises any parseable opaque-ish color to #rrggbb; translucent colors are composited over `over`. */
export function toHex(input: string, over = "#ffffff"): string | null {
  const c = parseColor(input);
  if (!c) return null;
  if (c.a >= 0.999) return rgbToHex(c);
  if (c.a <= 0.001) return null;
  const bg = parseColor(over) ?? { r: 255, g: 255, b: 255, a: 1 };
  return rgbToHex({
    r: c.r * c.a + bg.r * (1 - c.a),
    g: c.g * c.a + bg.g * (1 - c.a),
    b: c.b * c.a + bg.b * (1 - c.a),
  });
}

// ---------- WCAG 2.x contrast ----------

function channelToLinear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const c = parseColor(hex);
  if (!c) throw new Error(`Invalid color: ${hex}`);
  return 0.2126 * channelToLinear(c.r) + 0.7152 * channelToLinear(c.g) + 0.0722 * channelToLinear(c.b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export type WcagLevel = "AAA" | "AA" | "AA-large" | "fail";

export function wcagLevel(ratio: number): WcagLevel {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA-large";
  return "fail";
}

// ---------- OKLab / OKLCH ----------

function linearToChannel(v: number): number {
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return s * 255;
}

export function rgbToOklab(c: Pick<Rgba, "r" | "g" | "b">): { l: number; a: number; b: number } {
  const r = channelToLinear(c.r);
  const g = channelToLinear(c.g);
  const b = channelToLinear(c.b);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

function oklabToLinear(L: number, A: number, B: number): [number, number, number] {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.291485548 * B;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function oklabToRgb(L: number, A: number, B: number): Omit<Rgba, "a"> {
  const [r, g, b] = oklabToLinear(L, A, B);
  return { r: clamp(linearToChannel(r), 0, 255), g: clamp(linearToChannel(g), 0, 255), b: clamp(linearToChannel(b), 0, 255) };
}

function oklchToRgb(c: Oklch): Omit<Rgba, "a"> {
  const rad = (c.h * Math.PI) / 180;
  return oklabToRgb(c.l, c.c * Math.cos(rad), c.c * Math.sin(rad));
}

export function toOklch(input: string): Oklch | null {
  const c = parseColor(input);
  if (!c) return null;
  const lab = rgbToOklab(c);
  const chroma = Math.sqrt(lab.a ** 2 + lab.b ** 2);
  let hue = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return { l: lab.l, c: chroma, h: hue };
}

function inGamut(c: Oklch): boolean {
  const rad = (c.h * Math.PI) / 180;
  const [r, g, b] = oklabToLinear(c.l, c.c * Math.cos(rad), c.c * Math.sin(rad));
  const eps = 1e-4;
  return [r, g, b].every((v) => v >= -eps && v <= 1 + eps);
}

/** Converts OKLCH to sRGB hex, reducing chroma (keeping hue and lightness) until it fits the gamut. */
export function oklchToHex(c: Oklch): string {
  const target = { l: clamp(c.l, 0, 1), c: Math.max(0, c.c), h: ((c.h % 360) + 360) % 360 };
  if (inGamut(target)) return rgbToHex(oklchToRgb(target));
  let lo = 0;
  let hi = target.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ ...target, c: mid })) lo = mid;
    else hi = mid;
  }
  return rgbToHex(oklchToRgb({ ...target, c: lo }));
}

export function formatOklch(hex: string): string {
  const c = toOklch(hex);
  if (!c) return "";
  return `oklch(${(c.l * 100).toFixed(1)}% ${c.c.toFixed(3)} ${c.c < 0.002 ? 0 : c.h.toFixed(1)})`;
}

/** Perceptual distance in OKLab (≈0.02 is a just-noticeable difference). */
export function deltaE(a: string, b: string): number {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return Number.POSITIVE_INFINITY;
  const la = rgbToOklab(ca);
  const lb = rgbToOklab(cb);
  return Math.sqrt((la.l - lb.l) ** 2 + (la.a - lb.a) ** 2 + (la.b - lb.b) ** 2);
}

export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) throw new Error(`Invalid colors: ${a}, ${b}`);
  const la = rgbToOklab(ca);
  const lb = rgbToOklab(cb);
  const L = la.l + (lb.l - la.l) * t;
  const A = la.a + (lb.a - la.a) * t;
  const B = la.b + (lb.b - la.b) * t;
  return rgbToHex(oklabToRgb(L, A, B));
}

export function hueFamily(c: Oklch): HueFamily {
  if (c.c < 0.035) return "neutral";
  const h = c.h;
  // Boundaries are in OKLCH hue degrees, tuned so CSS keyword colors land in their expected families.
  if (h < 15 || h >= 345) return "pink";
  if (h < 45) return "red";
  if (h < 80) return "orange";
  if (h < 115) return "yellow";
  if (h < 135) return "lime";
  if (h < 165) return "green";
  if (h < 200) return "teal";
  if (h < 225) return "cyan";
  if (h < 268) return "blue";
  if (h < 290) return "indigo";
  if (h < 315) return "violet";
  return "magenta";
}

export function isNeutral(hex: string): boolean {
  const c = toOklch(hex);
  return !c || c.c < 0.035;
}

/** Finds the lightness for a hue/chroma that reaches `minRatio` against `against`, searching toward `direction`. */
export function adjustForContrast(hex: string, against: string, minRatio: number): string {
  if (contrastRatio(hex, against) >= minRatio) return hex;
  const base = toOklch(hex);
  if (!base) return hex;
  const againstIsLight = relativeLuminance(against) > 0.18;
  let current = base;
  for (let i = 0; i < 60; i++) {
    current = { ...current, l: clamp(current.l + (againstIsLight ? -0.01 : 0.01), 0, 1) };
    const candidate = oklchToHex(current);
    if (contrastRatio(candidate, against) >= minRatio) return candidate;
    if (current.l <= 0 || current.l >= 1) break;
  }
  return againstIsLight ? "#000000" : "#ffffff";
}

/** White or near-black text, whichever reads better on `background`. */
export function readableOn(background: string, dark = "#0b0b0c", light = "#ffffff"): string {
  return contrastRatio(light, background) >= contrastRatio(dark, background) ? light : dark;
}
