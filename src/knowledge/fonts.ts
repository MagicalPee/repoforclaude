import type { FontClass } from "../types.js";

export type FontRole = "heading" | "body" | "ui" | "mono" | "display";

export interface FontInfo {
  family: string;
  class: FontClass;
  /** Recommendable fonts are open-licensed and served by Google Fonts / Fontsource. */
  recommendable: boolean;
  license?: "OFL-1.1";
  variable?: boolean;
  weights?: [number, number];
  roles: FontRole[];
  traits: string[];
  /** Very widely used; selected only when the fit is strong, to avoid a default look. */
  overused?: boolean;
  note?: string;
}

function open(
  family: string,
  cls: FontClass,
  variable: boolean,
  weights: [number, number],
  roles: string,
  traits: string,
  extra: Partial<FontInfo> = {},
): FontInfo {
  return {
    family,
    class: cls,
    recommendable: true,
    license: "OFL-1.1",
    variable,
    weights,
    roles: roles.split(" ") as FontRole[],
    traits: traits.split(" "),
    ...extra,
  };
}

function known(family: string, cls: FontClass, traits = "", note?: string): FontInfo {
  return { family, class: cls, recommendable: false, roles: [], traits: traits ? traits.split(" ") : [], note };
}

/**
 * Curated catalog. Every `open(...)` entry is a Google Fonts family released under the SIL
 * Open Font License 1.1; weights are the published range. `known(...)` entries exist so the
 * analyzer can classify fonts it finds on websites; they are never recommended.
 */
export const FONT_CATALOG: FontInfo[] = [
  // ---- sans: neutral / UI ----
  open("Inter", "neo-grotesque", true, [100, 900], "body ui heading", "neutral technical legible modern", { overused: true }),
  open("Inter Tight", "neo-grotesque", true, [100, 900], "heading display", "neutral technical modern compact"),
  open("Geist", "neo-grotesque", true, [100, 900], "body ui heading", "technical modern neutral precise"),
  open("IBM Plex Sans", "grotesque", false, [100, 700], "body ui heading", "technical authoritative industrial legible"),
  open("Public Sans", "neo-grotesque", true, [100, 900], "body ui heading", "civic neutral legible trustworthy"),
  open("Source Sans 3", "humanist-sans", true, [200, 900], "body ui", "neutral legible humanist friendly"),
  open("Work Sans", "grotesque", true, [100, 900], "body ui heading", "friendly neutral modern"),
  open("Hanken Grotesk", "grotesque", true, [100, 900], "body ui heading", "neutral modern warm legible"),
  open("Instrument Sans", "neo-grotesque", true, [400, 700], "body ui heading", "modern precise editorial neutral"),
  open("Albert Sans", "geometric-sans", true, [100, 900], "body ui heading", "modern clean friendly"),
  open("Figtree", "geometric-sans", true, [300, 900], "body ui heading", "friendly clean modern legible"),
  open("Onest", "grotesque", true, [100, 900], "body ui heading", "neutral modern legible"),
  open("Manrope", "geometric-sans", true, [200, 800], "body ui heading", "modern technical clean friendly"),
  open("DM Sans", "geometric-sans", true, [100, 1000], "body ui heading", "friendly modern clean", { overused: true }),
  open("Plus Jakarta Sans", "geometric-sans", true, [200, 800], "body ui heading", "friendly modern polished", { overused: true }),
  open("Libre Franklin", "grotesque", true, [100, 900], "body ui heading", "classic editorial authoritative"),
  open("Schibsted Grotesk", "grotesque", true, [400, 900], "body ui heading", "editorial modern confident"),
  open("Familjen Grotesk", "grotesque", true, [400, 700], "heading body", "quirky editorial modern"),
  open("Red Hat Text", "geometric-sans", true, [300, 700], "body ui", "friendly technical legible"),
  open("Red Hat Display", "geometric-sans", true, [300, 900], "heading display", "friendly technical bold"),
  open("Be Vietnam Pro", "neo-grotesque", false, [100, 900], "body ui heading", "friendly modern neutral"),
  open("Commissioner", "humanist-sans", true, [100, 900], "body ui heading", "warm humanist modern"),
  open("Encode Sans", "humanist-sans", true, [100, 900], "body ui", "neutral technical legible"),
  open("Atkinson Hyperlegible", "humanist-sans", false, [400, 700], "body ui", "civic legible accessible friendly", {
    note: "Designed by the Braille Institute for low-vision readability; static 400 and 700 weights.",
  }),
  open("Lexend", "geometric-sans", true, [100, 900], "body ui heading", "accessible friendly legible education"),
  open("Mulish", "humanist-sans", true, [200, 1000], "body ui", "friendly clean minimal"),
  open("Karla", "grotesque", true, [200, 800], "body ui", "quirky friendly warm"),
  open("Rubik", "rounded-sans", true, [300, 900], "body ui heading", "friendly playful soft"),
  open("Nunito", "rounded-sans", true, [200, 1000], "body ui heading", "friendly playful soft warm"),
  open("Nunito Sans", "humanist-sans", true, [200, 1000], "body ui", "friendly clean warm"),
  open("Quicksand", "rounded-sans", true, [300, 700], "heading ui", "playful soft friendly light"),
  open("Fredoka", "rounded-sans", true, [300, 700], "heading display", "playful soft friendly kids"),
  open("Baloo 2", "rounded-sans", true, [400, 800], "heading display", "playful bold friendly kids"),
  open("Outfit", "geometric-sans", true, [100, 900], "heading body ui", "modern geometric clean friendly"),
  open("Urbanist", "geometric-sans", true, [100, 900], "heading body ui", "modern geometric minimal"),
  open("Jost", "geometric-sans", true, [100, 900], "heading body", "geometric classic modernist elegant"),
  open("Poppins", "geometric-sans", false, [100, 900], "heading body ui", "geometric friendly", { overused: true }),
  open("Montserrat", "geometric-sans", true, [100, 900], "heading", "geometric bold urban", { overused: true }),
  open("Raleway", "geometric-sans", true, [100, 900], "heading", "elegant thin geometric", { overused: true }),
  open("Lato", "humanist-sans", false, [100, 900], "body ui", "warm neutral friendly", { overused: true }),
  open("Sora", "geometric-sans", true, [100, 800], "heading body ui", "futuristic technical modern geometric"),
  open("Space Grotesk", "grotesque", true, [300, 700], "heading body", "technical quirky futuristic", { overused: true }),
  open("Bricolage Grotesque", "grotesque", true, [200, 800], "heading display", "expressive quirky editorial warm bold"),
  open("Epilogue", "grotesque", true, [100, 900], "heading body", "editorial expressive modern"),
  open("Archivo", "grotesque", true, [100, 900], "heading body ui", "industrial bold technical condensed-capable"),
  open("Barlow", "grotesque", false, [100, 900], "body ui heading", "industrial technical sporty"),
  open("Gabarito", "geometric-sans", true, [400, 900], "heading display", "friendly bold playful"),
  open("Wix Madefor Display", "grotesque", true, [400, 800], "heading display", "modern clean confident"),
  open("Golos Text", "grotesque", true, [400, 900], "body ui", "neutral legible modern"),
  open("Radio Canada", "humanist-sans", true, [300, 700], "body ui heading", "civic friendly legible"),

  // ---- sans: display / expressive ----
  open("Syne", "display", true, [400, 800], "heading display", "expressive artistic bold quirky avant-garde"),
  open("Unbounded", "display", true, [200, 900], "heading display", "futuristic bold expressive wide gaming"),
  open("Anybody", "condensed-sans", true, [100, 900], "heading display", "expressive variable-width bold playful", {
    note: "Width axis 50–150%; works condensed or extended.",
  }),
  open("Barlow Condensed", "condensed-sans", false, [100, 900], "heading display", "condensed sporty industrial"),
  open("Oswald", "condensed-sans", true, [200, 700], "heading display", "condensed bold news sporty", { overused: true }),
  open("Bebas Neue", "condensed-sans", false, [400, 400], "display", "condensed bold sporty loud", { note: "Single weight, uppercase-only design." }),
  open("Anton", "condensed-sans", false, [400, 400], "display", "condensed heavy loud poster"),
  open("Archivo Black", "grotesque", false, [400, 400], "display heading", "heavy bold poster"),
  open("Chakra Petch", "display", false, [300, 700], "heading display", "futuristic technical gaming angular"),
  open("Rajdhani", "condensed-sans", false, [300, 700], "heading display", "futuristic technical gaming"),
  open("Oxanium", "display", true, [200, 800], "heading display", "futuristic gaming angular technical"),
  open("Orbitron", "display", true, [400, 900], "display", "futuristic gaming sci-fi wide"),
  open("Exo 2", "display", true, [100, 900], "heading display", "futuristic gaming technical"),
  open("Saira", "grotesque", true, [100, 900], "heading body", "technical sporty futuristic"),
  open("Russo One", "display", false, [400, 400], "display", "bold gaming sporty"),
  open("Audiowide", "display", false, [400, 400], "display", "retro-futuristic gaming wide"),
  open("Michroma", "display", false, [400, 400], "display", "wide technical futuristic luxury-tech"),
  open("Dela Gothic One", "display", false, [400, 400], "display", "heavy expressive poster gaming"),
  open("Bungee", "display", false, [400, 400], "display", "playful urban signage bold"),
  open("Lilita One", "display", false, [400, 400], "display", "playful bold friendly kids gaming"),
  open("Titan One", "display", false, [400, 400], "display", "playful heavy rounded kids"),
  open("Rubik Mono One", "display", false, [400, 400], "display", "bold retro playful uppercase"),
  open("Press Start 2P", "display", false, [400, 400], "display", "retro pixel gaming 8-bit", { note: "Pixel font; use only at large sizes and sparingly." }),
  open("Silkscreen", "display", false, [400, 700], "display", "retro pixel gaming"),
  open("Darker Grotesque", "grotesque", true, [300, 900], "heading display", "editorial condensed-ish quirky"),

  // ---- serif ----
  open("Fraunces", "display-serif", true, [100, 900], "heading display", "warm expressive soft retro editorial", {
    note: "Variable 'SOFT' and 'WONK' axes; soften for friendly brands, sharpen for editorial.",
  }),
  open("Newsreader", "transitional-serif", true, [200, 800], "heading body", "editorial literary classic news"),
  open("Source Serif 4", "transitional-serif", true, [200, 900], "body heading", "editorial legible classic"),
  open("Literata", "transitional-serif", true, [200, 900], "body heading", "literary legible editorial"),
  open("Lora", "transitional-serif", true, [400, 700], "body heading", "warm literary classic"),
  open("Merriweather", "transitional-serif", true, [300, 900], "body heading", "sturdy legible editorial"),
  open("Crimson Pro", "old-style-serif", true, [200, 900], "body heading", "literary classic bookish"),
  open("EB Garamond", "old-style-serif", true, [400, 800], "heading body", "classic literary elegant heritage"),
  open("Cormorant Garamond", "display-serif", false, [300, 700], "heading display", "elegant luxurious delicate high-contrast"),
  open("Cormorant", "display-serif", true, [300, 700], "heading display", "elegant luxurious delicate"),
  open("Libre Caslon Text", "old-style-serif", false, [400, 700], "body heading", "heritage classic authoritative"),
  open("Libre Caslon Display", "display-serif", false, [400, 400], "display heading", "heritage elegant editorial"),
  open("Libre Baskerville", "transitional-serif", false, [400, 700], "body heading", "classic authoritative editorial"),
  open("Spectral", "transitional-serif", false, [200, 800], "body heading", "elegant literary modern-classic"),
  open("Playfair Display", "didone", true, [400, 900], "heading display", "elegant high-contrast luxurious editorial", { overused: true }),
  open("Bodoni Moda", "didone", true, [400, 900], "heading display", "luxurious fashion high-contrast elegant"),
  open("DM Serif Display", "display-serif", false, [400, 400], "heading display", "elegant bold editorial"),
  open("DM Serif Text", "transitional-serif", false, [400, 400], "heading body", "elegant editorial warm"),
  open("Instrument Serif", "display-serif", false, [400, 400], "heading display", "editorial elegant condensed modern"),
  open("Gloock", "display-serif", false, [400, 400], "heading display", "editorial bold high-contrast"),
  open("Young Serif", "display-serif", false, [400, 400], "heading display", "warm retro friendly editorial"),
  open("Petrona", "transitional-serif", true, [100, 900], "body heading", "warm editorial modern-classic"),
  open("Italiana", "didone", false, [400, 400], "display", "luxurious fashion thin elegant"),
  open("Marcellus", "display-serif", false, [400, 400], "heading display", "classical elegant inscriptional"),
  open("Cinzel", "display-serif", true, [400, 900], "display", "classical luxurious inscriptional uppercase"),
  open("Prata", "didone", false, [400, 400], "heading display", "elegant luxurious editorial"),
  open("Abril Fatface", "didone", false, [400, 400], "display", "bold poster editorial retro"),
  open("Zilla Slab", "slab-serif", false, [300, 700], "heading body", "editorial technical friendly"),
  open("Bitter", "slab-serif", true, [100, 900], "body heading", "sturdy legible editorial"),
  open("Arvo", "slab-serif", false, [400, 700], "heading", "sturdy retro geometric"),

  // ---- mono ----
  open("JetBrains Mono", "monospace", true, [100, 800], "mono", "code technical legible"),
  open("IBM Plex Mono", "monospace", false, [100, 700], "mono heading", "code technical industrial"),
  open("Geist Mono", "monospace", true, [100, 900], "mono", "code technical modern"),
  open("Fira Code", "monospace", true, [300, 700], "mono", "code technical ligatures"),
  open("Source Code Pro", "monospace", true, [200, 900], "mono", "code technical neutral"),
  open("DM Mono", "monospace", false, [300, 500], "mono", "code friendly minimal"),
  open("Space Mono", "monospace", false, [400, 700], "mono heading display", "retro quirky technical"),
  open("Martian Mono", "monospace", true, [100, 800], "mono heading", "technical futuristic wide"),
  open("Red Hat Mono", "monospace", true, [300, 700], "mono", "code technical friendly"),
  open("Azeret Mono", "monospace", true, [100, 900], "mono", "technical precise"),
  open("Fragment Mono", "monospace", false, [400, 400], "mono", "technical neutral editorial"),
  open("Spline Sans Mono", "monospace", true, [300, 700], "mono", "technical friendly modern"),

  // ---- known (classification only) ----
  known("Roboto", "neo-grotesque", "neutral android"),
  known("Open Sans", "humanist-sans", "neutral"),
  known("Roboto Mono", "monospace", "code"),
  known("Roboto Slab", "slab-serif"),
  known("Noto Sans", "humanist-sans"),
  known("Noto Serif", "transitional-serif"),
  known("Helvetica", "neo-grotesque"),
  known("Helvetica Neue", "neo-grotesque"),
  known("Arial", "neo-grotesque"),
  known("Neue Haas Grotesk", "neo-grotesque"),
  known("Neue Haas Unica", "neo-grotesque"),
  known("SF Pro", "neo-grotesque", "system"),
  known("SF Pro Display", "neo-grotesque", "system"),
  known("SF Pro Text", "neo-grotesque", "system"),
  known("Segoe UI", "humanist-sans", "system"),
  known("Söhne", "grotesque", "technical editorial"),
  known("Sohne", "grotesque", "technical editorial"),
  known("Graphik", "neo-grotesque"),
  known("Circular", "geometric-sans", "friendly"),
  known("Circular Std", "geometric-sans", "friendly"),
  known("GT America", "grotesque"),
  known("GT Walsheim", "geometric-sans", "friendly"),
  known("GT Sectra", "display-serif"),
  known("GT Super", "display-serif"),
  known("GT Flexa", "grotesque"),
  known("Proxima Nova", "geometric-sans"),
  known("Gotham", "geometric-sans"),
  known("Futura", "geometric-sans"),
  known("Futura PT", "geometric-sans"),
  known("Avenir", "geometric-sans"),
  known("Avenir Next", "geometric-sans"),
  known("Apercu", "grotesque"),
  known("Founders Grotesk", "grotesque"),
  known("Suisse Intl", "neo-grotesque"),
  known("Untitled Sans", "neo-grotesque"),
  known("Aeonik", "neo-grotesque"),
  known("ABC Diatype", "neo-grotesque"),
  known("Neue Montreal", "neo-grotesque"),
  known("PP Neue Montreal", "neo-grotesque"),
  known("PP Editorial New", "display-serif"),
  known("Euclid Circular A", "geometric-sans"),
  known("Euclid Circular B", "geometric-sans"),
  known("Gilroy", "geometric-sans"),
  known("Satoshi", "geometric-sans"),
  known("General Sans", "grotesque"),
  known("Clash Display", "display"),
  known("Cabinet Grotesk", "grotesque"),
  known("Basier Circle", "geometric-sans"),
  known("Matter", "grotesque"),
  known("Mona Sans", "grotesque"),
  known("Hubot Sans", "grotesque"),
  known("Tiempos Headline", "display-serif"),
  known("Tiempos Text", "transitional-serif"),
  known("Tiempos", "transitional-serif"),
  known("Canela", "display-serif"),
  known("Freight Text Pro", "old-style-serif"),
  known("Freight Display Pro", "display-serif"),
  known("Publico", "transitional-serif"),
  known("Lyon Text", "old-style-serif"),
  known("Georgia", "transitional-serif"),
  known("Times New Roman", "transitional-serif"),
  known("Times", "transitional-serif"),
  known("Garamond", "old-style-serif"),
  known("Didot", "didone"),
  known("Bodoni", "didone"),
  known("Berkeley Mono", "monospace"),
  known("Söhne Mono", "monospace"),
  known("SF Mono", "monospace"),
  known("Menlo", "monospace"),
  known("Monaco", "monospace"),
  known("Consolas", "monospace"),
  known("Courier New", "monospace"),
  known("Fira Mono", "monospace"),
  known("Ubuntu", "humanist-sans"),
  known("Verdana", "humanist-sans"),
  known("Tahoma", "humanist-sans"),
  known("Trebuchet MS", "humanist-sans"),
  known("system-ui", "system"),
  known("-apple-system", "system"),
  known("BlinkMacSystemFont", "system"),
];

const BY_NAME = new Map<string, FontInfo>();
for (const f of FONT_CATALOG) BY_NAME.set(normalizeFamily(f.family), f);

/** Normalises vendor naming noise: quotes, "Variable", "VF", weight suffixes, Next.js hash names. */
export function normalizeFamily(family: string): string {
  let f = family
    .replace(/["']/g, "")
    .replace(/__[\w-]+$/, "") // next/font generated names like "__Inter_a1b2c3"
    .replace(/^__/, "")
    .replace(/_Fallback.*$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+var(\s+experimental)?$/i, "")
    .trim()
    .toLowerCase();
  f = f.replace(/\b(variable|vf|webfont|web|display|text)\b$/g, (m) => (m === "display" || m === "text" ? m : "")).trim();
  f = f.replace(/\s+(thin|light|regular|medium|semibold|bold|black|book|\d{3})$/i, "").trim();
  return f.replace(/\s+/g, " ");
}

export function lookupFont(family: string): FontInfo | undefined {
  const norm = normalizeFamily(family);
  return BY_NAME.get(norm) ?? BY_NAME.get(norm.replace(/\s+(display|text|pro|std)$/, ""));
}

export function classifyFont(family: string, genericFallback: string | null): FontClass {
  const info = lookupFont(family);
  if (info) return info.class;
  const lower = family.toLowerCase();
  if (/mono|code|consol|courier/.test(lower)) return "monospace";
  if (/serif/.test(lower) && !/sans/.test(lower)) return "transitional-serif";
  if (/condensed|compressed|narrow/.test(lower)) return "condensed-sans";
  if (/grotesk|grotesque/.test(lower)) return "grotesque";
  if (genericFallback === "monospace" || genericFallback === "ui-monospace") return "monospace";
  if (genericFallback === "serif" || genericFallback === "ui-serif") return "transitional-serif";
  return "unknown";
}

export function recommendableFonts(): FontInfo[] {
  return FONT_CATALOG.filter((f) => f.recommendable);
}

export function googleFontsCssUrl(fonts: Array<{ family: string; weights: number[] }>): string {
  const families = fonts.map((f) => {
    const name = f.family.replace(/ /g, "+");
    const weights = [...new Set(f.weights)].sort((a, b) => a - b);
    return `family=${name}:wght@${weights.join(";")}`;
  });
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

export function fontsourcePackage(font: FontInfo): string {
  const slug = font.family.toLowerCase().replace(/\s+/g, "-");
  return font.variable ? `@fontsource-variable/${slug}` : `@fontsource/${slug}`;
}

export function nextFontImportName(family: string): string {
  return family.replace(/\s+/g, "_");
}
