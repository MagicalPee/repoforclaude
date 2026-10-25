import { hueFamily, toOklch } from "../analysis/color.js";
import type { FontClass, SiteProfile, StyleClassification } from "../types.js";

const SERIF_CLASSES: FontClass[] = ["transitional-serif", "old-style-serif", "didone", "slab-serif", "display-serif"];

export function isSerif(cls: FontClass): boolean {
  return SERIF_CLASSES.includes(cls);
}

function fontClassFor(profile: SiteProfile, family: string | undefined): FontClass {
  if (!family) return "unknown";
  return profile.typography.fonts.find((f) => f.family === family)?.classification ?? "unknown";
}

function neutralTemperature(profile: SiteProfile): StyleClassification["neutralTemperature"] {
  const candidates = [profile.colors.background, profile.colors.text, ...profile.colors.palette.map((c) => c.hex)].filter(
    (h): h is string => Boolean(h),
  );
  let warm = 0;
  let cool = 0;
  let pure = 0;
  for (const hex of candidates.slice(0, 12)) {
    const c = toOklch(hex);
    if (!c || c.c >= 0.035) continue;
    if (c.c < 0.006 || c.l > 0.985 || c.l < 0.05) {
      pure++;
      continue;
    }
    if (c.h >= 25 && c.h <= 115) warm++;
    else if (c.h >= 180 && c.h <= 300) cool++;
    else pure++;
  }
  if (warm + cool + pure === 0) return "unknown";
  if (warm > cool && warm >= pure * 0.5) return "warm";
  if (cool > warm && cool >= pure * 0.5) return "cool";
  return "neutral";
}

/** Derives a coarse, explainable style classification from observed evidence. */
export function classifyProfile(profile: SiteProfile): StyleClassification {
  const brands = profile.colors.brandCandidates.map((h) => toOklch(h)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const families = new Set(brands.map((c) => hueFamily(c)));
  let paletteCharacter: StyleClassification["paletteCharacter"] = "unknown";
  if (profile.colors.uniqueColorCount > 0) {
    // Token files rarely name a brand color; "no brand found" there is unknown, not monochrome.
    if (brands.length === 0) paletteCharacter = profile.sourceKind === "website" ? "monochrome" : "unknown";
    else {
      const avgChroma = brands.reduce((s, c) => s + c.c, 0) / brands.length;
      const avgL = brands.reduce((s, c) => s + c.l, 0) / brands.length;
      if (families.size >= 3) paletteCharacter = "multi-accent";
      else if (avgL >= 0.8 && avgChroma < 0.12) paletteCharacter = "pastel";
      else if (avgChroma >= 0.17) paletteCharacter = "vivid";
      else paletteCharacter = "restrained";
    }
  }
  const accent = brands[0] ? hueFamily(brands[0]) : "unknown";

  const headingClass = fontClassFor(profile, profile.typography.headingFont);
  const bodyClass = fontClassFor(profile, profile.typography.bodyFont);

  const h1 = profile.typography.headingSizesPx.h1;
  const body = profile.typography.bodySizePx ?? 16;
  const typeContrast: StyleClassification["typeContrast"] = h1 ? (h1 / body < 2.5 ? "low" : h1 / body <= 4 ? "medium" : "high") : "unknown";

  const website = profile.sourceKind === "website";
  // A token scale lists every radius once, so only a button-specific token is meaningful there.
  const r = profile.shape.buttonRadiusPx ?? (website ? profile.shape.dominantRadiusPx : undefined);
  const radiusFamily: StyleClassification["radiusFamily"] = profile.shape.pillButtons
    ? "pill"
    : r === undefined
      ? "unknown"
      : r <= 2
        ? "sharp"
        : r <= 8
          ? "soft"
          : r <= 20
            ? "rounded"
            : "pill";

  const durations = profile.effects.transitionDurationsMs;
  const longest = durations.length ? Math.max(...durations.map((d) => d.value)) : 0;
  const motion: StyleClassification["motion"] =
    durations.length === 0 && profile.effects.keyframes === 0
      ? profile.sourceKind === "website"
        ? "minimal"
        : "unknown"
      : profile.effects.keyframes > 6 || longest >= 600
        ? "expressive"
        : "subtle";

  const gradientUse: StyleClassification["gradientUse"] =
    profile.effects.gradients === 0 ? "none" : profile.effects.gradients <= 3 ? "light" : "heavy";
  const glass = profile.effects.backdropBlur > 0;
  // Spacing scales in token files say nothing about how densely a product is laid out.
  const density = website ? (profile.spacing.density ?? "unknown") : "unknown";

  const tags = new Set<string>();
  const colorMode = profile.colors.scheme;
  if ((paletteCharacter === "monochrome" || paletteCharacter === "restrained") && ["none", "subtle"].includes(profile.elevation.style) && gradientUse !== "heavy") {
    tags.add("minimal");
  }
  if (isSerif(headingClass) && typeContrast !== "low") tags.add("editorial");
  // Design systems almost always ship a mono token, so only websites count mono usage as a signal.
  if ((profile.typography.monoFont && profile.sourceKind === "website") || headingClass === "monospace" || (colorMode === "dark" && density === "compact")) {
    tags.add("technical");
  }
  if (["didone", "display-serif"].includes(headingClass) && ["monochrome", "restrained"].includes(paletteCharacter) && radiusFamily === "sharp") {
    tags.add("luxury");
  }
  if (radiusFamily === "sharp" && (profile.elevation.style === "hard-offset" || (profile.shape.borderWidthsPx[0]?.value ?? 1) >= 2)) {
    tags.add("brutalist");
  }
  if ((radiusFamily === "rounded" || radiusFamily === "pill") && (paletteCharacter === "vivid" || paletteCharacter === "multi-accent" || bodyClass === "rounded-sans")) {
    tags.add("playful");
  }
  if (["neo-grotesque", "humanist-sans", "grotesque"].includes(bodyClass) && paletteCharacter === "restrained" && radiusFamily === "soft" && colorMode === "light") {
    tags.add("corporate");
  }
  if (headingClass === "display" || headingClass === "condensed-sans") tags.add("expressive-type");
  if (glass) tags.add("glassmorphism");
  if (gradientUse === "heavy") tags.add("gradient-heavy");
  if (colorMode === "dark") tags.add("dark-ui");
  if (density === "compact") tags.add("dense");
  if (density === "airy") tags.add("airy");

  const known = [colorMode !== "unknown", paletteCharacter !== "unknown", headingClass !== "unknown", bodyClass !== "unknown", typeContrast !== "unknown", radiusFamily !== "unknown", density !== "unknown"];
  return {
    colorMode,
    paletteCharacter,
    accentHueFamily: accent,
    neutralTemperature: neutralTemperature(profile),
    headingClass,
    bodyClass,
    typeContrast,
    radiusFamily,
    elevation: profile.elevation.style,
    density,
    motion,
    gradientUse,
    glass,
    styleTags: [...tags],
    confidence: Math.round((known.filter(Boolean).length / known.length) * 100) / 100,
  };
}
