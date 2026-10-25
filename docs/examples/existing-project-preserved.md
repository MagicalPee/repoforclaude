# UI design system: Existing system, extended with Retro Revival conventions

Spec `ds_5cbd612d3f`. Category **food-hospitality**, marketing-site. Confidence 0.55.

> Existing design system preserved: background #fbf6ee; text #2a1d14; brand colors #b5562b, #8f3f1c, #e7c27a; heading font Fraunces; body font Hanken Grotesk. New tokens alias existing variables where values match.

## Direction: Retro Revival
Nostalgic and punchy: warm saturated print colors, a heavy display face with character, thick outlines and playful, chunky components.

**Mood:** nostalgic, fun, loud · **Personality:** characterful, cheeky, warm

**Why it fits**
- designed for Food, hospitality & travel
- structurally compatible with the project's existing styles
- best overall score (5.76) across 20 candidate directions
- existing colors and fonts are kept; the direction only fills gaps (spacing, states, motion, component rules)

**Research evidence**
- 1 analyzed source(s) in food-hospitality (0 websites, 1 design systems) informed the scoring.

**Signature moves**
- 3px ink outlines and hard shadows like screen-printed signage.
- Headlines set big in a heavy display face, often on a tilted color band.
- Menu or product items styled like printed price cards.

**Adopt**
- Real photography with bold color frames
- Funny, specific copy
- Color with appetite — Warm, food-derived palettes (char, mustard, tomato, herb) and real photography; avoid cold corporate blues for restaurants.
- Location, hours and ordering above the fold — Diners look for address, opening hours, booking or delivery links first; make them persistent on mobile.
- Menus scan by name and price — Dish names in a display or bold face, descriptions in muted body text, prices aligned; allergens labelled with text, not icons alone.
- Choose the type-scale ratio by density — ~1.125–1.2 for dense apps, 1.25 for general marketing, 1.333–1.5 for editorial and expressive brands; clamp() large sizes for mobile.

**Avoid**
- Cool corporate grays
- Thin hairline type
- Glassmorphism
- Emoji and stock icons as the visual identity
- The interchangeable SaaS template
- Glassmorphism by default

**Originality:** Differentiate through one owned signature (3px ink outlines and hard shadows like screen-printed signage), while following category usability conventions. Reference sites contribute only aggregate statistics: do not reproduce any single site's layout, imagery, illustrations, logo, copy or exact color pairing.

**Alternatives considered**
- Warm Craft — less compatible with the existing design (score 5.43 vs 5.76).
- Organic Field — weaker category fit; less compatible with the existing design (score 3.83 vs 5.76).
- Soft Pop — weaker category fit; less suited to this website type (score 3.65 vs 5.76).

## Color
- Primary #b5562b preserved from the project's existing styles.
- Secondary and accent follow a triad relationship to the primary hue (43°).
- Neutrals are warm (hue 75°, chroma 0.02) so grays feel related to the brand rather than default slate.
- All 23 text and control pairs meet WCAG AA requirements (computed, see contrast table).

Modes: light (default light).

**Light theme**

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#b5562b` | Brand color: primary buttons, active states, key highlights. |
| `--color-primary-hover` | `#a34518` | Hover state for primary fills. |
| `--color-primary-active` | `#943802` | Pressed state for primary fills. |
| `--color-on-primary` | `#ffffff` | Text and icons on primary fills. |
| `--color-primary-strong` | `#b5562b` | Primary as text/icon on the page background (≥4.5:1). |
| `--color-primary-subtle` | `#ffebe4` | Tinted background for selected rows, badges, info panels. |
| `--color-on-primary-subtle` | `#ae5024` | Text on primary-subtle backgrounds. |
| `--color-secondary` | `#8f3f1c` | Secondary actions, tags and supporting highlights. |
| `--color-secondary-hover` | `#7d2f07` | Hover state for secondary fills. |
| `--color-on-secondary` | `#ffffff` | Text on secondary fills. |
| `--color-accent` | `#e7c27a` | Sparse highlight: badges, data emphasis, decorative marks. Not for body text. |
| `--color-on-accent` | `#111111` | Text on accent fills. |
| `--color-cta` | `#b5562b` | Fill for the single most important action per view (primary). |
| `--color-cta-hover` | `#a34518` | Hover state for the call-to-action fill. |
| `--color-on-cta` | `#ffffff` | Text on the call-to-action fill. |
| `--color-background` | `#fbf6ee` | Page background. |
| `--color-surface` | `#fffaf3` | Cards, panels, inputs. |
| `--color-surface-elevated` | `#ffffff` | Menus, dialogs, popovers (with shadow). |
| `--color-surface-sunken` | `#f4e7d5` | Wells, code blocks, table headers, alternating bands. |
| `--color-text` | `#2a1d14` | Primary text and headings. |
| `--color-text-muted` | `#685b4b` | Secondary text, captions, metadata (≥4.5:1 on all surfaces). |
| `--color-text-subtle` | `#8f8476` | Placeholders, disabled labels, decorative meta only (≥3:1, not for essential text). |
| `--color-text-inverse` | `#ffffff` | Text on dark/ink fills. |
| `--color-border` | `#e4d6c3` | Hairline dividers and card outlines (decorative). |
| `--color-border-strong` | `#9e8c74` | Input and control boundaries (≥3:1, WCAG 1.4.11). |
| `--color-link` | `#b5562b` | Inline links in body copy (always underlined). |
| `--color-link-hover` | `#9a3e0d` | Hovered links. |
| `--color-focus-ring` | `#b5562b` | Keyboard focus outline (2px, offset 2px). |
| `--color-success` | `#1d7635` | Success text and icons. |
| `--color-success-subtle` | `#e1f7e3` | Success alert background. |
| `--color-warning` | `#865900` | Warning text and icons (darkened amber for contrast). |
| `--color-warning-subtle` | `#ffeecd` | Warning alert background. |
| `--color-error` | `#b11f47` | Error text, icons and invalid borders. |
| `--color-error-subtle` | `#ffeaec` | Error alert background. |
| `--color-info` | `#0f68a2` | Informational text and icons. |
| `--color-info-subtle` | `#e4f2ff` | Info alert background. |

**Contrast:** 23/23 checked pairs pass. light text/background 15.2:1, light text-muted/background 6.13:1, light on-primary/primary 4.85:1, light on-cta/cta 4.85:1, light link/background 4.51:1, light border-strong/background 3.02:1, light focus-ring/background 4.51:1

**Color rules**
- Use semantic tokens (--color-text, --color-surface…) in components, never raw hex values.
- Only one primary-filled button per view region; other actions use secondary or ghost styles.
- The accent is a highlight, not a second brand color: keep it under ~10% of any screen.
- Status colors always pair with an icon and text; never communicate state by color alone.
- Links in running text are underlined; color alone does not identify a link.

## Typography
- Headings: **Fraunces** (display-serif, existing) — Already used for headings in this project; preserved.
- Body: **Hanken Grotesk** (grotesque) — Already used for body text in this project; preserved.
- Mono: **JetBrains Mono** (optional)
- Licensing: SIL Open Font License 1.1 (free for commercial use; self-hosting allowed)
- Scale: 17px × 1.414; weights regular 400, medium 500, semibold 600, bold 700, heading 700
- Google Fonts: https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Hanken+Grotesk:wght@400;500;600&display=swap

| Style | Font | Size | Weight | Line height | Tracking |
|---|---|---|---|---|---|
| display | heading | clamp(4.938rem, 3.543rem + 6.2vw, 8.5rem) | 700 | 0.98 | 0.01em, upper |
| h1 | heading | clamp(3.5rem, 2.522rem + 4.35vw, 6rem) | 700 | 0.98 | 0.01em, upper |
| h2 | heading | clamp(2.438rem, 1.728rem + 3.15vw, 4.25rem) | 700 | 0.98 | 0.01em, upper |
| h3 | heading | clamp(1.75rem, 1.261rem + 2.17vw, 3rem) | 700 | 0.98 | 0.01em |
| h4 | heading | clamp(1.5rem, 1.255rem + 1.09vw, 2.125rem) | 650 | 1.03 | 0.01em |
| h5 | body | clamp(1.313rem, 1.239rem + 0.33vw, 1.5rem) | 600 | 1.3 | -0.006em |
| h6 | body | 1.063rem | 600 | 1.55 | 0 |
| body-lg | body | clamp(1.313rem, 1.239rem + 0.33vw, 1.5rem) | 400 | 1.55 | -0.006em |
| body | body | 1.063rem | 400 | 1.55 | 0 |
| small | body | 0.75rem | 400 | 1.45 | 0 |
| caption | body | 0.531rem | 500 | 1.4 | 0 |
| label | body | 0.75rem | 600 | 1.45 | 0.08em, upper |
| button | body | 1.063rem | 600 | 1 | 0.04em |
| code | mono | 0.75rem | 400 | 1.6 | 0 |

- Body text stays at 17px or larger on mobile; never shrink below 14px for any readable text.
- Limit line length to 60–75 characters (max-width: 65ch on text containers).
- Use font-variant-numeric: tabular-nums for prices, tables, timers and metrics.
- Headings use Fraunces at weight 700 in uppercase; never fake bold or italic styles that are not loaded.
- Apply text-wrap: balance to headings and text-wrap: pretty to paragraphs where supported.

## Spacing & layout
- Spacing: 4px base, density **comfortable**; card padding 24px, card gap 24px
- Container 1280px, reading width 620px, page padding 16px → 32px
- Grid 4/8/12 columns, gutter 24px; section spacing 56px → 104px
- Mobile-first: base styles target ≥360px wide screens; add min-width media queries at the breakpoints.
- Text containers max out at 620px (≈65ch); media and grids may use the full container.
- Center hero and section intros; keep body copy left-aligned for readability.
- Touch targets are at least 44×44px; on mobile, primary actions sit within thumb reach.
- No horizontal scrolling at any width ≥320px except intentional carousels/tables with visible affordance.

## Shape & surfaces
- Radius: none 0, xs 4px, sm 8px, md 14px, lg 22px, xl 32px, full 9999px
- Components: button 9999px, input 14px, card 22px, dialog 32px, badge 9999px, tooltip 8px, dropdown 14px
- Elevation: hard-offset; surfaces: bordered
- Hard offset shadows are part of the brand: interactive elements carry shadow-sm/md and press flat on :active.
- Surfaces are bordered: 1px border in --color-border on --color-surface.
- Nested elements use a smaller radius than their container (inner radius = outer radius − padding, minimum 0).

## Motion
- Level expressive; durations instant 0ms, fast 100ms, base 180ms, slow 320ms; easing cubic-bezier(0.34, 1.56, 0.64, 1)
- Hover: squash-and-stretch press (scaleY 0.96) on buttons; stickers wiggle once
- Animate only opacity and transform for movement; color/background/border for state changes.
- Entrance animations: fade + 8–16px translate, staggered 40–60ms, once per element, triggered on first view.
- Overlays (menus, dialogs) enter with --ease-enter and exit faster with --ease-exit.
- Nothing auto-plays longer than 5 seconds without a pause control; respect prefers-reduced-motion everywhere.

## Iconography
solid icons, 3px stroke — Chunky custom icons with the same 3px outline as components

## Components (mandatory for this marketing-site)
- **button** — Actions. One primary per view region. Base: display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); font-family: var(--font-body); font-weight: 600. Variants: primary, secondary, tonal, ghost, destructive, link. States: hover, active, focus-visible, disabled, loading. Minimum touch target 44×44px: on mobile use size md or larger, or extend the hit area with padding.
- **input** — Text inputs and textareas. Base: height: 40px; padding: 0 var(--space-control-padding-x); background: var(--color-surface); color: var(--color-text); border: 3px solid var(--color-border-strong); border-radius: var(--radius-input). Variants: textarea, search. States: hover, focus-visible, invalid, disabled, placeholder. Visible <label> above every field; placeholders are examples, never labels.
- **card** — Grouped content and features. Base: background: var(--color-surface); border: 3px solid var(--color-text); border-radius: var(--radius-card); padding: var(--space-card-padding); box-shadow: var(--shadow-sm). Variants: interactive. States: hover, focus-within. Make the whole card clickable via a stretched link on the title, not a wrapping <a> around block content.
- **navigation** — Site header. Base: height: 64px; background: var(--color-background); border-bottom: 1px solid var(--color-border); position: sticky; top: 0; z-index: 40. Variants: link, link-active, sidebar, mobile-sheet. States: hover, focus-visible. Below md, collapse links into a menu button that opens a full-height sheet; keep the primary CTA visible.
- **dropdown** — Menus and popovers. Base: background: var(--color-surface-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-dropdown); box-shadow: var(--shadow-md); padding: var(--space-1); min-width: 12rem. Variants: item. States: item-hover, item-focus-visible, open. Arrow-key navigation, Escape to close, focus returns to the trigger.
- **badge** — Status, tags and counts. Base: display: inline-flex; align-items: center; gap: var(--space-1); height: 1.5rem; padding: 0 var(--space-2); border-radius: var(--radius-badge). Variants: neutral, brand, success, warning, error. States: n/a. Badges carry text; a colored dot alone is not enough to convey status.
- **alert** — Inline messages and banners. Base: display: flex; gap: var(--space-3); padding: var(--space-4); border-radius: var(--radius-md); border: 1px solid currentColor; border-left-width: 1px. Variants: info, success, warning, error. States: n/a. Body text inside alerts stays --color-text; only the icon and title use the status color.

Also specified as reusable defaults: select, checkbox, dialog, tooltip, table, loading, emptyState (full rules in the JSON spec / get_design_tokens).

## Responsive
- Breakpoints: sm 640px, md 768px, lg 1024px, xl 1280px, 2xl 1536px (min-width, mobile-first).
- Headings h1–h3 and display use fluid clamp() sizes between 360px and 1280px viewports; body size is fixed.
- Grid: 4 columns on mobile, 8 on tablet, 12 on desktop.
- Section spacing scales from 56px (mobile) to 104px (desktop).
- Navigation collapses to a menu button below md; primary CTA stays visible.
- Tables scroll horizontally inside a container on small screens; cards stack to one column below sm.

## Accessibility
- Target WCAG 2.2 AA; every color pair in the contrast table was computed, not assumed.
- Visible :focus-visible ring on every interactive element (2px, offset 2px, ≥3:1).
- Minimum 44×44px touch targets; inputs ≥16px font size.
- Never convey meaning by color alone (status, links, gains/losses).
- Respect prefers-reduced-motion and prefers-color-scheme.
- Use semantic HTML (header, nav, main, footer, button, dialog) before ARIA.

## Implementation (astro, css-variables)
Token file: `src/styles/global.css`
1. Keep the existing stylesheet (src/styles/global.css); add the semantic aliases below to its :root so components can use --color-* names without changing current values.
2. Fonts: npm install @fontsource-variable/fraunces @fontsource-variable/hanken-grotesk and import them in your base layout frontmatter.
3. Reference tokens with var(--color-…), var(--space-…), var(--radius-…) in every component style.
4. Build the mandatory components first using the component specs (states included), then compose pages.
5. Dark mode (if generated): it follows prefers-color-scheme automatically; set data-theme="light" or "dark" on <html> to force a theme from a toggle.
6. Verify: run validate_design_system on the final tokens, check focus visibility with the keyboard, and test at 360px, 768px and 1280px widths.

`src/layouts/Base.astro`
```ts
---
import "@fontsource-variable/fraunces";
import "@fontsource-variable/hanken-grotesk";
import "../styles/tokens.css";
---
```

`semantic aliases for existing variables`
```css
:root {
  --color-primary: var(--crust);
  --color-secondary: var(--crust-deep);
  --color-background: var(--flour);
  --color-text: var(--rye);
  --color-accent: var(--sesame);
}
```

Token CSS omitted (compact mode): call get_design_tokens with this spec id and format "css".

## Validation & confidence
0 error(s), 0 warning(s), 0 note(s); 15/15 contrast checks pass. (score 100/100).

- Little research data exists for this category; treat evidence-based scoring as weak.

_Observed conventions are frequencies from static analysis of public CSS and design tokens; they describe what is common, not what performs best. Curated heuristics are expert guidance, not measurements._
