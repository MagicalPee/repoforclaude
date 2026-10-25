import type { DesignDirection } from "../knowledge/directions.js";
import type { WebsiteType } from "./inference.js";

export interface ComponentSpec {
  mandatory: boolean;
  purpose: string;
  base: Record<string, string>;
  variants?: Record<string, Record<string, string>>;
  sizes?: Record<string, Record<string, string>>;
  states: Record<string, Record<string, string>>;
  notes: string[];
}

const MANDATORY: Record<WebsiteType, string[]> = {
  "landing-page": ["button", "navigation", "card", "input", "badge", "loading", "emptyState"],
  "marketing-site": ["button", "navigation", "card", "input", "badge", "dropdown", "alert"],
  "web-app": ["button", "input", "select", "checkbox", "card", "navigation", "dropdown", "dialog", "table", "badge", "tooltip", "alert", "loading", "emptyState"],
  dashboard: ["button", "input", "select", "checkbox", "card", "navigation", "dropdown", "dialog", "table", "badge", "tooltip", "alert", "loading", "emptyState"],
  "ecommerce-store": ["button", "navigation", "card", "input", "select", "badge", "dialog", "alert", "loading"],
  portfolio: ["button", "navigation", "card"],
  "blog-editorial": ["button", "navigation", "card", "input", "badge"],
  documentation: ["navigation", "input", "table", "alert", "badge", "tooltip", "card"],
  community: ["button", "input", "card", "navigation", "dropdown", "dialog", "badge", "tooltip", "loading", "emptyState"],
};

export function generateComponents(
  d: DesignDirection,
  websiteType: WebsiteType,
  density: "compact" | "comfortable" | "airy",
): Record<string, ComponentSpec> {
  const mandatory = new Set(MANDATORY[websiteType]);
  const m = (name: string) => mandatory.has(name);
  const heights = density === "compact" ? { sm: "32px", md: "36px", lg: "44px" } : density === "airy" ? { sm: "36px", md: "44px", lg: "52px" } : { sm: "32px", md: "40px", lg: "48px" };
  const hard = d.shape.elevation === "hard-offset";
  const borderW = `${d.shape.borderWidth}px`;
  const upper = d.type.uppercaseLabels && d.id !== "precision-instrument";
  const pressedTransform = hard ? "translate(2px, 2px)" : d.motion.level === "expressive" ? "scale(0.98)" : "none";
  const hoverTransform = hard ? "translate(-1px, -1px)" : "none";

  const focus = { outline: "2px solid var(--color-focus-ring)", "outline-offset": "2px" };
  return {
    button: {
      mandatory: m("button"),
      purpose: "Actions. One primary per view region.",
      base: {
        display: "inline-flex",
        "align-items": "center",
        "justify-content": "center",
        gap: "var(--space-2)",
        "font-family": "var(--font-body)",
        "font-weight": "600",
        "font-size": "var(--text-button)",
        "letter-spacing": upper ? "0.04em" : "0",
        "text-transform": upper ? "uppercase" : "none",
        "line-height": "1",
        "border-radius": "var(--radius-button)",
        border: `${borderW} solid transparent`,
        transition: "var(--transition-interactive)",
        cursor: "pointer",
        "white-space": "nowrap",
      },
      variants: {
        primary: { background: "var(--color-cta)", color: "var(--color-on-cta)", ...(hard ? { "border-color": "var(--color-text)", "box-shadow": "var(--shadow-sm)" } : {}) },
        secondary: { background: "transparent", color: "var(--color-text)", "border-color": "var(--color-border-strong)", ...(hard ? { "box-shadow": "var(--shadow-sm)", "border-color": "var(--color-text)" } : {}) },
        tonal: { background: "var(--color-primary-subtle)", color: "var(--color-on-primary-subtle)" },
        ghost: { background: "transparent", color: "var(--color-text)" },
        destructive: { background: "var(--color-error)", color: "#ffffff" },
        link: { background: "none", color: "var(--color-link)", "text-decoration": "underline", "text-underline-offset": "0.2em", padding: "0", height: "auto" },
      },
      sizes: {
        sm: { height: heights.sm, padding: "0 var(--space-3)", "font-size": "var(--text-sm)" },
        md: { height: heights.md, padding: "0 var(--space-5)" },
        lg: { height: heights.lg, padding: "0 var(--space-6)", "font-size": "var(--text-lg)" },
      },
      states: {
        hover: { "primary.background": "var(--color-cta-hover)", "secondary.background": "var(--color-surface-sunken)", "ghost.background": "var(--color-surface-sunken)", transform: hoverTransform, ...(hard ? { "box-shadow": "var(--shadow-md)" } : {}) },
        active: { transform: pressedTransform, ...(hard ? { "box-shadow": "none" } : {}) },
        "focus-visible": focus,
        disabled: { opacity: "0.45", cursor: "not-allowed", "box-shadow": "none", transform: "none" },
        loading: { "pointer-events": "none", "aria-busy": "true", content: "spinner replaces the leading icon; keep label width" },
      },
      notes: [
        "Minimum touch target 44×44px: on mobile use size md or larger, or extend the hit area with padding.",
        "Icon-only buttons need aria-label and a square footprint equal to the height.",
        d.color.cta === "ink" ? "The primary action uses the ink fill (--color-cta); the brand color is reserved for focus, links and highlights." : "The primary action uses the brand fill (--color-cta).",
      ],
    },
    input: {
      mandatory: m("input"),
      purpose: "Text inputs and textareas.",
      base: {
        height: heights.md,
        padding: "0 var(--space-control-padding-x)",
        background: "var(--color-surface)",
        color: "var(--color-text)",
        border: `${Math.max(1, d.shape.borderWidth)}px solid var(--color-border-strong)`,
        "border-radius": "var(--radius-input)",
        "font-size": "max(16px, var(--text-base))",
        transition: "var(--transition-interactive)",
      },
      variants: {
        textarea: { height: "auto", "min-height": "6rem", padding: "var(--space-2) var(--space-control-padding-x)", "line-height": "1.5", resize: "vertical" },
        search: { "padding-left": "2.5rem", "background-position": "0.875rem center" },
      },
      states: {
        hover: { "border-color": "var(--color-text-muted)" },
        "focus-visible": { ...focus, "border-color": "var(--color-primary)" },
        invalid: { "border-color": "var(--color-error)", "aria-invalid": "true" },
        disabled: { background: "var(--color-surface-sunken)", color: "var(--color-text-subtle)", cursor: "not-allowed" },
        placeholder: { color: "var(--color-text-subtle)" },
      },
      notes: [
        "Visible <label> above every field; placeholders are examples, never labels.",
        "Font size ≥16px on inputs prevents iOS zoom-on-focus.",
        "Help and error text sit below the field (--text-small) and are linked with aria-describedby.",
      ],
    },
    select: {
      mandatory: m("select"),
      purpose: "Native select styled to match inputs.",
      base: { appearance: "none", height: heights.md, padding: "0 2.25rem 0 var(--space-control-padding-x)", background: "var(--color-surface)", border: `1px solid var(--color-border-strong)`, "border-radius": "var(--radius-input)", color: "var(--color-text)" },
      states: { "focus-visible": focus, disabled: { opacity: "0.6" } },
      notes: ["Keep the native <select> for accessibility; draw the chevron with a background SVG in --color-text-muted."],
    },
    checkbox: {
      mandatory: m("checkbox"),
      purpose: "Checkboxes, radios and switches.",
      base: { width: "1.125rem", height: "1.125rem", "accent-color": "var(--color-primary)", "border-radius": d.shape.radius[1] === 0 ? "0" : "var(--radius-xs)" },
      variants: {
        radio: { "border-radius": "9999px" },
        switch: { width: "2.25rem", height: "1.25rem", "border-radius": "9999px", background: "var(--color-border-strong)", "checked.background": "var(--color-primary)" },
      },
      states: { "focus-visible": focus, checked: { background: "var(--color-primary)", color: "var(--color-on-primary)" }, disabled: { opacity: "0.45" } },
      notes: ["Use accent-color for native controls where custom drawing is unnecessary.", "Labels are clickable and at least 44px tall including padding."],
    },
    card: {
      mandatory: m("card"),
      purpose: websiteType === "ecommerce-store" ? "Product cards." : websiteType === "portfolio" ? "Project tiles." : "Grouped content and features.",
      base: {
        background: d.shape.surface === "tinted" ? "var(--color-surface-sunken)" : "var(--color-surface)",
        border: d.shape.surface === "bordered" || hard ? `${borderW} solid ${hard ? "var(--color-text)" : "var(--color-border)"}` : "none",
        "border-radius": "var(--radius-card)",
        padding: "var(--space-card-padding)",
        "box-shadow": d.shape.surface === "elevated" || hard ? "var(--shadow-sm)" : "none",
      },
      variants: {
        interactive: { cursor: "pointer", transition: "var(--transition-interactive), var(--transition-transform)" },
        ...(websiteType === "ecommerce-store"
          ? { product: { padding: "0", "image.aspect-ratio": "4 / 5", "title.lines": "2 (line-clamp)", "price.font-variant-numeric": "tabular-nums", "price.font-weight": "600" } }
          : {}),
      },
      states: {
        hover: d.motion.level === "minimal" ? { "border-color": "var(--color-border-strong)" } : hard ? { transform: "translate(-2px, -2px)", "box-shadow": "var(--shadow-md)" } : { "box-shadow": "var(--shadow-md)", transform: d.shape.elevation === "flat" ? "none" : "translateY(-2px)" },
        "focus-within": focus,
      },
      notes: ["Make the whole card clickable via a stretched link on the title, not a wrapping <a> around block content.", "Choose one treatment (border, shadow or tint), not all three."],
    },
    navigation: {
      mandatory: m("navigation"),
      purpose: websiteType === "dashboard" || websiteType === "web-app" || websiteType === "documentation" ? "Sidebar + top bar." : "Site header.",
      base: {
        height: density === "compact" ? "56px" : "64px",
        background: "var(--color-background)",
        "border-bottom": d.shape.surface === "flat" && d.shape.elevation !== "flat" ? "none" : "1px solid var(--color-border)",
        position: "sticky",
        top: "0",
        "z-index": "40",
      },
      variants: {
        link: { color: "var(--color-text-muted)", "font-weight": "500", "font-size": "var(--text-sm)", ...(upper ? { "text-transform": "uppercase", "letter-spacing": "0.08em" } : {}) },
        "link-active": { color: "var(--color-text)", "text-decoration": "underline", "text-decoration-color": "var(--color-primary)", "text-underline-offset": "6px", "text-decoration-thickness": "2px" },
        sidebar: { width: "248px", background: "var(--color-surface-sunken)", "border-right": "1px solid var(--color-border)" },
        "mobile-sheet": { position: "fixed", inset: "0", background: "var(--color-background)", padding: "var(--space-6)" },
      },
      states: { hover: { color: "var(--color-text)" }, "focus-visible": focus },
      notes: ["Below md, collapse links into a menu button that opens a full-height sheet; keep the primary CTA visible.", "Mark the current page with aria-current=\"page\"."],
    },
    dropdown: {
      mandatory: m("dropdown"),
      purpose: "Menus and popovers.",
      base: { background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", "border-radius": "var(--radius-dropdown)", "box-shadow": "var(--shadow-md)", padding: "var(--space-1)", "min-width": "12rem" },
      variants: { item: { padding: "var(--space-2) var(--space-3)", "border-radius": "var(--radius-sm)", color: "var(--color-text)" } },
      states: { "item-hover": { background: "var(--color-surface-sunken)" }, "item-focus-visible": focus, open: { animation: "fade + 4px translate, var(--duration-fast)" } },
      notes: ["Arrow-key navigation, Escape to close, focus returns to the trigger."],
    },
    dialog: {
      mandatory: m("dialog"),
      purpose: "Modal dialogs and drawers.",
      base: { background: "var(--color-surface-elevated)", "border-radius": "var(--radius-dialog)", "box-shadow": "var(--shadow-xl)", padding: "var(--space-6)", "max-width": "min(560px, calc(100vw - 32px))", border: hard ? `${borderW} solid var(--color-text)` : "none" },
      variants: { backdrop: { background: "rgb(0 0 0 / 0.5)" }, drawer: { "max-width": "420px", height: "100dvh", "border-radius": "0" } },
      states: { open: { animation: "opacity + scale(0.98→1), var(--duration-base) var(--ease-enter)" }, close: { animation: "opacity, var(--duration-fast) var(--ease-exit)" } },
      notes: ["Use the native <dialog> element with showModal(): it traps focus and handles Escape.", "Title in --text-h4; primary action right-aligned on desktop, full-width stacked on mobile."],
    },
    badge: {
      mandatory: m("badge"),
      purpose: "Status, tags and counts.",
      base: { display: "inline-flex", "align-items": "center", gap: "var(--space-1)", height: "1.5rem", padding: "0 var(--space-2)", "border-radius": "var(--radius-badge)", "font-size": "var(--text-xs)", "font-weight": "600", ...(upper ? { "text-transform": "uppercase", "letter-spacing": "0.06em" } : {}) },
      variants: {
        neutral: { background: "var(--color-surface-sunken)", color: "var(--color-text-muted)" },
        brand: { background: "var(--color-primary-subtle)", color: "var(--color-on-primary-subtle)" },
        success: { background: "var(--color-success-subtle)", color: "var(--color-success)" },
        warning: { background: "var(--color-warning-subtle)", color: "var(--color-warning)" },
        error: { background: "var(--color-error-subtle)", color: "var(--color-error)" },
      },
      states: {},
      notes: ["Badges carry text; a colored dot alone is not enough to convey status."],
    },
    tooltip: {
      mandatory: m("tooltip"),
      purpose: "Short supplementary labels.",
      base: { background: "var(--color-text)", color: "var(--color-text-inverse)", "font-size": "var(--text-xs)", padding: "var(--space-1-5) var(--space-2)", "border-radius": "var(--radius-tooltip)", "max-width": "240px" },
      states: { open: { "transition-delay": "400ms (hover), 0ms (focus)" } },
      notes: ["Show on hover and keyboard focus; never put essential information or interactive content in tooltips."],
    },
    table: {
      mandatory: m("table"),
      purpose: "Data tables.",
      base: { width: "100%", "border-collapse": "collapse", "font-size": density === "compact" ? "var(--text-sm)" : "var(--text-base)", "font-variant-numeric": "tabular-nums" },
      variants: {
        header: { background: "var(--color-surface-sunken)", color: "var(--color-text-muted)", "font-weight": "600", "text-align": "left", position: "sticky", top: "0" },
        cell: { padding: density === "compact" ? "var(--space-2) var(--space-3)" : "var(--space-3) var(--space-4)", "border-bottom": "1px solid var(--color-border)" },
        numeric: { "text-align": "right" },
      },
      states: { "row-hover": { background: "var(--color-surface-sunken)" }, "row-selected": { background: "var(--color-primary-subtle)" } },
      notes: ["Wrap wide tables in a horizontally scrollable container with a visible edge shadow on small screens."],
    },
    alert: {
      mandatory: m("alert"),
      purpose: "Inline messages and banners.",
      base: { display: "flex", gap: "var(--space-3)", padding: "var(--space-4)", "border-radius": "var(--radius-md)", border: "1px solid currentColor", "border-left-width": d.shape.surface === "flat" ? "4px" : "1px" },
      variants: {
        info: { background: "var(--color-info-subtle)", color: "var(--color-info)" },
        success: { background: "var(--color-success-subtle)", color: "var(--color-success)" },
        warning: { background: "var(--color-warning-subtle)", color: "var(--color-warning)" },
        error: { background: "var(--color-error-subtle)", color: "var(--color-error)" },
      },
      states: {},
      notes: ["Body text inside alerts stays --color-text; only the icon and title use the status color.", "Use role=\"alert\" only for urgent, dynamic errors; role=\"status\" otherwise."],
    },
    loading: {
      mandatory: m("loading"),
      purpose: "Skeletons and spinners.",
      base: { background: "var(--color-surface-sunken)", "border-radius": "var(--radius-sm)" },
      variants: {
        skeleton: { animation: d.motion.level === "minimal" ? "none" : "pulse 1.6s ease-in-out infinite (opacity 1 → 0.55)" },
        spinner: { width: "1rem", height: "1rem", border: "2px solid currentColor", "border-right-color": "transparent", "border-radius": "9999px", animation: "spin 700ms linear infinite" },
      },
      states: { "reduced-motion": { animation: "none" } },
      notes: ["Skeletons mirror the final layout geometry to avoid layout shift.", "Expose progress with aria-busy and a visually hidden status message."],
    },
    emptyState: {
      mandatory: m("emptyState"),
      purpose: "Empty, first-run and no-results screens.",
      base: { "text-align": d.layout.alignment === "centered" ? "center" : "left", padding: "var(--space-16) var(--space-6)", color: "var(--color-text-muted)", "max-width": "36rem" },
      variants: { title: { color: "var(--color-text)", "font-size": "var(--text-h4)" }, action: { "margin-top": "var(--space-6)" } },
      states: {},
      notes: ["Explain what goes here and offer one clear next action.", "Use a small icon or illustration in the system's icon style, not a large stock graphic."],
    },
  };
}
