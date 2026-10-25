import { toOklch } from "../analysis/color.js";
import type { DesignDirection } from "../knowledge/directions.js";
import type { WebsiteType } from "./inference.js";

export interface SpacingSpec {
  baseUnitPx: number;
  scale: Record<string, string>;
  density: "compact" | "comfortable" | "airy";
  semantic: Record<string, string>;
  rules: string[];
}

export interface LayoutSpec {
  containerMaxWidth: string;
  readingWidth: string;
  wideWidth: string;
  pagePadding: { mobile: string; tablet: string; desktop: string };
  grid: { columns: { mobile: number; tablet: number; desktop: number }; gutter: { mobile: string; tablet: string; desktop: string } };
  sectionSpacing: { mobile: string; desktop: string; fluid: string };
  breakpoints: Record<string, string>;
  alignment: DesignDirection["layout"]["alignment"];
  rules: string[];
}

export interface ShapeSpec {
  radius: Record<string, string>;
  componentRadius: Record<string, string>;
  borderWidth: { hairline: string; default: string; strong: string };
  shadows: Record<string, string>;
  elevationStyle: DesignDirection["shape"]["elevation"];
  surfaceTreatment: DesignDirection["shape"]["surface"];
  rules: string[];
}

export interface MotionSpec {
  level: "none" | "minimal" | "subtle" | "expressive";
  durations: Record<string, string>;
  easing: Record<string, string>;
  hover: string;
  transitions: Record<string, string>;
  reducedMotion: string;
  rules: string[];
}

const px = (n: number) => `${n}px`;

export function generateSpacing(direction: DesignDirection, density: SpacingSpec["density"]): SpacingSpec {
  // Keys follow the Tailwind convention: --space-N = N × 4px (0-5 = 2px, 1-5 = 6px).
  const values = [0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160];
  const scale: Record<string, string> = {};
  for (const v of values) scale[String(v / 4).replace(".", "-")] = v === 0 ? "0" : `${v / 16}rem`;
  const d = density;
  const pick = (compact: number, comfortable: number, airy: number) => px(d === "compact" ? compact : d === "airy" ? airy : comfortable);
  return {
    baseUnitPx: 4,
    scale,
    density,
    semantic: {
      "inline-xs": px(4),
      "inline-sm": px(8),
      "inline-md": pick(8, 12, 16),
      "stack-xs": px(4),
      "stack-sm": pick(8, 8, 12),
      "stack-md": pick(12, 16, 24),
      "stack-lg": pick(24, 32, 48),
      "card-padding": pick(16, 24, 32),
      "card-gap": pick(12, 24, 32),
      "control-padding-x": pick(12, 16, 20),
      "form-gap": pick(12, 16, 20),
      "section-gap": `${direction.layout.sectionSpacing[1]}px`,
    },
    rules: [
      "Every margin, padding and gap comes from the 4px-based scale; no arbitrary values.",
      `Density is ${density}: ${density === "compact" ? "tight internal padding, more content per screen" : density === "airy" ? "generous whitespace around fewer elements" : "balanced padding for marketing and app screens"}.`,
      "Space between related items is always smaller than space between groups (proximity before borders).",
    ],
  };
}

export function generateLayout(direction: DesignDirection, websiteType: WebsiteType): LayoutSpec {
  const max = websiteType === "dashboard" || websiteType === "web-app" ? Math.max(direction.layout.maxWidth, 1440) : direction.layout.maxWidth;
  const [mobile, desktop] = direction.layout.sectionSpacing;
  const slope = (desktop - mobile) / (1280 - 360);
  const intercept = mobile - slope * 360;
  return {
    containerMaxWidth: px(max),
    readingWidth: px(direction.layout.readingWidth),
    wideWidth: px(Math.min(max + 240, 1680)),
    pagePadding: { mobile: "16px", tablet: "24px", desktop: max >= 1400 ? "48px" : "32px" },
    grid: {
      columns: { mobile: 4, tablet: 8, desktop: 12 },
      gutter: { mobile: "16px", tablet: "20px", desktop: direction.layout.density === "compact" ? "20px" : "24px" },
    },
    sectionSpacing: {
      mobile: px(mobile),
      desktop: px(desktop),
      fluid: `clamp(${mobile / 16}rem, ${Math.round((intercept / 16) * 1000) / 1000}rem + ${Math.round(slope * 10000) / 100}vw, ${desktop / 16}rem)`,
    },
    breakpoints: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" },
    alignment: direction.layout.alignment,
    rules: [
      "Mobile-first: base styles target ≥360px wide screens; add min-width media queries at the breakpoints.",
      `Text containers max out at ${direction.layout.readingWidth}px (≈65ch); media and grids may use the full container.`,
      direction.layout.alignment === "asymmetric"
        ? "Use asymmetric column spans (e.g. 7/5, 8/4) on desktop; collapse to a single column below md."
        : direction.layout.alignment === "centered"
          ? "Center hero and section intros; keep body copy left-aligned for readability."
          : "Flush-left layout: headings, copy and CTAs share a strong left edge.",
      "Touch targets are at least 44×44px; on mobile, primary actions sit within thumb reach.",
      "No horizontal scrolling at any width ≥320px except intentional carousels/tables with visible affordance.",
    ],
  };
}

function rgbaFromHex(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

export function generateShape(direction: DesignDirection, shadowInk: string, glowColor: string, corners?: "sharp" | "rounded" | "pill"): ShapeSpec {
  let [xs, sm, md, lg, xl] = direction.shape.radius;
  let button = direction.shape.button;
  if (corners === "sharp") {
    [xs, sm, md, lg, xl] = [0, 0, 2, 2, 4];
    button = "none";
  } else if (corners === "rounded" && md < 8) {
    [xs, sm, md, lg, xl] = [4, 6, 10, 14, 20];
  } else if (corners === "pill") {
    button = "pill";
  }
  const radius = { none: "0", xs: px(xs), sm: px(sm), md: px(md), lg: px(lg), xl: px(xl), full: "9999px" };
  const buttonRadius = button === "pill" ? "9999px" : button === "none" ? "0" : radius[button];
  const ink = toOklch(shadowInk) ? shadowInk : "#111111";
  const s = (a: number) => rgbaFromHex(ink, a);
  const shadows: Record<string, string> = (() => {
    switch (direction.shape.elevation) {
      case "hard-offset":
        return {
          xs: `2px 2px 0 0 ${ink}`,
          sm: `3px 3px 0 0 ${ink}`,
          md: `4px 4px 0 0 ${ink}`,
          lg: `6px 6px 0 0 ${ink}`,
          xl: `8px 8px 0 0 ${ink}`,
          focus: "0 0 0 3px var(--color-focus-ring)",
        };
      case "glow":
        return {
          xs: `0 1px 0 0 ${s(0.4)}`,
          sm: `0 2px 8px -2px ${s(0.5)}`,
          md: `0 8px 24px -8px ${s(0.6)}`,
          lg: `0 16px 48px -12px ${s(0.7)}, 0 0 0 1px ${rgbaFromHex(glowColor, 0.25)}`,
          xl: `0 24px 64px -16px ${s(0.75)}, 0 0 32px -8px ${rgbaFromHex(glowColor, 0.35)}`,
          focus: "0 0 0 2px var(--color-background), 0 0 0 4px var(--color-focus-ring)",
        };
      case "layered":
        return {
          xs: `0 1px 2px ${s(0.06)}`,
          sm: `0 1px 2px ${s(0.06)}, 0 2px 6px ${s(0.06)}`,
          md: `0 2px 4px ${s(0.05)}, 0 6px 16px ${s(0.08)}`,
          lg: `0 4px 8px ${s(0.05)}, 0 12px 32px ${s(0.1)}`,
          xl: `0 8px 16px ${s(0.06)}, 0 24px 56px ${s(0.14)}`,
          focus: "0 0 0 2px var(--color-background), 0 0 0 4px var(--color-focus-ring)",
        };
      case "subtle":
        return {
          xs: `0 1px 1px ${s(0.05)}`,
          sm: `0 1px 2px ${s(0.07)}`,
          md: `0 4px 12px -2px ${s(0.1)}`,
          lg: `0 12px 28px -6px ${s(0.14)}`,
          xl: `0 24px 48px -12px ${s(0.18)}`,
          focus: "0 0 0 2px var(--color-background), 0 0 0 4px var(--color-focus-ring)",
        };
      default:
        return {
          xs: "none",
          sm: "none",
          md: `0 4px 12px -4px ${s(0.12)}`,
          lg: `0 12px 32px -8px ${s(0.16)}`,
          xl: `0 24px 56px -12px ${s(0.2)}`,
          focus: "0 0 0 2px var(--color-background), 0 0 0 4px var(--color-focus-ring)",
        };
    }
  })();
  const bw = direction.shape.borderWidth;
  return {
    radius,
    componentRadius: {
      button: buttonRadius,
      input: button === "pill" ? radius.md : buttonRadius === "9999px" ? radius.md : buttonRadius,
      card: radius.lg,
      dialog: radius.xl,
      badge: button === "pill" || direction.shape.radius[2] >= 8 ? "9999px" : radius.xs,
      tooltip: radius.sm,
      dropdown: radius.md,
    },
    borderWidth: { hairline: "1px", default: px(bw), strong: px(Math.max(2, bw)) },
    shadows,
    elevationStyle: direction.shape.elevation,
    surfaceTreatment: direction.shape.surface,
    rules: [
      direction.shape.elevation === "flat"
        ? "Structure comes from borders and surface steps; shadows only for floating layers (menus, dialogs, toasts)."
        : direction.shape.elevation === "hard-offset"
          ? "Hard offset shadows are part of the brand: interactive elements carry shadow-sm/md and press flat on :active."
          : "Elevation increases with interactivity and stacking: cards sm, dropdowns md, dialogs lg.",
      `Surfaces are ${direction.shape.surface}: ${
        direction.shape.surface === "bordered"
          ? "1px border in --color-border on --color-surface."
          : direction.shape.surface === "tinted"
            ? "tinted --color-surface-sunken or --color-primary-subtle fills without borders."
            : direction.shape.surface === "elevated"
              ? "--color-surface with shadow-sm; no border."
              : "no container chrome; group with whitespace and rules."
      }`,
      "Nested elements use a smaller radius than their container (inner radius = outer radius − padding, minimum 0).",
    ],
  };
}

export function generateMotion(direction: DesignDirection, noAnimation: boolean): MotionSpec {
  const [fast, base, slow] = direction.motion.durations;
  const level = noAnimation ? "minimal" : direction.motion.level;
  return {
    level,
    durations: { instant: "0ms", fast: `${noAnimation ? Math.min(fast, 100) : fast}ms`, base: `${noAnimation ? Math.min(base, 150) : base}ms`, slow: `${noAnimation ? Math.min(slow, 200) : slow}ms` },
    easing: {
      standard: direction.motion.easing,
      emphasized: direction.motion.emphasized,
      enter: "cubic-bezier(0, 0, 0.2, 1)",
      exit: "cubic-bezier(0.4, 0, 1, 1)",
    },
    hover: noAnimation ? "Color and background changes only, no movement." : direction.motion.hover,
    transitions: {
      interactive: "color, background-color, border-color, box-shadow, opacity var(--duration-fast) var(--ease-standard)",
      transform: "transform var(--duration-base) var(--ease-emphasized)",
      overlay: "opacity var(--duration-base) var(--ease-enter), transform var(--duration-base) var(--ease-enter)",
    },
    reducedMotion:
      "@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }",
    rules: [
      "Animate only opacity and transform for movement; color/background/border for state changes.",
      level === "expressive"
        ? "Entrance animations: fade + 8–16px translate, staggered 40–60ms, once per element, triggered on first view."
        : "No entrance animations on scroll; motion is reserved for feedback (hover, press, open/close).",
      "Overlays (menus, dialogs) enter with --ease-enter and exit faster with --ease-exit.",
      "Nothing auto-plays longer than 5 seconds without a pause control; respect prefers-reduced-motion everywhere.",
    ],
  };
}
