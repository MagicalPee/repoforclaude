# UI design system: Lab Notebook — Lab Green

Spec `ds_df6f10cedf`. Category **ai-products** (+landing-conversion), landing-page. Confidence 0.46.

## Direction: Lab Notebook
A research-journal language: off-white paper, serif + mono pairing, fine grid lines and annotation marks—credible, curious and calm.

**Mood:** curious, rigorous, warm · **Personality:** thoughtful, transparent, scientific, refined, serious, technical

**Why it fits**
- designed for AI products
- matches the brief's sophistication profile
- best overall score (4.63) across 20 candidate directions

**Research evidence**
- No analyzed sources in ai-products yet; this decision relies on curated heuristics. Run research_websites with category="ai-products" to add evidence.

**Signature moves**
- Faint 8px dot or line grid on hero/figure backgrounds, like graph paper.
- Mono annotations with numbered markers [1] linking claims to sources.
- Figures framed with captions instead of decorative illustrations.

**Adopt**
- Explicit limitations and sources on the page
- Diagrams over 3D renders
- Calm, legible surfaces for enterprise AI — For enterprise or regulated buyers favour high-contrast neutrals, serif or grotesk headlines and documented limitations over spectacle.
- Monospace marks machine output — Use a monospace or tabular face for prompts, tokens, logs and model names so human and machine text are distinguishable.
- Show real inputs and outputs — Demonstrate the product with a concrete prompt and its actual result, typeset like the product renders it; it builds more trust than abstract visuals.

**Avoid**
- Purple gradients
- Sparkle icons
- Glowing orbs
- Vague futuristic imagery
- Avoid the default purple-gradient AI look
- Emoji and stock icons as the visual identity
- The interchangeable SaaS template
- purple hues (excluded by the brief)

**Originality:** Differentiate through one owned signature (faint 8px dot or line grid on hero/figure backgrounds, like graph paper), while following category usability conventions. Reference sites contribute only aggregate statistics: do not reproduce any single site's layout, imagery, illustrations, logo, copy or exact color pairing.

**Alternatives considered**
- Signal on Graphite — personality mismatch with the brief; higher risk of a generic look (score 4.04 vs 4.63).
- Editorial Authority — weaker category fit; less suited to this website type (score 3.3 vs 4.63).
- Precision Instrument — weaker category fit; personality mismatch with the brief (score 3.03 vs 4.63).

## Color
- Primary "lab green" (oklch(47.0% 0.102 162.4)) chosen from Lab Notebook's hue options.
- Secondary and accent follow a complement relationship to the primary hue (162°).
- Neutrals are warm (hue 75°, chroma 0.01) so grays feel related to the brand rather than default slate.
- All 46 text and control pairs meet WCAG AA requirements (computed, see contrast table).

Modes: light + dark (default light).

**Light theme**

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#006c49` | Brand color: primary buttons, active states, key highlights. |
| `--color-primary-hover` | `#005a3c` | Hover state for primary fills. |
| `--color-primary-active` | `#004c32` | Pressed state for primary fills. |
| `--color-on-primary` | `#ffffff` | Text and icons on primary fills. |
| `--color-primary-strong` | `#006c49` | Primary as text/icon on the page background (≥4.5:1). |
| `--color-primary-subtle` | `#dcf8e9` | Tinted background for selected rows, badges, info panels. |
| `--color-on-primary-subtle` | `#006c49` | Text on primary-subtle backgrounds. |
| `--color-secondary` | `#883838` | Secondary actions, tags and supporting highlights. |
| `--color-secondary-hover` | `#76282a` | Hover state for secondary fills. |
| `--color-on-secondary` | `#ffffff` | Text on secondary fills. |
| `--color-accent` | `#e68582` | Sparse highlight: badges, data emphasis, decorative marks. Not for body text. |
| `--color-on-accent` | `#111111` | Text on accent fills. |
| `--color-cta` | `#006c49` | Fill for the single most important action per view (primary). |
| `--color-cta-hover` | `#005a3c` | Hover state for the call-to-action fill. |
| `--color-on-cta` | `#ffffff` | Text on the call-to-action fill. |
| `--color-background` | `#faf3ea` | Page background. |
| `--color-surface` | `#fcfaf7` | Cards, panels, inputs. |
| `--color-surface-elevated` | `#ffffff` | Menus, dialogs, popovers (with shadow). |
| `--color-surface-sunken` | `#eee8df` | Wells, code blocks, table headers, alternating bands. |
| `--color-text` | `#1b150c` | Primary text and headings. |
| `--color-text-muted` | `#655c50` | Secondary text, captions, metadata (≥4.5:1 on all surfaces). |
| `--color-text-subtle` | `#8d8579` | Placeholders, disabled labels, decorative meta only (≥3:1, not for essential text). |
| `--color-text-inverse` | `#ffffff` | Text on dark/ink fills. |
| `--color-border` | `#ded7ce` | Hairline dividers and card outlines (decorative). |
| `--color-border-strong` | `#948b7f` | Input and control boundaries (≥3:1, WCAG 1.4.11). |
| `--color-link` | `#006c49` | Inline links in body copy (always underlined). |
| `--color-link-hover` | `#005337` | Hovered links. |
| `--color-focus-ring` | `#006c49` | Keyboard focus outline (2px, offset 2px). |
| `--color-success` | `#40731a` | Success text and icons. |
| `--color-success-subtle` | `#e6f6df` | Success alert background. |
| `--color-warning` | `#865900` | Warning text and icons (darkened amber for contrast). |
| `--color-warning-subtle` | `#ffeecd` | Warning alert background. |
| `--color-error` | `#b32322` | Error text, icons and invalid borders. |
| `--color-error-subtle` | `#ffebe8` | Error alert background. |
| `--color-info` | `#0f68a2` | Informational text and icons. |
| `--color-info-subtle` | `#e4f2ff` | Info alert background. |

**Dark theme**

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#57a481` | Brand color, lifted for dark backgrounds. |
| `--color-primary-hover` | `#67b490` | Hover state for primary fills. |
| `--color-primary-active` | `#73c19c` | Pressed state. |
| `--color-on-primary` | `#111111` | Text on primary fills. |
| `--color-primary-strong` | `#57a481` | Primary as text on the dark background. |
| `--color-primary-subtle` | `#10281d` | Tinted selected/badge background. |
| `--color-on-primary-subtle` | `#57a481` | Text on primary-subtle. |
| `--color-secondary` | `#c97875` | Secondary actions and tags. |
| `--color-secondary-hover` | `#da8784` | Hover for secondary fills. |
| `--color-on-secondary` | `#111111` | Text on secondary fills. |
| `--color-accent` | `#e68582` | Sparse highlight. |
| `--color-on-accent` | `#111111` | Text on accent fills. |
| `--color-cta` | `#57a481` | Fill for the single most important action per view. |
| `--color-cta-hover` | `#67b490` | Hover state for the call-to-action fill. |
| `--color-on-cta` | `#111111` | Text on the call-to-action fill. |
| `--color-background` | `#16120d` | Page background (tinted near-black, not #000). |
| `--color-surface` | `#1e1a14` | Cards and panels. |
| `--color-surface-elevated` | `#26221d` | Menus, dialogs, popovers. |
| `--color-surface-sunken` | `#0f0c08` | Wells, code blocks. |
| `--color-text` | `#f2eee7` | Primary text (off-white to reduce halation). |
| `--color-text-muted` | `#b4ada4` | Secondary text (≥4.5:1 on every dark surface). |
| `--color-text-subtle` | `#867f77` | Placeholders and disabled labels only. |
| `--color-text-inverse` | `#16120d` | Text on light fills. |
| `--color-border` | `#302c26` | Hairline dividers. |
| `--color-border-strong` | `#6c6660` | Control boundaries (≥3:1). |
| `--color-link` | `#57a481` | Inline links. |
| `--color-link-hover` | `#6ab793` | Hovered links. |
| `--color-focus-ring` | `#57a481` | Keyboard focus outline. |
| `--color-success` | `#7db85a` | Success text and icons. |
| `--color-success-subtle` | `#182511` | Success alert background. |
| `--color-warning` | `#d79628` | Warning text and icons. |
| `--color-warning-subtle` | `#2b1e00` | Warning alert background. |
| `--color-error` | `#fd7468` | Error text and icons. |
| `--color-error-subtle` | `#311916` | Error alert background. |
| `--color-info` | `#5eaceb` | Info text and icons. |
| `--color-info-subtle` | `#112230` | Info alert background. |

**Contrast:** 46/46 checked pairs pass. light text/background 16.45:1, light text-muted/background 5.96:1, light on-primary/primary 6.48:1, light on-cta/cta 6.48:1, light link/background 5.88:1, light border-strong/background 3.05:1, light focus-ring/background 5.88:1, dark text/background 16.12:1, dark text-muted/background 8.39:1, dark on-primary/primary 6.32:1, dark on-cta/cta 6.32:1, dark link/background 6.24:1, dark border-strong/background 3.29:1, dark focus-ring/background 6.24:1

**Color rules**
- Use semantic tokens (--color-text, --color-surface…) in components, never raw hex values.
- Only one primary-filled button per view region; other actions use secondary or ghost styles.
- The accent is a highlight, not a second brand color: keep it under ~10% of any screen.
- Status colors always pair with an icon and text; never communicate state by color alone.
- Links in running text are underlined; color alone does not identify a link.

## Typography
- Headings: **Lora** (transitional-serif, google-fonts) — Fits Lab Notebook: transitional-serif with warm, literary, classic character.
- Body: **Onest** (grotesque) — Readable grotesque for running text; pairs with Lora by contrast of serif and sans.
- Mono: **Source Code Pro** (required)
- Licensing: SIL Open Font License 1.1 (free for commercial use; self-hosting allowed)
- Scale: 17px × 1.25; weights regular 400, medium 500, semibold 600, bold 700, heading 500
- Google Fonts: https://fonts.googleapis.com/css2?family=Lora:wght@500;700&family=Onest:wght@400;500;600;700&family=Source+Code+Pro:wght@400;500&display=swap

| Style | Font | Size | Weight | Line height | Tracking |
|---|---|---|---|---|---|
| display | heading | clamp(2.375rem, 1.715rem + 2.93vw, 4.063rem) | 500 | 1.15 | -0.01em |
| h1 | heading | clamp(1.875rem, 1.337rem + 2.39vw, 3.25rem) | 500 | 1.15 | -0.01em |
| h2 | heading | clamp(1.875rem, 1.582rem + 1.3vw, 2.625rem) | 500 | 1.2 | -0.01em |
| h3 | heading | clamp(1.5rem, 1.28rem + 0.98vw, 2.063rem) | 500 | 1.2 | -0.006em |
| h4 | heading | clamp(1.438rem, 1.34rem + 0.43vw, 1.688rem) | 500 | 1.3 | -0.006em |
| h5 | body | 1.313rem | 600 | 1.3 | 0 |
| h6 | body | 1.063rem | 600 | 1.6 | 0 |
| body-lg | body | 1.313rem | 400 | 1.6 | 0 |
| body | body | 1.063rem | 400 | 1.6 | 0 |
| small | body | 0.844rem | 400 | 1.45 | 0 |
| caption | body | 0.688rem | 500 | 1.4 | 0 |
| label | mono | 0.844rem | 600 | 1.45 | 0 |
| button | body | 1.063rem | 600 | 1 | 0 |
| code | mono | 0.844rem | 400 | 1.6 | 0 |

- Body text stays at 17px or larger on mobile; never shrink below 14px for any readable text.
- Limit line length to 60–75 characters (max-width: 65ch on text containers).
- Use font-variant-numeric: tabular-nums for prices, tables, timers and metrics.
- Headings use Lora at weight 500; never fake bold or italic styles that are not loaded.
- Apply text-wrap: balance to headings and text-wrap: pretty to paragraphs where supported.

## Spacing & layout
- Spacing: 4px base, density **comfortable**; card padding 24px, card gap 24px
- Container 1160px, reading width 680px, page padding 16px → 32px
- Grid 4/8/12 columns, gutter 24px; section spacing 64px → 112px
- Mobile-first: base styles target ≥360px wide screens; add min-width media queries at the breakpoints.
- Text containers max out at 680px (≈65ch); media and grids may use the full container.
- Flush-left layout: headings, copy and CTAs share a strong left edge.
- Touch targets are at least 44×44px; on mobile, primary actions sit within thumb reach.
- No horizontal scrolling at any width ≥320px except intentional carousels/tables with visible affordance.

## Shape & surfaces
- Radius: none 0, xs 2px, sm 3px, md 4px, lg 6px, xl 8px, full 9999px
- Components: button 3px, input 3px, card 6px, dialog 8px, badge 2px, tooltip 3px, dropdown 4px
- Elevation: flat; surfaces: bordered
- Structure comes from borders and surface steps; shadows only for floating layers (menus, dialogs, toasts).
- Surfaces are bordered: 1px border in --color-border on --color-surface.
- Nested elements use a smaller radius than their container (inner radius = outer radius − padding, minimum 0).

## Motion
- Level minimal; durations instant 0ms, fast 120ms, base 180ms, slow 240ms; easing cubic-bezier(0.25, 0.1, 0.25, 1)
- Hover: underline and background tint only
- Animate only opacity and transform for movement; color/background/border for state changes.
- No entrance animations on scroll; motion is reserved for feedback (hover, press, open/close).
- Overlays (menus, dialogs) enter with --ease-enter and exit faster with --ease-exit.
- Nothing auto-plays longer than 5 seconds without a pause control; respect prefers-reduced-motion everywhere.

## Iconography
outline icons, 1.25px stroke — Thin-line icons or numbered figure labels (Fig. 1)

## Components (mandatory for this landing-page)
- **button** — Actions. One primary per view region. Base: display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); font-family: var(--font-body); font-weight: 600. Variants: primary, secondary, tonal, ghost, destructive, link. States: hover, active, focus-visible, disabled, loading. Minimum touch target 44×44px: on mobile use size md or larger, or extend the hit area with padding.
- **input** — Text inputs and textareas. Base: height: 40px; padding: 0 var(--space-control-padding-x); background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border-strong); border-radius: var(--radius-input). Variants: textarea, search. States: hover, focus-visible, invalid, disabled, placeholder. Visible <label> above every field; placeholders are examples, never labels.
- **card** — Grouped content and features. Base: background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: var(--space-card-padding); box-shadow: none. Variants: interactive. States: hover, focus-within. Make the whole card clickable via a stretched link on the title, not a wrapping <a> around block content.
- **navigation** — Site header. Base: height: 64px; background: var(--color-background); border-bottom: 1px solid var(--color-border); position: sticky; top: 0; z-index: 40. Variants: link, link-active, sidebar, mobile-sheet. States: hover, focus-visible. Below md, collapse links into a menu button that opens a full-height sheet; keep the primary CTA visible.
- **badge** — Status, tags and counts. Base: display: inline-flex; align-items: center; gap: var(--space-1); height: 1.5rem; padding: 0 var(--space-2); border-radius: var(--radius-badge). Variants: neutral, brand, success, warning, error. States: n/a. Badges carry text; a colored dot alone is not enough to convey status.
- **loading** — Skeletons and spinners. Base: background: var(--color-surface-sunken); border-radius: var(--radius-sm). Variants: skeleton, spinner. States: reduced-motion. Skeletons mirror the final layout geometry to avoid layout shift.
- **emptyState** — Empty, first-run and no-results screens. Base: text-align: left; padding: var(--space-16) var(--space-6); color: var(--color-text-muted); max-width: 36rem. Variants: title, action. States: n/a. Explain what goes here and offer one clear next action.

Also specified as reusable defaults: select, checkbox, dropdown, dialog, tooltip, table, alert (full rules in the JSON spec / get_design_tokens).

## Responsive
- Breakpoints: sm 640px, md 768px, lg 1024px, xl 1280px, 2xl 1536px (min-width, mobile-first).
- Headings h1–h3 and display use fluid clamp() sizes between 360px and 1280px viewports; body size is fixed.
- Grid: 4 columns on mobile, 8 on tablet, 12 on desktop.
- Section spacing scales from 64px (mobile) to 112px (desktop).
- Navigation collapses to a menu button below md; primary CTA stays visible.
- Tables scroll horizontally inside a container on small screens; cards stack to one column below sm.

## Accessibility
- Target WCAG 2.2 AA; every color pair in the contrast table was computed, not assumed.
- Visible :focus-visible ring on every interactive element (2px, offset 2px, ≥3:1).
- Minimum 44×44px touch targets; inputs ≥16px font size.
- Never convey meaning by color alone (status, links, gains/losses).
- Respect prefers-reduced-motion and prefers-color-scheme.
- Use semantic HTML (header, nav, main, footer, button, dialog) before ARIA.

## Implementation (plain-html, css-variables)
Token file: `css/tokens.css`
1. Create css/tokens.css with the generated CSS (tokens.css output) and import it once, before any component styles.
2. Fonts: Link the Google Fonts CSS (or self-host the WOFF2 files and write @font-face rules).
3. Reference tokens with var(--color-…), var(--space-…), var(--radius-…) in every component style.
4. Build the mandatory components first using the component specs (states included), then compose pages.
5. Dark mode (if generated): it follows prefers-color-scheme automatically; set data-theme="light" or "dark" on <html> to force a theme from a toggle.
6. Verify: run validate_design_system on the final tokens, check focus visibility with the keyboard, and test at 360px, 768px and 1280px widths.

`index.html <head>`
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora:wght@500;700&family=Onest:wght@400;500;600;700&family=Source+Code+Pro:wght@400;500&display=swap">
<link rel="stylesheet" href="css/tokens.css">
```

## tokens.css
```css
/* Lab Notebook — Lab Green — generated by design-intelligence-mcp (ds_df6f10cedf). Edit values here, not in components. */
:root {
  color-scheme: light dark;
  /* color (light) */
  --color-primary: #006c49;
  --color-primary-hover: #005a3c;
  --color-primary-active: #004c32;
  --color-on-primary: #ffffff;
  --color-primary-strong: #006c49;
  --color-primary-subtle: #dcf8e9;
  --color-on-primary-subtle: #006c49;
  --color-secondary: #883838;
  --color-secondary-hover: #76282a;
  --color-on-secondary: #ffffff;
  --color-accent: #e68582;
  --color-on-accent: #111111;
  --color-cta: #006c49;
  --color-cta-hover: #005a3c;
  --color-on-cta: #ffffff;
  --color-background: #faf3ea;
  --color-surface: #fcfaf7;
  --color-surface-elevated: #ffffff;
  --color-surface-sunken: #eee8df;
  --color-text: #1b150c;
  --color-text-muted: #655c50;
  --color-text-subtle: #8d8579;
  --color-text-inverse: #ffffff;
  --color-border: #ded7ce;
  --color-border-strong: #948b7f;
  --color-link: #006c49;
  --color-link-hover: #005337;
  --color-focus-ring: #006c49;
  --color-success: #40731a;
  --color-success-subtle: #e6f6df;
  --color-warning: #865900;
  --color-warning-subtle: #ffeecd;
  --color-error: #b32322;
  --color-error-subtle: #ffebe8;
  --color-info: #0f68a2;
  --color-info-subtle: #e4f2ff;

  /* typography */
  --font-heading: "Lora Variable", Lora, ui-serif, Georgia, Cambria, "Times New Roman", serif;
  --font-body: "Onest Variable", Onest, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: "Source Code Pro Variable", "Source Code Pro", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --text-xs: 0.688rem;
  --text-sm: 0.844rem;
  --text-base: 1.063rem;
  --text-lg: 1.313rem;
  --text-xl: clamp(1.438rem, 1.34rem + 0.43vw, 1.688rem);
  --text-2xl: clamp(1.5rem, 1.28rem + 0.98vw, 2.063rem);
  --text-3xl: clamp(1.875rem, 1.582rem + 1.3vw, 2.625rem);
  --text-4xl: clamp(1.875rem, 1.337rem + 2.39vw, 3.25rem);
  --text-5xl: clamp(2.375rem, 1.715rem + 2.93vw, 4.063rem);
  --text-6xl: clamp(2.938rem, 2.106rem + 3.7vw, 5.063rem);
  --text-display: clamp(2.375rem, 1.715rem + 2.93vw, 4.063rem);
  --leading-display: 1.15;
  --tracking-display: -0.01em;
  --text-h1: clamp(1.875rem, 1.337rem + 2.39vw, 3.25rem);
  --leading-h1: 1.15;
  --tracking-h1: -0.01em;
  --text-h2: clamp(1.875rem, 1.582rem + 1.3vw, 2.625rem);
  --leading-h2: 1.2;
  --tracking-h2: -0.01em;
  --text-h3: clamp(1.5rem, 1.28rem + 0.98vw, 2.063rem);
  --leading-h3: 1.2;
  --tracking-h3: -0.006em;
  --text-h4: clamp(1.438rem, 1.34rem + 0.43vw, 1.688rem);
  --leading-h4: 1.3;
  --tracking-h4: -0.006em;
  --text-h5: 1.313rem;
  --leading-h5: 1.3;
  --tracking-h5: 0;
  --text-h6: 1.063rem;
  --leading-h6: 1.6;
  --tracking-h6: 0;
  --text-body-lg: 1.313rem;
  --leading-body-lg: 1.6;
  --tracking-body-lg: 0;
  --text-body: 1.063rem;
  --leading-body: 1.6;
  --tracking-body: 0;
  --text-small: 0.844rem;
  --leading-small: 1.45;
  --tracking-small: 0;
  --text-caption: 0.688rem;
  --leading-caption: 1.4;
  --tracking-caption: 0;
  --text-label: 0.844rem;
  --leading-label: 1.45;
  --tracking-label: 0;
  --text-button: 1.063rem;
  --leading-button: 1;
  --tracking-button: 0;
  --text-code: 0.844rem;
  --leading-code: 1.6;
  --tracking-code: 0;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --font-weight-heading: 500;

  /* spacing (4px base) */
  --space-0: 0;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-20: 5rem;
  --space-24: 6rem;
  --space-32: 8rem;
  --space-40: 10rem;
  --space-0-5: 0.125rem;
  --space-1-5: 0.375rem;
  --space-inline-xs: 4px;
  --space-inline-sm: 8px;
  --space-inline-md: 12px;
  --space-stack-xs: 4px;
  --space-stack-sm: 8px;
  --space-stack-md: 16px;
  --space-stack-lg: 32px;
  --space-card-padding: 24px;
  --space-card-gap: 24px;
  --space-control-padding-x: 16px;
  --space-form-gap: 16px;
  --space-section-gap: 112px;

  /* layout */
  --container-max: 1160px;
  --container-reading: 680px;
  --container-wide: 1400px;
  --page-padding: 16px;
  --grid-gutter: 16px;
  --section-spacing: clamp(4rem, 2.826rem + 5.22vw, 7rem);

  /* shape */
  --radius-none: 0;
  --radius-xs: 2px;
  --radius-sm: 3px;
  --radius-md: 4px;
  --radius-lg: 6px;
  --radius-xl: 8px;
  --radius-full: 9999px;
  --radius-button: 3px;
  --radius-input: 3px;
  --radius-card: 6px;
  --radius-dialog: 8px;
  --radius-badge: 2px;
  --radius-tooltip: 3px;
  --radius-dropdown: 4px;
  --border-hairline: 1px;
  --border-default: 1px;
  --border-strong: 2px;
  --shadow-xs: none;
  --shadow-sm: none;
  --shadow-md: 0 4px 12px -4px rgb(27 21 12 / 0.12);
  --shadow-lg: 0 12px 32px -8px rgb(27 21 12 / 0.16);
  --shadow-xl: 0 24px 56px -12px rgb(27 21 12 / 0.2);
  --shadow-focus: 0 0 0 2px var(--color-background), 0 0 0 4px var(--color-focus-ring);

  /* motion */
  --duration-instant: 0ms;
  --duration-fast: 120ms;
  --duration-base: 180ms;
  --duration-slow: 240ms;
  --ease-standard: cubic-bezier(0.25, 0.1, 0.25, 1);
  --ease-emphasized: cubic-bezier(0.2, 0, 0, 1);
  --ease-enter: cubic-bezier(0, 0, 0.2, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);
  --transition-interactive: color, background-color, border-color, box-shadow, opacity var(--duration-fast) var(--ease-standard);
  --transition-transform: transform var(--duration-base) var(--ease-emphasized);
  --transition-overlay: opacity var(--duration-base) var(--ease-enter), transform var(--duration-base) var(--ease-enter);
}

[data-theme="dark"] {
  color-scheme: dark;
  --color-primary: #57a481;
  --color-primary-hover: #67b490;
  --color-primary-active: #73c19c;
  --color-on-primary: #111111;
  --color-primary-strong: #57a481;
  --color-primary-subtle: #10281d;
  --color-on-primary-subtle: #57a481;
  --color-secondary: #c97875;
  --color-secondary-hover: #da8784;
  --color-on-secondary: #111111;
  --color-accent: #e68582;
  --color-on-accent: #111111;
  --color-cta: #57a481;
  --color-cta-hover: #67b490;
  --color-on-cta: #111111;
  --color-background: #16120d;
  --color-surface: #1e1a14;
  --color-surface-elevated: #26221d;
  --color-surface-sunken: #0f0c08;
  --color-text: #f2eee7;
  --color-text-muted: #b4ada4;
  --color-text-subtle: #867f77;
  --color-text-inverse: #16120d;
  --color-border: #302c26;
  --color-border-strong: #6c6660;
  --color-link: #57a481;
  --color-link-hover: #6ab793;
  --color-focus-ring: #57a481;
  --color-success: #7db85a;
  --color-success-subtle: #182511;
  --color-warning: #d79628;
  --color-warning-subtle: #2b1e00;
  --color-error: #fd7468;
  --color-error-subtle: #311916;
  --color-info: #5eaceb;
  --color-info-subtle: #112230;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --color-primary: #57a481;
    --color-primary-hover: #67b490;
    --color-primary-active: #73c19c;
    --color-on-primary: #111111;
    --color-primary-strong: #57a481;
    --color-primary-subtle: #10281d;
    --color-on-primary-subtle: #57a481;
    --color-secondary: #c97875;
    --color-secondary-hover: #da8784;
    --color-on-secondary: #111111;
    --color-accent: #e68582;
    --color-on-accent: #111111;
    --color-cta: #57a481;
    --color-cta-hover: #67b490;
    --color-on-cta: #111111;
    --color-background: #16120d;
    --color-surface: #1e1a14;
    --color-surface-elevated: #26221d;
    --color-surface-sunken: #0f0c08;
    --color-text: #f2eee7;
    --color-text-muted: #b4ada4;
    --color-text-subtle: #867f77;
    --color-text-inverse: #16120d;
    --color-border: #302c26;
    --color-border-strong: #6c6660;
    --color-link: #57a481;
    --color-link-hover: #6ab793;
    --color-focus-ring: #57a481;
    --color-success: #7db85a;
    --color-success-subtle: #182511;
    --color-warning: #d79628;
    --color-warning-subtle: #2b1e00;
    --color-error: #fd7468;
    --color-error-subtle: #311916;
    --color-info: #5eaceb;
    --color-info-subtle: #112230;
  }
}

@media (min-width: 768px) { :root { --page-padding: 24px; --grid-gutter: 20px; } }
@media (min-width: 1024px) { :root { --page-padding: 32px; --grid-gutter: 24px; } }

/* base */
body { margin: 0; background: var(--color-background); color: var(--color-text); font-family: var(--font-body); font-size: var(--text-body); line-height: var(--leading-body); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
h1 { font-family: var(--font-heading); font-size: var(--text-h1); line-height: var(--leading-h1); letter-spacing: var(--tracking-h1); font-weight: 500; text-wrap: balance; margin: 0; }
h2 { font-family: var(--font-heading); font-size: var(--text-h2); line-height: var(--leading-h2); letter-spacing: var(--tracking-h2); font-weight: 500; text-wrap: balance; margin: 0; }
h3 { font-family: var(--font-heading); font-size: var(--text-h3); line-height: var(--leading-h3); letter-spacing: var(--tracking-h3); font-weight: 500; text-wrap: balance; margin: 0; }
h4 { font-family: var(--font-heading); font-size: var(--text-h4); line-height: var(--leading-h4); letter-spacing: var(--tracking-h4); font-weight: 500; text-wrap: balance; margin: 0; }
h5 { font-family: var(--font-body); font-size: var(--text-h5); line-height: var(--leading-h5); letter-spacing: var(--tracking-h5); font-weight: 600; text-wrap: balance; margin: 0; }
h6 { font-family: var(--font-body); font-size: var(--text-h6); line-height: var(--leading-h6); letter-spacing: var(--tracking-h6); font-weight: 600; text-wrap: balance; margin: 0; }
p { text-wrap: pretty; }
a { color: var(--color-link); text-decoration-thickness: from-font; text-underline-offset: 0.18em; }
a:hover { color: var(--color-link-hover); }
:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }
::selection { background: var(--color-primary-subtle); color: var(--color-text); }
code, kbd, samp, pre { font-family: var(--font-mono); font-size: 0.92em; }
.tabular-nums, table, [data-numeric] { font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }
```

## Validation & confidence
0 error(s), 0 warning(s), 0 note(s); 30/30 contrast checks pass. (score 100/100).

- Little research data exists for this category; treat evidence-based scoring as weak.

_Observed conventions are frequencies from static analysis of public CSS and design tokens; they describe what is common, not what performs best. Curated heuristics are expert guidance, not measurements._
