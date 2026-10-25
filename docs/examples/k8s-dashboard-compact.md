# UI design system: Precision Instrument — Instrument Cyan

Spec `ds_7002883c13`. Category **developer-tools**, dashboard. Confidence 0.89.

## Direction: Precision Instrument
A calibrated, technical interface: hairline structure, tight grotesk type, monospace metadata and a single signal color used like an indicator light.

**Mood:** precise, quiet, competent · **Personality:** technical, trustworthy, efficient, information-rich

**Why it fits**
- designed for Technology & developer tools
- matches the brief's techness, density profile
- honours requested style: dark
- consistent with 100% of observed developer-tools conventions (n=6)
- best overall score (7.89) across 20 candidate directions

**Research evidence**
- 6 analyzed source(s) in developer-tools (0 websites, 6 design systems) informed the scoring.
- colorMode: "light" in 3/3 analyzed developer-tools sources (e.g. GitHub Primer, HashiCorp Helios)
- headingClass: "neo-grotesque" in 2/4 analyzed developer-tools sources (e.g. Twilio Paste, Elastic EUI (Borealis))
- paletteCharacter: "restrained" in 2/5 analyzed developer-tools sources (e.g. GitHub Primer, Canonical Vanilla)
- most common heading font: Inter (2 sources) — avoided as a default to stay distinctive
- Technology & developer tools: color mode "light" is common: 3 of 3 analyzed Technology & developer tools sources (100%) show color mode "light", 1× the rate across all analyzed sources.
- Technology & developer tools: style tag "minimal" is common: 2 of 2 analyzed Technology & developer tools sources (100%) show style tag "minimal", 1× the rate across all analyzed sources.
- Technology & developer tools: neutral temperature "cool" is common: 4 of 6 analyzed Technology & developer tools sources (67%) show neutral temperature "cool", 1.34× the rate across all analyzed sources.

**Signature moves**
- Monospace labels for metadata, versions, keyboard shortcuts and status (e.g. `v2.4 · 99.98% uptime`).
- 1px hairline grid lines separating sections instead of shadows or cards.
- The signal color appears only on live states, primary data and the focus ring, like an indicator LED.

**Adopt**
- Real code or CLI output as the hero visual
- Tabular numerals in all metrics
- Dense but aligned tables
- Offer dark mode, do not force it — Dark UIs are common in developer tools, but docs and long reading benefit from a light theme; ship both and follow prefers-color-scheme.
- Code is the hero image — A short, copy-pasteable snippet or CLI transcript sells a developer tool better than illustration. Use a real monospace with clear 0/O and 1/l.
- Higher information density — Developers tolerate and prefer denser layouts: 14–15px UI text, 4px spacing base, compact tables and code blocks with real syntax.
- Hairline borders over shadows — 1px borders and subtle surface steps give structure in data-heavy UIs; shadows are reserved for floating layers.

**Avoid**
- Gradient blobs
- Rounded 24px cards
- Illustrated mascots
- More than one saturated hue

**Originality:** Differentiate through one owned signature (monospace labels for metadata, versions, keyboard shortcuts and status (e.g. `v2.4 · 99.98% uptime`)), while keeping the category conventions that aid recognition (see research evidence). Reference sites contribute only aggregate statistics: do not reproduce any single site's layout, imagery, illustrations, logo, copy or exact color pairing.

**Alternatives considered**
- Signal on Graphite — personality mismatch with the brief; less consistent with observed category conventions (score 5.92 vs 7.89).
- Calm Workspace — weaker category fit; does not match the requested style (score 2.83 vs 7.89).
- Night Arena — weaker category fit; personality mismatch with the brief (score 2.61 vs 7.89).

## Color
- Primary "instrument cyan" (oklch(50.1% 0.088 213.9)) chosen from Precision Instrument's hue options, skipping hues used by recently generated systems.
- Secondary and accent follow a mono relationship to the primary hue (214°).
- Neutrals are cool (hue 255°, chroma 0.006) so grays feel related to the brand rather than default slate.
- All 46 text and control pairs meet WCAG AA requirements (computed, see contrast table).

Modes: dark + light (default dark).

**Dark theme**

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#519fb0` | Brand color, lifted for dark backgrounds. |
| `--color-primary-hover` | `#61afc0` | Hover state for primary fills. |
| `--color-primary-active` | `#6ebbcd` | Pressed state. |
| `--color-on-primary` | `#111111` | Text on primary fills. |
| `--color-primary-strong` | `#519fb0` | Primary as text on the dark background. |
| `--color-primary-subtle` | `#0e272c` | Tinted selected/badge background. |
| `--color-on-primary-subtle` | `#519fb0` | Text on primary-subtle. |
| `--color-secondary` | `#7998a0` | Secondary actions and tags. |
| `--color-secondary-hover` | `#88a7b0` | Hover for secondary fills. |
| `--color-on-secondary` | `#111111` | Text on secondary fills. |
| `--color-accent` | `#3bb2e7` | Sparse highlight. |
| `--color-on-accent` | `#111111` | Text on accent fills. |
| `--color-cta` | `#ebeff4` | Fill for the single most important action per view. |
| `--color-cta-hover` | `#d1d5da` | Hover state for the call-to-action fill. |
| `--color-on-cta` | `#101317` | Text on the call-to-action fill. |
| `--color-background` | `#101317` | Page background (tinted near-black, not #000). |
| `--color-surface` | `#181b1f` | Cards and panels. |
| `--color-surface-elevated` | `#202327` | Menus, dialogs, popovers. |
| `--color-surface-sunken` | `#0a0c10` | Wells, code blocks. |
| `--color-text` | `#ebeff4` | Primary text (off-white to reduce halation). |
| `--color-text-muted` | `#a9aeb6` | Secondary text (≥4.5:1 on every dark surface). |
| `--color-text-subtle` | `#7b8187` | Placeholders and disabled labels only. |
| `--color-text-inverse` | `#101317` | Text on light fills. |
| `--color-border` | `#292d31` | Hairline dividers. |
| `--color-border-strong` | `#63676d` | Control boundaries (≥3:1). |
| `--color-link` | `#519fb0` | Inline links. |
| `--color-link-hover` | `#64b2c3` | Hovered links. |
| `--color-focus-ring` | `#519fb0` | Keyboard focus outline. |
| `--color-success` | `#60bc71` | Success text and icons. |
| `--color-success-subtle` | `#122615` | Success alert background. |
| `--color-warning` | `#d79628` | Warning text and icons. |
| `--color-warning-subtle` | `#2b1e00` | Warning alert background. |
| `--color-error` | `#fd7468` | Error text and icons. |
| `--color-error-subtle` | `#311916` | Error alert background. |
| `--color-info` | `#5eaceb` | Info text and icons. |
| `--color-info-subtle` | `#112230` | Info alert background. |

**Light theme**

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#007082` | Brand color: primary buttons, active states, key highlights. |
| `--color-primary-hover` | `#005f6f` | Hover state for primary fills. |
| `--color-primary-active` | `#00515f` | Pressed state for primary fills. |
| `--color-on-primary` | `#ffffff` | Text and icons on primary fills. |
| `--color-primary-strong` | `#007082` | Primary as text/icon on the page background (≥4.5:1). |
| `--color-primary-subtle` | `#daf6fd` | Tinted background for selected rows, badges, info panels. |
| `--color-on-primary-subtle` | `#007082` | Text on primary-subtle backgrounds. |
| `--color-secondary` | `#204047` | Secondary actions, tags and supporting highlights. |
| `--color-secondary-hover` | `#113238` | Hover state for secondary fills. |
| `--color-on-secondary` | `#ffffff` | Text on secondary fills. |
| `--color-accent` | `#00a6df` | Sparse highlight: badges, data emphasis, decorative marks. Not for body text. |
| `--color-on-accent` | `#111111` | Text on accent fills. |
| `--color-cta` | `#12161b` | Fill for the single most important action per view (ink button). |
| `--color-cta-hover` | `#2e3338` | Hover state for the call-to-action fill. |
| `--color-on-cta` | `#ffffff` | Text on the call-to-action fill. |
| `--color-background` | `#fbfdff` | Page background. |
| `--color-surface` | `#ffffff` | Cards, panels, inputs. |
| `--color-surface-elevated` | `#ffffff` | Menus, dialogs, popovers (with shadow). |
| `--color-surface-sunken` | `#edf1f7` | Wells, code blocks, table headers, alternating bands. |
| `--color-text` | `#12161b` | Primary text and headings. |
| `--color-text-muted` | `#595e65` | Secondary text, captions, metadata (≥4.5:1 on all surfaces). |
| `--color-text-subtle` | `#81878d` | Placeholders, disabled labels, decorative meta only (≥3:1, not for essential text). |
| `--color-text-inverse` | `#ffffff` | Text on dark/ink fills. |
| `--color-border` | `#dde1e7` | Hairline dividers and card outlines (decorative). |
| `--color-border-strong` | `#8d939a` | Input and control boundaries (≥3:1, WCAG 1.4.11). |
| `--color-link` | `#007082` | Inline links in body copy (always underlined). |
| `--color-link-hover` | `#005766` | Hovered links. |
| `--color-focus-ring` | `#007082` | Keyboard focus outline (2px, offset 2px). |
| `--color-success` | `#1d7635` | Success text and icons. |
| `--color-success-subtle` | `#e1f7e3` | Success alert background. |
| `--color-warning` | `#865900` | Warning text and icons (darkened amber for contrast). |
| `--color-warning-subtle` | `#ffeecd` | Warning alert background. |
| `--color-error` | `#b32322` | Error text, icons and invalid borders. |
| `--color-error-subtle` | `#ffebe8` | Error alert background. |
| `--color-info` | `#0f68a2` | Informational text and icons. |
| `--color-info-subtle` | `#e4f2ff` | Info alert background. |

**Contrast:** 46/46 checked pairs pass. light text/background 17.81:1, light text-muted/background 6.41:1, light on-primary/primary 5.77:1, light on-cta/cta 18.16:1, light link/background 5.66:1, light border-strong/background 3.04:1, light focus-ring/background 5.66:1, dark text/background 16.13:1, dark text-muted/background 8.35:1, dark on-primary/primary 6.24:1, dark on-cta/cta 16.13:1, dark link/background 6.15:1, dark border-strong/background 3.27:1, dark focus-ring/background 6.15:1

**Color rules**
- Use semantic tokens (--color-text, --color-surface…) in components, never raw hex values.
- Only one ink (--color-cta)-filled button per view region; other actions use secondary or ghost styles.
- The accent is a highlight, not a second brand color: keep it under ~10% of any screen.
- Status colors always pair with an icon and text; never communicate state by color alone.
- Links in running text are underlined; color alone does not identify a link.

## Typography
- Headings: **Geist** (neo-grotesque, google-fonts) — Fits Precision Instrument: neo-grotesque with technical, modern, neutral character.
- Body: **Geist** (neo-grotesque) — Same family as headings, as this direction relies on weight contrast rather than a second typeface.
- Mono: **JetBrains Mono** (required)
- Licensing: SIL Open Font License 1.1 (free for commercial use; self-hosting allowed)
- Scale: 14px × 1.17; weights regular 400, medium 500, semibold 600, bold 700, heading 600
- Google Fonts: https://fonts.googleapis.com/css2?family=Geist:wght@600;700&family=JetBrains+Mono:wght@400;500&display=swap

| Style | Font | Size | Weight | Line height | Tracking |
|---|---|---|---|---|---|
| display | heading | clamp(1.875rem, 1.582rem + 1.3vw, 2.625rem) | 600 | 1.15 | -0.025em |
| h1 | heading | clamp(1.625rem, 1.38rem + 1.09vw, 2.25rem) | 600 | 1.15 | -0.015em |
| h2 | heading | clamp(1.688rem, 1.59rem + 0.43vw, 1.938rem) | 600 | 1.3 | -0.015em |
| h3 | heading | clamp(1.375rem, 1.277rem + 0.43vw, 1.625rem) | 600 | 1.3 | -0.015em |
| h4 | heading | 1.375rem | 600 | 1.3 | 0 |
| h5 | body | 1.031rem | 600 | 1.55 | 0 |
| h6 | body | 0.875rem | 600 | 1.55 | 0 |
| body-lg | body | 1.031rem | 400 | 1.55 | 0 |
| body | body | 0.875rem | 400 | 1.55 | 0 |
| small | body | 0.75rem | 400 | 1.45 | 0 |
| caption | body | 0.625rem | 500 | 1.4 | 0 |
| label | mono | 0.75rem | 600 | 1.45 | 0.08em, upper |
| button | body | 0.75rem | 600 | 1 | 0 |
| code | mono | 0.75rem | 400 | 1.6 | 0 |

- Body text stays at 14px or larger on mobile; never shrink below 14px for any readable text.
- Limit line length to 60–75 characters (max-width: 65ch on text containers).
- Use font-variant-numeric: tabular-nums for prices, tables, timers and metrics.
- Headings use Geist at weight 600; never fake bold or italic styles that are not loaded.
- Apply text-wrap: balance to headings and text-wrap: pretty to paragraphs where supported.

## Spacing & layout
- Spacing: 4px base, density **compact**; card padding 16px, card gap 12px
- Container 1440px, reading width 680px, page padding 16px → 48px
- Grid 4/8/12 columns, gutter 20px; section spacing 56px → 96px
- Mobile-first: base styles target ≥360px wide screens; add min-width media queries at the breakpoints.
- Text containers max out at 680px (≈65ch); media and grids may use the full container.
- Flush-left layout: headings, copy and CTAs share a strong left edge.
- Touch targets are at least 44×44px; on mobile, primary actions sit within thumb reach.
- No horizontal scrolling at any width ≥320px except intentional carousels/tables with visible affordance.

## Shape & surfaces
- Radius: none 0, xs 2px, sm 4px, md 6px, lg 8px, xl 12px, full 9999px
- Components: button 4px, input 4px, card 8px, dialog 12px, badge 2px, tooltip 4px, dropdown 6px
- Elevation: flat; surfaces: bordered
- Structure comes from borders and surface steps; shadows only for floating layers (menus, dialogs, toasts).
- Surfaces are bordered: 1px border in --color-border on --color-surface.
- Nested elements use a smaller radius than their container (inner radius = outer radius − padding, minimum 0).

## Motion
- Level subtle; durations instant 0ms, fast 100ms, base 160ms, slow 240ms; easing cubic-bezier(0.2, 0, 0, 1)
- Hover: background steps one neutral shade; borders brighten; no movement
- Animate only opacity and transform for movement; color/background/border for state changes.
- No entrance animations on scroll; motion is reserved for feedback (hover, press, open/close).
- Overlays (menus, dialogs) enter with --ease-enter and exit faster with --ease-exit.
- Nothing auto-plays longer than 5 seconds without a pause control; respect prefers-reduced-motion everywhere.

## Iconography
outline icons, 1.5px stroke — Lucide or Phosphor (regular), 16px in UI, 20px in navigation

## Components (mandatory for this dashboard)
- **button** — Actions. One primary per view region. Base: display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); font-family: var(--font-body); font-weight: 600. Variants: primary, secondary, tonal, ghost, destructive, link. States: hover, active, focus-visible, disabled, loading. Minimum touch target 44×44px: on mobile use size md or larger, or extend the hit area with padding.
- **input** — Text inputs and textareas. Base: height: 36px; padding: 0 var(--space-control-padding-x); background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border-strong); border-radius: var(--radius-input). Variants: textarea, search. States: hover, focus-visible, invalid, disabled, placeholder. Visible <label> above every field; placeholders are examples, never labels.
- **select** — Native select styled to match inputs. Base: appearance: none; height: 36px; padding: 0 2.25rem 0 var(--space-control-padding-x); background: var(--color-surface); border: 1px solid var(--color-border-strong); border-radius: var(--radius-input). States: focus-visible, disabled. Keep the native <select> for accessibility; draw the chevron with a background SVG in --color-text-muted.
- **checkbox** — Checkboxes, radios and switches. Base: width: 1.125rem; height: 1.125rem; accent-color: var(--color-primary); border-radius: var(--radius-xs). Variants: radio, switch. States: focus-visible, checked, disabled. Use accent-color for native controls where custom drawing is unnecessary.
- **card** — Grouped content and features. Base: background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: var(--space-card-padding); box-shadow: none. Variants: interactive. States: hover, focus-within. Make the whole card clickable via a stretched link on the title, not a wrapping <a> around block content.
- **navigation** — Sidebar + top bar. Base: height: 56px; background: var(--color-background); border-bottom: 1px solid var(--color-border); position: sticky; top: 0; z-index: 40. Variants: link, link-active, sidebar, mobile-sheet. States: hover, focus-visible. Below md, collapse links into a menu button that opens a full-height sheet; keep the primary CTA visible.
- **dropdown** — Menus and popovers. Base: background: var(--color-surface-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-dropdown); box-shadow: var(--shadow-md); padding: var(--space-1); min-width: 12rem. Variants: item. States: item-hover, item-focus-visible, open. Arrow-key navigation, Escape to close, focus returns to the trigger.
- **dialog** — Modal dialogs and drawers. Base: background: var(--color-surface-elevated); border-radius: var(--radius-dialog); box-shadow: var(--shadow-xl); padding: var(--space-6); max-width: min(560px, calc(100vw - 32px)); border: none. Variants: backdrop, drawer. States: open, close. Use the native <dialog> element with showModal(): it traps focus and handles Escape.
- **badge** — Status, tags and counts. Base: display: inline-flex; align-items: center; gap: var(--space-1); height: 1.5rem; padding: 0 var(--space-2); border-radius: var(--radius-badge). Variants: neutral, brand, success, warning, error. States: n/a. Badges carry text; a colored dot alone is not enough to convey status.
- **tooltip** — Short supplementary labels. Base: background: var(--color-text); color: var(--color-text-inverse); font-size: var(--text-xs); padding: var(--space-1-5) var(--space-2); border-radius: var(--radius-tooltip); max-width: 240px. States: open. Show on hover and keyboard focus; never put essential information or interactive content in tooltips.
- **table** — Data tables. Base: width: 100%; border-collapse: collapse; font-size: var(--text-sm); font-variant-numeric: tabular-nums. Variants: header, cell, numeric. States: row-hover, row-selected. Wrap wide tables in a horizontally scrollable container with a visible edge shadow on small screens.
- **alert** — Inline messages and banners. Base: display: flex; gap: var(--space-3); padding: var(--space-4); border-radius: var(--radius-md); border: 1px solid currentColor; border-left-width: 1px. Variants: info, success, warning, error. States: n/a. Body text inside alerts stays --color-text; only the icon and title use the status color.
- **loading** — Skeletons and spinners. Base: background: var(--color-surface-sunken); border-radius: var(--radius-sm). Variants: skeleton, spinner. States: reduced-motion. Skeletons mirror the final layout geometry to avoid layout shift.
- **emptyState** — Empty, first-run and no-results screens. Base: text-align: left; padding: var(--space-16) var(--space-6); color: var(--color-text-muted); max-width: 36rem. Variants: title, action. States: n/a. Explain what goes here and offer one clear next action.

Also specified as reusable defaults:  (full rules in the JSON spec / get_design_tokens).

## Responsive
- Breakpoints: sm 640px, md 768px, lg 1024px, xl 1280px, 2xl 1536px (min-width, mobile-first).
- Headings h1–h3 and display use fluid clamp() sizes between 360px and 1280px viewports; body size is fixed.
- Grid: 4 columns on mobile, 8 on tablet, 12 on desktop.
- Section spacing scales from 56px (mobile) to 96px (desktop).
- Navigation collapses to a menu button below md; primary CTA stays visible.
- Tables scroll horizontally inside a container on small screens; cards stack to one column below sm.

## Accessibility
- Target WCAG 2.2 AA; every color pair in the contrast table was computed, not assumed.
- Visible :focus-visible ring on every interactive element (2px, offset 2px, ≥3:1).
- Minimum 44×44px touch targets; inputs ≥16px font size.
- Never convey meaning by color alone (status, links, gains/losses).
- Respect prefers-reduced-motion and prefers-color-scheme.
- Use semantic HTML (header, nav, main, footer, button, dialog) before ARIA.

## Implementation (react, tailwind-v4)
Token file: `src/styles/tokens.css`
1. Create src/styles/tokens.css with the generated CSS (tokens.css output) and import it once, before any component styles.
2. Fonts: npm install @fontsource-variable/geist @fontsource-variable/jetbrains-mono and import them once in your entry file (main.tsx / main.ts).
3. Tailwind v4: paste the tailwindV4 output into your main CSS after @import "tailwindcss"; utilities like bg-primary, text-text-muted, font-heading, text-h1, rounded-card and shadow-md become available.
4. Build the mandatory components first using the component specs (states included), then compose pages.
5. Dark mode (if generated): it follows prefers-color-scheme automatically; set data-theme="light" or "dark" on <html> to force a theme from a toggle.
6. Verify: run validate_design_system on the final tokens, check focus visibility with the keyboard, and test at 360px, 768px and 1280px widths.

`src/main.tsx`
```ts
import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";
import "./styles/tokens.css";
```

Token CSS omitted (compact mode): call get_design_tokens with this spec id and format "css".

## Validation & confidence
0 error(s), 1 warning(s), 0 note(s); 30/30 contrast checks pass. (score 96/100).
- dark: accent and info are nearly identical (#3bb2e7 / #5eaceb).


_Observed conventions are frequencies from static analysis of public CSS and design tokens; they describe what is common, not what performs best. Curated heuristics are expert guidance, not measurements._
