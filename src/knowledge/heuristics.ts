import type { PatternRecord } from "../db/store.js";
import type { CategoryId } from "../types.js";

// Curated design heuristics: craft guidance that complements (never replaces) measured
// evidence. Every entry is stored with origin "curated_heuristic" and moderate confidence,
// and is presented as guidance rather than as a fact about the dataset.

type Kind = PatternRecord["kind"];

function h(
  id: string,
  category: CategoryId | null,
  component: string | null,
  kind: Kind,
  name: string,
  description: string,
  keywords: string,
): PatternRecord {
  return {
    id: `heuristic:${id}`,
    origin: "curated_heuristic",
    kind,
    name,
    description,
    categoryId: category,
    component,
    dimension: null,
    value: null,
    keywords: keywords.split(" "),
    supportCount: 0,
    sampleSize: 0,
    share: null,
    lift: null,
    confidence: kind === "anti_pattern" ? 0.7 : 0.6,
    evidence: [],
    rationale: "Curated design heuristic (expert guidance); not measured from the research dataset.",
  };
}

export const HEURISTIC_PATTERNS: PatternRecord[] = [
  // ---------- SaaS & B2B ----------
  h("saas-proof-near-cta", "saas-b2b", "hero", "guideline", "Put proof next to the primary action", "Place customer logos, a short quote or a concrete metric within one scroll of the hero CTA; B2B buyers look for risk reduction before they click.", "saas b2b hero trust social-proof"),
  h("saas-product-ui-as-hero", "saas-b2b", "hero", "guideline", "Show the real product UI", "Use a cropped, legible product screenshot or a live-looking UI fragment instead of abstract 3D art; crop to one task so the type stays readable.", "saas b2b hero screenshot imagery"),
  h("saas-restrained-accent", "saas-b2b", null, "guideline", "One accent, many neutrals", "Reserve the saturated brand color for primary actions, focus and key data; build hierarchy from neutrals, weight and spacing.", "saas b2b color restraint"),
  h("saas-pricing-table", "saas-b2b", "pricing", "guideline", "Comparable pricing columns", "Keep plan cards the same height with aligned feature rows, highlight one recommended plan with a border or tinted surface rather than scale.", "saas pricing cards"),
  h("saas-docs-grade-type", "saas-b2b", "typography", "guideline", "Body text built for scanning", "15–17px body, 1.5–1.6 line height, 60–75 character measure for marketing copy; use tabular numerals in tables and metrics.", "saas typography readability"),

  // ---------- AI products ----------
  h("ai-avoid-purple-glow", "ai-products", null, "anti_pattern", "Avoid the default purple-gradient AI look", "Violet-to-blue gradients, glowing orbs and sparkle icons are now the most generic AI signal. Pick a palette from the product's domain (research, legal, audio, code) instead.", "ai gradient purple generic cliche"),
  h("ai-show-outputs", "ai-products", "hero", "guideline", "Show real inputs and outputs", "Demonstrate the product with a concrete prompt and its actual result, typeset like the product renders it; it builds more trust than abstract visuals.", "ai hero demo trust"),
  h("ai-mono-for-machine", "ai-products", "typography", "guideline", "Monospace marks machine output", "Use a monospace or tabular face for prompts, tokens, logs and model names so human and machine text are distinguishable.", "ai typography monospace"),
  h("ai-calm-trust", "ai-products", null, "guideline", "Calm, legible surfaces for enterprise AI", "For enterprise or regulated buyers favour high-contrast neutrals, serif or grotesk headlines and documented limitations over spectacle.", "ai enterprise trust"),

  // ---------- E-commerce ----------
  h("ecom-consistent-cards", "ecommerce", "card", "guideline", "Uniform product cards", "Fix the image aspect ratio (4:5 or 1:1), clamp titles to two lines, align prices on a shared baseline; inconsistency reads as low quality.", "ecommerce product card grid"),
  h("ecom-price-legibility", "ecommerce", "typography", "guideline", "Readable, tabular prices", "Set prices one weight heavier than body text with tabular numerals; show sale and original prices with color plus strike-through, never color alone.", "ecommerce price typography accessibility"),
  h("ecom-buy-button-distinct", "ecommerce", "button", "guideline", "A purchase action that owns its color", "The add-to-bag button should be the highest-contrast element on the product page and its color should not be reused for decoration.", "ecommerce cta button color"),
  h("ecom-photography-first", "ecommerce", null, "guideline", "Let photography carry the brand", "Neutral surfaces and quiet UI chrome so product photography supplies the color; put brand color in small, repeated accents.", "ecommerce imagery neutral"),
  h("ecom-trust-near-buy", "ecommerce", "form", "guideline", "Trust signals at the decision point", "Shipping, returns and payment options belong directly under the buy button, set in small but high-contrast text.", "ecommerce checkout trust"),

  // ---------- Developer tools ----------
  h("dev-density", "developer-tools", null, "guideline", "Higher information density", "Developers tolerate and prefer denser layouts: 14–15px UI text, 4px spacing base, compact tables and code blocks with real syntax.", "developer density typography"),
  h("dev-code-is-hero", "developer-tools", "hero", "guideline", "Code is the hero image", "A short, copy-pasteable snippet or CLI transcript sells a developer tool better than illustration. Use a real monospace with clear 0/O and 1/l.", "developer hero code"),
  h("dev-dark-optional", "developer-tools", null, "guideline", "Offer dark mode, do not force it", "Dark UIs are common in developer tools, but docs and long reading benefit from a light theme; ship both and follow prefers-color-scheme.", "developer dark-mode"),
  h("dev-precise-borders", "developer-tools", "card", "guideline", "Hairline borders over shadows", "1px borders and subtle surface steps give structure in data-heavy UIs; shadows are reserved for floating layers.", "developer borders surfaces"),

  // ---------- Fintech ----------
  h("fin-trust-palette", "fintech", null, "guideline", "Trust without defaulting to bank blue", "Deep greens, inks and teals read as stable and avoid the saturated bank-blue cliché; keep red strictly for losses and errors.", "fintech color trust"),
  h("fin-tabular-numbers", "fintech", "typography", "guideline", "Tabular numerals everywhere money appears", "Use font-variant-numeric: tabular-nums for balances, tables and charts so digits align; right-align numeric columns.", "fintech numbers typography tables"),
  h("fin-gain-loss-not-color-only", "fintech", null, "guideline", "Gains and losses need more than color", "Pair green/red with +/− signs, arrows or labels; around 8% of men have red-green color vision deficiency.", "fintech accessibility color"),
  h("fin-security-cues", "fintech", "form", "guideline", "Quiet, explicit security cues", "Show security and regulation details in plain text near sign-up and money movement; avoid padlock clip-art.", "fintech trust forms"),

  // ---------- Portfolio ----------
  h("portfolio-work-first", "portfolio", null, "guideline", "Work before biography", "Lead with two or three strongest projects at large size; keep navigation minimal so the work sets the visual tone.", "portfolio layout work"),
  h("portfolio-signature-type", "portfolio", "typography", "guideline", "One signature typographic move", "A distinctive display face, extreme scale contrast or unusual layout is expected here—but keep body text conventional and readable.", "portfolio typography expressive"),
  h("portfolio-motion-respect", "portfolio", "motion", "guideline", "Expressive motion with an off switch", "Scroll and page transitions are welcome in portfolios; honour prefers-reduced-motion and never block content behind animation.", "portfolio motion accessibility"),

  // ---------- Agency ----------
  h("agency-case-study-grid", "agency", "card", "guideline", "Case studies as large, varied tiles", "Mix tile sizes and aspect ratios in an editorial grid; consistent captions keep variety from becoming noise.", "agency grid case-study"),
  h("agency-confident-type", "agency", "typography", "guideline", "Confident, large typography", "Agencies sell taste: big type, tight tracking on display sizes and generous whitespace are category norms.", "agency typography whitespace"),

  // ---------- Gaming ----------
  h("gaming-dark-dramatic", "gaming", null, "guideline", "Dark, atmospheric base with a vivid key color", "Tinted near-black backgrounds (not pure #000) let key art and one high-energy accent glow; keep body text off-white for comfort.", "gaming dark color contrast"),
  h("gaming-display-type", "gaming", "typography", "guideline", "Expressive display type, plain body", "Condensed, wide or techno display faces for titles only; body and UI text stay in a legible grotesk.", "gaming typography display"),
  h("gaming-clear-platform-ctas", "gaming", "button", "guideline", "Platform and purchase CTAs must stay obvious", "Wishlist, buy and platform buttons need a fixed, high-contrast style that survives over busy key art.", "gaming cta button"),
  h("gaming-motion-budget", "gaming", "motion", "guideline", "Cinematic motion, bounded", "Use motion for reveals and hover feedback; respect reduced motion and avoid autoplay audio.", "gaming motion accessibility"),

  // ---------- Media & editorial ----------
  h("editorial-measure", "media-editorial", "typography", "guideline", "Long-form measure and rhythm", "Body 18–21px, line height 1.5–1.7, 60–72 characters per line; serif or humanist body faces suit long reading.", "editorial typography reading"),
  h("editorial-hierarchy-by-type", "media-editorial", "typography", "guideline", "Hierarchy from type, not boxes", "Use scale, weight and rules (hairlines) to organise a front page; cards and shadows feel app-like here.", "editorial hierarchy rules"),
  h("editorial-ad-proof-layout", "media-editorial", null, "guideline", "Reserve space to avoid layout shift", "Give embeds, images and ad slots explicit aspect ratios so reading position does not jump.", "editorial performance layout"),

  // ---------- Education ----------
  h("edu-friendly-legible", "education", "typography", "guideline", "Friendly but highly legible type", "Rounded or humanist sans faces with generous x-height; 16–18px body; avoid all-caps paragraphs for young readers.", "education typography legibility"),
  h("edu-progress-visible", "education", null, "guideline", "Make progress visible", "Progress bars, streaks and completion states use a consistent success color and clear iconography.", "education progress gamification"),
  h("edu-color-coding", "education", null, "guideline", "Color-code subjects consistently", "If subjects or levels get colors, keep the mapping stable everywhere and pair it with labels.", "education color coding"),

  // ---------- Landing pages ----------
  h("landing-one-goal", "landing-conversion", "hero", "guideline", "One primary action per page", "Repeat the same primary CTA at natural decision points; secondary actions are visually quieter (outline or text buttons).", "landing conversion cta"),
  h("landing-scannable-sections", "landing-conversion", null, "guideline", "Sections that scan in seconds", "Each section: a short headline, one supporting sentence and one visual; vary layout rhythm (text-left/image-right alternation sparingly).", "landing layout sections"),
  h("landing-fast-hero", "landing-conversion", "hero", "guideline", "A fast, stable hero", "Hero media must not delay the headline; preload the display font or use font-display: swap with a metric-compatible fallback.", "landing performance hero fonts"),

  // ---------- Productivity ----------
  h("productivity-calm-ui", "productivity", null, "guideline", "Calm chrome, content in focus", "Low-contrast chrome, strong content contrast; keyboard shortcut hints and command menus are recognisable conventions.", "productivity ui calm"),
  h("productivity-states", "productivity", null, "guideline", "Every state designed", "Empty, loading, error and populated states share layout so screens do not jump; skeletons match final geometry.", "productivity states empty loading"),

  // ---------- Community & social ----------
  h("community-avatars-identity", "community-social", null, "guideline", "Identity is the color", "User avatars and content supply most of the color; keep UI chrome neutral and use one accent for interactions.", "community social avatars color"),
  h("community-readable-threads", "community-social", "typography", "guideline", "Threads optimised for reading", "Comfortable line length, clear author/meta hierarchy in a smaller muted size, and visible nesting via indentation lines.", "community threads typography"),

  // ---------- Luxury ----------
  h("luxury-restraint", "luxury-premium", null, "guideline", "Restraint is the signal", "Near-monochrome palette, generous whitespace, sharp corners and few simultaneous elements; color comes from photography.", "luxury minimal whitespace"),
  h("luxury-tracked-caps", "luxury-premium", "typography", "guideline", "Refined serif or thin grotesk with tracked capitals", "High-contrast serif or light grotesk headlines; small uppercase labels with 0.08–0.2em tracking for navigation and eyebrows.", "luxury typography uppercase"),
  h("luxury-slow-motion", "luxury-premium", "motion", "guideline", "Slow, deliberate transitions", "Longer fades (300–600ms) with gentle easing; avoid bouncy or playful motion.", "luxury motion"),

  // ---------- Health ----------
  h("health-calm-clear", "health-wellness", null, "guideline", "Calm, reassuring, plain", "Soft but accessible palettes (teal, green, warm neutrals), plain language and large touch targets; never rely on color alone for medical states.", "health calm accessibility"),
  h("health-accessibility-first", "health-wellness", "typography", "guideline", "Accessibility is non-negotiable", "Aim for WCAG AA everywhere and AAA for body text; support 200% zoom without loss of content.", "health accessibility wcag"),

  // ---------- Food & hospitality ----------
  h("food-appetite-color", "food-hospitality", null, "guideline", "Color with appetite", "Warm, food-derived palettes (char, mustard, tomato, herb) and real photography; avoid cold corporate blues for restaurants.", "food color warm restaurant"),
  h("food-menu-scannable", "food-hospitality", "typography", "guideline", "Menus scan by name and price", "Dish names in a display or bold face, descriptions in muted body text, prices aligned; allergens labelled with text, not icons alone.", "food menu typography prices"),
  h("food-location-hours", "food-hospitality", null, "guideline", "Location, hours and ordering above the fold", "Diners look for address, opening hours, booking or delivery links first; make them persistent on mobile.", "food restaurant information mobile"),

  // ---------- Public sector ----------
  h("public-plain-accessible", "public-sector", null, "guideline", "Accessible, plain and fast", "Large type (19px+ body on GOV.UK-style systems), strong focus states, no decorative motion, and pages that work without JavaScript.", "public government accessibility"),

  // ---------- Cross-category components ----------
  h("button-hierarchy", null, "button", "guideline", "Three-level button hierarchy", "Primary (filled), secondary (outline or tonal) and tertiary (text) variants; only one primary per view region. Minimum target 44×44px on touch.", "button hierarchy variants touch"),
  h("button-states", null, "button", "guideline", "Visible hover, active, focus and disabled states", "Hover shifts lightness ~6–8%, active ~12%; focus uses a 2px ring offset from the edge with ≥3:1 contrast; disabled lowers contrast and removes pointer.", "button states focus"),
  h("input-boundaries", null, "input", "guideline", "Input borders with 3:1 contrast", "Text field boundaries need ≥3:1 contrast against the background (WCAG 1.4.11); labels above fields, never placeholder-only labels.", "input form accessibility contrast"),
  h("form-errors", null, "form", "guideline", "Errors tied to fields", "Inline error text below the field in the error color plus an icon, connected with aria-describedby; keep the user's input.", "form validation errors accessibility"),
  h("card-one-elevation", null, "card", "guideline", "Pick one card treatment", "Either a 1px border or a subtle shadow or a tinted surface—combining all three looks noisy. Radius should match the system's medium radius.", "card border shadow radius"),
  h("nav-mobile", null, "nav", "guideline", "Navigation that survives mobile", "Collapse to a menu button below ~768px with a full-height sheet; keep the primary CTA visible in the header.", "navigation mobile responsive"),
  h("table-alignment", null, "table", "guideline", "Data tables that read", "Left-align text, right-align numbers, tabular numerals, row height 40–48px, sticky header for long tables, zebra stripes optional.", "table data typography"),
  h("dialog-focus", null, "dialog", "guideline", "Dialogs trap and restore focus", "Use the native <dialog> or an accessible equivalent: focus moves in, Escape closes, focus returns to the trigger; backdrop at 40–60% opacity.", "dialog modal accessibility"),
  h("type-scale-ratio", null, "typography", "guideline", "Choose the type-scale ratio by density", "~1.125–1.2 for dense apps, 1.25 for general marketing, 1.333–1.5 for editorial and expressive brands; clamp() large sizes for mobile.", "typography scale ratio"),
  h("reduced-motion", null, "motion", "guideline", "Honour reduced motion", "Wrap non-essential animation in @media (prefers-reduced-motion: no-preference) or disable it under reduce.", "motion accessibility reduced-motion"),
  h("focus-visible", null, "focus", "guideline", "Never remove focus without a replacement", "outline: none is only acceptable alongside a :focus-visible style with ≥3:1 contrast.", "focus accessibility keyboard"),

  // ---------- Anti-patterns (generic AI-generated look) ----------
  h("anti-generic-saas", null, null, "anti_pattern", "The interchangeable SaaS template", "Centered hero with a gradient blob, Inter at 72px, three rounded feature cards with icons in tinted circles, and a purple primary—avoid unless the brief asks for it.", "generic saas template cliche"),
  h("anti-glass-everywhere", null, null, "anti_pattern", "Glassmorphism by default", "Backdrop-blur panels reduce text contrast and cost performance; use only for one floating layer over rich imagery, if at all.", "glassmorphism blur generic"),
  h("anti-oversized-everything", null, "typography", "anti_pattern", "Oversized headings with nothing to say", "Display sizes above ~72px need short, strong copy; long headlines at huge sizes read as filler. Scale type to the copy.", "typography oversized headings"),
  h("anti-rounded-everything", null, "card", "anti_pattern", "Uniformly huge radii", "24px+ radius on every card, button and input erases hierarchy; vary radius by component size.", "radius rounded cards"),
  h("anti-gray-on-gray", null, null, "anti_pattern", "Low-contrast gray text", "Muted text below 4.5:1 is the most common accessibility failure; keep secondary text ≥4.5:1 on its surface.", "contrast accessibility gray"),
  h("anti-emoji-icons", null, null, "anti_pattern", "Emoji and stock icons as the visual identity", "Generic icon-in-circle grids and emoji bullets signal a template; prefer typography, real product imagery or a single consistent icon set.", "icons generic template"),
];
