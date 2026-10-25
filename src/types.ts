// Shared domain types. Evidence types describe what was observed; recommendation types
// (design specs) live in src/design and never feed back into evidence tables.

export const CATEGORIES = [
  { id: "saas-b2b", label: "SaaS & B2B", description: "Business software sold to teams and companies." },
  { id: "ai-products", label: "AI products", description: "Products whose core value is an AI model or agent." },
  { id: "ecommerce", label: "E-commerce & retail", description: "Online stores and direct-to-consumer brands." },
  { id: "developer-tools", label: "Technology & developer tools", description: "Tools, platforms and infrastructure for developers." },
  { id: "fintech", label: "Finance & fintech", description: "Banking, payments, investing, insurance and crypto." },
  { id: "portfolio", label: "Creative portfolios", description: "Personal sites of designers, photographers and artists." },
  { id: "agency", label: "Agencies & studios", description: "Design, branding, motion and development studios." },
  { id: "gaming", label: "Gaming", description: "Game studios, game launches, platforms and esports." },
  { id: "media-editorial", label: "Media & editorial", description: "News, magazines, publishing and long-form reading." },
  { id: "education", label: "Education", description: "Learning platforms, courses, schools and universities." },
  { id: "landing-conversion", label: "Landing pages & conversion", description: "Single-goal marketing and launch pages." },
  { id: "productivity", label: "Productivity apps", description: "Notes, tasks, calendars, docs and collaboration tools." },
  { id: "community-social", label: "Communities & social", description: "Social networks, forums and community platforms." },
  { id: "luxury-premium", label: "Premium & luxury brands", description: "Fashion, jewellery, automotive and premium goods." },
  { id: "health-wellness", label: "Health & wellness", description: "Healthcare, fitness, mental health and wellbeing." },
  { id: "food-hospitality", label: "Food, hospitality & travel", description: "Restaurants, food brands, hotels and travel." },
  { id: "public-sector", label: "Public sector & nonprofit", description: "Government services, civic tech and charities." },
  { id: "reference-frameworks", label: "Reference UI frameworks", description: "General-purpose UI frameworks used as neutral baselines; excluded from category conventions." },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as CategoryId[];

export function isCategoryId(value: string): value is CategoryId {
  return (CATEGORY_IDS as string[]).includes(value);
}

export type SourceKind = "website" | "design_system";

export type ColorRole =
  | "background"
  | "surface"
  | "text"
  | "brand"
  | "accent"
  | "cta"
  | "border"
  | "link"
  | "gradient"
  | "theme-color"
  | "status"
  | "other";

export type HueFamily =
  | "neutral"
  | "red"
  | "orange"
  | "yellow"
  | "lime"
  | "green"
  | "teal"
  | "cyan"
  | "blue"
  | "indigo"
  | "violet"
  | "magenta"
  | "pink";

export type FontClass =
  | "geometric-sans"
  | "neo-grotesque"
  | "grotesque"
  | "humanist-sans"
  | "rounded-sans"
  | "transitional-serif"
  | "old-style-serif"
  | "didone"
  | "slab-serif"
  | "display-serif"
  | "monospace"
  | "condensed-sans"
  | "display"
  | "system"
  | "unknown";

export type FontDelivery = "google-fonts" | "adobe-fonts" | "self-hosted" | "system" | "unknown";

export interface ColorEvidence {
  hex: string;
  role: ColorRole;
  frequency: number;
  confidence: number;
  evidence: string;
}

export interface FontEvidence {
  family: string;
  normalized: string;
  role: "heading" | "body" | "mono" | "display" | "declared";
  classification: FontClass;
  delivery: FontDelivery;
  frequency: number;
  confidence: number;
  evidence: string;
}

export interface ComponentEvidence {
  component: "button" | "input" | "card" | "nav" | "badge" | "link" | "table" | "dialog";
  property: string;
  value: string;
  confidence: number;
  evidence: string;
}

export interface ValueCount {
  value: number;
  count: number;
}

/** Everything observable from one source, without rendering it. */
export interface SiteProfile {
  sourceKind: SourceKind;
  url: string;
  finalUrl: string;
  fetchedAt: string;
  meta: {
    title?: string;
    lang?: string;
    themeColor?: string;
    viewport?: string;
  };
  colors: {
    palette: ColorEvidence[];
    background?: string;
    text?: string;
    brandCandidates: string[];
    scheme: "light" | "dark" | "unknown";
    supportsDarkMode: boolean;
    customPropertyColorCount: number;
    uniqueColorCount: number;
  };
  typography: {
    fonts: FontEvidence[];
    headingFont?: string;
    bodyFont?: string;
    monoFont?: string;
    bodySizePx?: number;
    headingSizesPx: Partial<Record<"h1" | "h2" | "h3" | "h4" | "h5" | "h6", number>>;
    typeScaleRatio?: number;
    headingWeight?: number;
    bodyLineHeight?: number;
    headingLineHeight?: number;
    headingLetterSpacingEm?: number;
    uppercaseLabels: boolean;
    distinctFontSizes: number;
  };
  spacing: {
    baseUnitPx?: number;
    commonValuesPx: ValueCount[];
    density?: "compact" | "comfortable" | "airy";
  };
  shape: {
    radiiPx: ValueCount[];
    dominantRadiusPx?: number;
    buttonRadiusPx?: number;
    cardRadiusPx?: number;
    pillButtons: boolean;
    borderWidthsPx: ValueCount[];
  };
  elevation: {
    shadowCount: number;
    style: "none" | "subtle" | "pronounced" | "layered" | "hard-offset";
  };
  layout: {
    containerMaxWidthsPx: ValueCount[];
    breakpointsPx: ValueCount[];
    gridDeclarations: number;
    flexDeclarations: number;
    stickyHeader: boolean;
  };
  effects: {
    gradients: number;
    backdropBlur: number;
    keyframes: number;
    transitionDurationsMs: ValueCount[];
    easings: string[];
    reducedMotionSupport: boolean;
  };
  components: ComponentEvidence[];
  structure: {
    headings: Record<"h1" | "h2" | "h3" | "h4" | "h5" | "h6", number>;
    sections: number;
    navs: number;
    forms: number;
    buttons: number;
    images: number;
    svgs: number;
    videos: number;
    iconLibraries: string[];
    heroHasMedia?: boolean;
    heroCtaCount?: number;
    h1WordCount?: number;
  };
  accessibility: {
    langAttribute: boolean;
    viewportZoomBlocked: boolean;
    imagesMissingAlt: number;
    imagesTotal: number;
    bodyTextContrast?: number;
    focusVisibleStyles: boolean;
    outlineNoneCount: number;
    skipLink: boolean;
    reducedMotion: boolean;
    h1Count: number;
  };
  tech: {
    frameworks: string[];
    cssFrameworks: string[];
  };
  limitations: string[];
}

export interface StyleClassification {
  colorMode: "light" | "dark" | "unknown";
  paletteCharacter: "monochrome" | "restrained" | "vivid" | "pastel" | "multi-accent" | "unknown";
  accentHueFamily: HueFamily | "unknown";
  neutralTemperature: "warm" | "cool" | "neutral" | "unknown";
  headingClass: FontClass;
  bodyClass: FontClass;
  typeContrast: "low" | "medium" | "high" | "unknown";
  radiusFamily: "sharp" | "soft" | "rounded" | "pill" | "unknown";
  elevation: SiteProfile["elevation"]["style"];
  density: "compact" | "comfortable" | "airy" | "unknown";
  motion: "minimal" | "subtle" | "expressive" | "unknown";
  gradientUse: "none" | "light" | "heavy";
  glass: boolean;
  styleTags: string[];
  confidence: number;
}
