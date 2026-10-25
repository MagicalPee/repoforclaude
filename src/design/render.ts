import type { DesignSystemSpec } from "./generator.js";

const bullet = (items: string[]) => items.filter(Boolean).map((i) => `- ${i}`).join("\n");

function colorTable(spec: DesignSystemSpec, mode: "light" | "dark"): string {
  const theme = spec.color[mode];
  if (!theme) return "";
  const rows = Object.entries(theme).map(([k, v]) => `| \`--color-${k}\` | \`${v.hex}\` | ${v.usage} |`);
  return `**${mode === "light" ? "Light" : "Dark"} theme**\n\n| Token | Value | Use |\n|---|---|---|\n${rows.join("\n")}`;
}

/** Human-and-model-readable rendering of a spec. `compact` omits the token CSS. */
export function renderSpecMarkdown(spec: DesignSystemSpec, options: { compact?: boolean } = {}): string {
  const d = spec.direction;
  const ty = spec.typography;
  const parts: string[] = [];
  parts.push(`# UI design system: ${d.concept}`);
  parts.push(
    `Spec \`${spec.id}\`${spec.reused ? " (reused: this project already has a design system from design-intelligence; pass redesign=true for a new direction)" : ""}. Category **${spec.project.category}**${spec.project.secondaryCategory ? ` (+${spec.project.secondaryCategory})` : ""}, ${spec.project.websiteType}. Confidence ${spec.confidence.overall}.`,
  );
  if (spec.existingDesignSystem.preserved) {
    parts.push(`> Existing design system preserved: ${spec.existingDesignSystem.preservedValues.join("; ")}. New tokens alias existing variables where values match.`);
  }
  parts.push(`## Direction: ${d.name}\n${d.description}\n\n**Mood:** ${d.mood.join(", ")} · **Personality:** ${d.personality.join(", ")}`);
  parts.push(`**Why it fits**\n${bullet(d.whyItFits)}`);
  parts.push(`**Research evidence**\n${bullet(d.researchEvidence)}`);
  parts.push(`**Signature moves**\n${bullet(d.signatureMoves)}`);
  parts.push(`**Adopt**\n${bullet(d.patternsToAdopt.slice(0, 7))}\n\n**Avoid**\n${bullet(d.patternsToAvoid.slice(0, 8))}`);
  parts.push(`**Originality:** ${d.originalityStrategy}`);
  if (d.alternativesConsidered.length) {
    parts.push(`**Alternatives considered**\n${bullet(d.alternativesConsidered.map((a) => `${a.name} — ${a.whyNotChosen}`))}`);
  }

  parts.push(`## Color\n${bullet(spec.color.rationale)}\n\nModes: ${spec.color.modes.join(" + ")} (default ${spec.color.defaultMode}).`);
  parts.push(colorTable(spec, spec.color.defaultMode));
  if (spec.color.modes.length > 1) parts.push(colorTable(spec, spec.color.defaultMode === "light" ? "dark" : "light"));
  const failing = spec.color.contrast.filter((c) => !c.pass);
  parts.push(
    `**Contrast:** ${spec.color.contrast.length - failing.length}/${spec.color.contrast.length} checked pairs pass. ` +
      spec.color.contrast
        .filter((c) => ["text", "text-muted", "on-cta", "on-primary", "link", "border-strong", "focus-ring"].includes(c.foreground) && ["background", "primary", "cta"].includes(c.background))
        .map((c) => `${c.mode} ${c.foreground}/${c.background} ${c.ratio}:1`)
        .join(", "),
  );
  parts.push(`**Color rules**\n${bullet([...spec.color.rules, ...spec.color.warnings])}`);

  parts.push(
    `## Typography\n- Headings: **${ty.heading.family}** (${ty.heading.classification}, ${ty.heading.source}) — ${ty.heading.reason}\n- Body: **${ty.body.family}** (${ty.body.classification}) — ${ty.body.reason}\n- Mono: **${ty.mono.family}** (${ty.monoUse})\n- Licensing: ${ty.heading.license}\n- Scale: ${ty.scale.basePx}px × ${ty.scale.ratio}; weights ${Object.entries(ty.weights).map(([k, v]) => `${k} ${v}`).join(", ")}${ty.sourcing.googleFontsUrl ? `\n- Google Fonts: ${ty.sourcing.googleFontsUrl}` : ""}`,
  );
  const styleRows = Object.entries(ty.styles).map(
    ([k, s]) => `| ${k} | ${s.fontFamily} | ${s.size} | ${s.weight} | ${s.lineHeight} | ${s.letterSpacing}${s.textTransform ? ", upper" : ""} |`,
  );
  parts.push(`| Style | Font | Size | Weight | Line height | Tracking |\n|---|---|---|---|---|---|\n${styleRows.join("\n")}`);
  parts.push(bullet(ty.rules));

  parts.push(
    `## Spacing & layout\n- Spacing: 4px base, density **${spec.spacing.density}**; card padding ${spec.spacing.semantic["card-padding"]}, card gap ${spec.spacing.semantic["card-gap"]}\n- Container ${spec.layout.containerMaxWidth}, reading width ${spec.layout.readingWidth}, page padding ${spec.layout.pagePadding.mobile} → ${spec.layout.pagePadding.desktop}\n- Grid ${spec.layout.grid.columns.mobile}/${spec.layout.grid.columns.tablet}/${spec.layout.grid.columns.desktop} columns, gutter ${spec.layout.grid.gutter.desktop}; section spacing ${spec.layout.sectionSpacing.mobile} → ${spec.layout.sectionSpacing.desktop}\n${bullet(spec.layout.rules)}`,
  );
  parts.push(
    `## Shape & surfaces\n- Radius: ${Object.entries(spec.shape.radius).map(([k, v]) => `${k} ${v}`).join(", ")}\n- Components: ${Object.entries(spec.shape.componentRadius).map(([k, v]) => `${k} ${v}`).join(", ")}\n- Elevation: ${spec.shape.elevationStyle}; surfaces: ${spec.shape.surfaceTreatment}\n${bullet(spec.shape.rules)}`,
  );
  parts.push(
    `## Motion\n- Level ${spec.motion.level}; durations ${Object.entries(spec.motion.durations).map(([k, v]) => `${k} ${v}`).join(", ")}; easing ${spec.motion.easing.standard}\n- Hover: ${spec.motion.hover}\n${bullet(spec.motion.rules)}`,
  );
  parts.push(`## Iconography\n${spec.iconography.style} icons, ${spec.iconography.stroke}px stroke — ${spec.iconography.suggestion}`);

  const mandatory = Object.entries(spec.components).filter(([, c]) => c.mandatory);
  const optional = Object.entries(spec.components).filter(([, c]) => !c.mandatory);
  const compLines = mandatory.map(([name, c]) => {
    const variants = c.variants ? Object.keys(c.variants).join(", ") : "";
    const base = Object.entries(c.base)
      .slice(0, 6)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    return `- **${name}** — ${c.purpose} Base: ${base}.${variants ? ` Variants: ${variants}.` : ""} States: ${Object.keys(c.states).join(", ") || "n/a"}. ${c.notes[0] ?? ""}`;
  });
  parts.push(`## Components (mandatory for this ${spec.project.websiteType})\n${compLines.join("\n")}\n\nAlso specified as reusable defaults: ${optional.map(([n]) => n).join(", ")} (full rules in the JSON spec / get_design_tokens).`);
  parts.push(`## Responsive\n${bullet(spec.responsive)}\n\n## Accessibility\n${bullet(spec.accessibility)}`);

  const impl = spec.implementation;
  parts.push(`## Implementation (${impl.framework}, ${impl.styling})\nToken file: \`${impl.tokenFile}\`\n${impl.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  for (const [name, code] of Object.entries(impl.snippets)) parts.push(`\`${name}\`\n\`\`\`${name.endsWith(".css") || name.includes("aliases") ? "css" : name.includes("html") ? "html" : "ts"}\n${code}\n\`\`\``);
  if (!options.compact) {
    parts.push(`## tokens.css\n\`\`\`css\n${spec.tokens.css}\`\`\``);
    if (spec.tokens.tailwindV4) parts.push(`## Tailwind v4 theme\n\`\`\`css\n${spec.tokens.tailwindV4}\`\`\``);
    if (spec.tokens.tailwindV3) parts.push(`## Tailwind v3 config\n\`\`\`js\n${spec.tokens.tailwindV3}\`\`\``);
  } else {
    parts.push("Token CSS omitted (compact mode): call get_design_tokens with this spec id and format \"css\".");
  }
  parts.push(`## Validation & confidence\n${spec.validation.summary} (score ${spec.validation.score}/100).\n${bullet(spec.validation.issues.filter((i) => i.severity !== "info").map((i) => i.message))}\n${bullet(spec.confidence.notes)}\n\n_${spec.evidence.note}_`);
  return parts.filter(Boolean).join("\n\n");
}
