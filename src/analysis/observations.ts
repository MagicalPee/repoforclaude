import type { ObservationInput } from "../db/store.js";
import type { SiteProfile } from "../types.js";

/** Flattens a profile into queryable evidence rows, each with its own confidence. */
export function profileToObservations(p: SiteProfile): ObservationInput[] {
  const out: ObservationInput[] = [];
  const add = (kind: string, key: string, value: unknown, confidence: number, evidence: string, numeric?: number) => {
    if (value === undefined || value === null || value === "") return;
    out.push({ kind, key, value: String(value), numericValue: numeric, confidence, evidence });
  };
  const staticNote = p.sourceKind === "website" ? "declared in CSS (static analysis, not rendered)" : "declared in design tokens";

  add("color", "background", p.colors.background, 0.8, `page background ${staticNote}`);
  add("color", "text", p.colors.text, 0.75, `body text color ${staticNote}`);
  p.colors.brandCandidates.forEach((hex, i) =>
    add("color", "brand_candidate", hex, i === 0 ? 0.6 : 0.45, `ranked #${i + 1} by use on buttons, links and brand-named variables`),
  );
  add("color", "scheme", p.colors.scheme, p.colors.background ? 0.8 : 0.3, "from background lightness");
  add("color", "supports_dark_mode", p.colors.supportsDarkMode, 0.8, "prefers-color-scheme or dark theme selectors/tokens present");
  add("color", "unique_colors", p.colors.uniqueColorCount, 0.7, "distinct opaque colors declared", p.colors.uniqueColorCount);

  const fontConf = (role: string) => p.typography.fonts.find((f) => f.family === role)?.confidence ?? 0.5;
  if (p.typography.headingFont) add("font", "heading_font", p.typography.headingFont, fontConf(p.typography.headingFont), "most-used family on heading selectors/tokens");
  if (p.typography.bodyFont) add("font", "body_font", p.typography.bodyFont, fontConf(p.typography.bodyFont), "most-used family on body/root selectors/tokens");
  if (p.typography.monoFont) add("font", "mono_font", p.typography.monoFont, 0.7, "family on code/mono selectors/tokens");
  for (const f of p.typography.fonts.slice(0, 5)) add("font", "family_delivery", `${f.family}: ${f.delivery}`, 0.6, f.evidence.slice(0, 200));

  const t = p.typography;
  add("typography", "body_size_px", t.bodySizePx, 0.6, "median font-size on body/paragraph selectors", t.bodySizePx);
  for (const level of ["h1", "h2", "h3"] as const) {
    const v = t.headingSizesPx[level];
    add("typography", `${level}_size_px`, v, 0.55, `median (max of clamp) font-size on ${level} selectors`, v);
  }
  add("typography", "type_scale_ratio", t.typeScaleRatio, 0.45, "geometric mean of consecutive heading/body size ratios", t.typeScaleRatio);
  add("typography", "heading_weight", t.headingWeight, 0.55, "median font-weight on headings", t.headingWeight);
  add("typography", "body_line_height", t.bodyLineHeight, 0.55, "median line-height on body text", t.bodyLineHeight);
  add("typography", "heading_line_height", t.headingLineHeight, 0.5, "median line-height on headings", t.headingLineHeight);
  add("typography", "heading_letter_spacing_em", t.headingLetterSpacingEm, 0.5, "median heading letter-spacing", t.headingLetterSpacingEm);
  add("typography", "uppercase_labels", t.uppercaseLabels, 0.5, "uppercase text-transform on labels/badges/nav/buttons");

  add("spacing", "base_unit_px", p.spacing.baseUnitPx, 0.5, "≥60% of spacing values are multiples of this unit", p.spacing.baseUnitPx);
  add("spacing", "density", p.spacing.density, 0.35, "median padding/margin/gap value (rough proxy)");

  add("shape", "dominant_radius_px", p.shape.dominantRadiusPx, 0.55, "most frequent non-zero border-radius", p.shape.dominantRadiusPx);
  add("shape", "button_radius_px", p.shape.buttonRadiusPx, 0.6, "median radius on button selectors", p.shape.buttonRadiusPx);
  add("shape", "card_radius_px", p.shape.cardRadiusPx, 0.55, "median radius on card selectors", p.shape.cardRadiusPx);
  add("shape", "pill_buttons", p.shape.pillButtons, 0.55, "button radius ≥ 40px");

  add("elevation", "shadow_style", p.elevation.style, p.elevation.shadowCount > 3 ? 0.6 : 0.4, `${p.elevation.shadowCount} box-shadow declarations classified`);

  const width = p.layout.containerMaxWidthsPx[0];
  if (width) add("layout", "container_max_width_px", width.value, 0.5, `most common container max-width (${width.count} uses)`, width.value);
  for (const bp of p.layout.breakpointsPx.slice(0, 4)) add("layout", "breakpoint_px", bp.value, 0.7, `${bp.count} media queries`, bp.value);
  add("layout", "sticky_header", p.layout.stickyHeader, 0.5, "position sticky/fixed on header/nav selectors");

  add("effects", "gradients", p.effects.gradients, 0.6, "gradient declarations", p.effects.gradients);
  add("effects", "backdrop_blur", p.effects.backdropBlur, 0.7, "backdrop-filter: blur declarations", p.effects.backdropBlur);
  add("effects", "reduced_motion_support", p.effects.reducedMotionSupport, 0.8, "prefers-reduced-motion media query present");
  add("effects", "keyframes", p.effects.keyframes, 0.8, "@keyframes rules", p.effects.keyframes);

  if (p.sourceKind === "website") {
    add("structure", "hero_has_media", p.structure.heroHasMedia, 0.35, "img/video/large svg near the first h1 (approximate)");
    add("structure", "hero_cta_count", p.structure.heroCtaCount, 0.35, "button-like links near the first h1 (approximate)", p.structure.heroCtaCount);
    add("structure", "h1_word_count", p.structure.h1WordCount, 0.7, "words in the first h1 (text itself not stored)", p.structure.h1WordCount);
    add("structure", "icon_libraries", p.structure.iconLibraries.join(", "), 0.5, "class-name and script hints");
    add("accessibility", "lang_attribute", p.accessibility.langAttribute, 0.95, "<html lang> present");
    add("accessibility", "viewport_zoom_blocked", p.accessibility.viewportZoomBlocked, 0.9, "viewport meta disables zoom");
    if (p.accessibility.imagesTotal > 0) {
      const ratio = Math.round((p.accessibility.imagesMissingAlt / p.accessibility.imagesTotal) * 100) / 100;
      add("accessibility", "images_missing_alt_ratio", ratio, 0.85, `${p.accessibility.imagesMissingAlt}/${p.accessibility.imagesTotal} <img> without alt in initial HTML`, ratio);
    }
    add("accessibility", "skip_link", p.accessibility.skipLink, 0.6, "in-page skip link detected");
    add("tech", "frameworks", [...p.tech.frameworks, ...p.tech.cssFrameworks].join(", "), 0.6, "script paths, class patterns and CSS variables");
  }
  add("accessibility", "body_text_contrast", p.accessibility.bodyTextContrast, 0.6, "WCAG ratio of declared body text on page background", p.accessibility.bodyTextContrast);
  add("accessibility", "focus_visible_styles", p.accessibility.focusVisibleStyles, 0.6, ":focus/:focus-visible outline or ring declared");
  return out;
}
