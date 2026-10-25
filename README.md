# design-intelligence-mcp

An MCP server that gives Claude Code a **UI design decision layer**. When Claude starts building or
restyling a website or web app, the server infers what the product is, who it is for and how it
should feel, compares 20 design directions against research evidence, and returns a complete,
implementation-ready design specification: color tokens with computed WCAG contrast, licensed fonts
and a type scale, spacing, grid, radii, elevation, component rules with every interaction state,
motion, iconography, framework-specific setup, and CSS / Tailwind / W3C DTCG tokens.

Claude Code keeps owning the product: understanding the request, UX, flows and code. This server only
decides *how it looks*, and it respects what the user asked for and what the repository already has.

- **No paid APIs.** Everything is deterministic TypeScript; no LLM calls.
- **Local and private.** Research data lives in a local SQLite file.
- **Honest evidence.** Measurements, curated heuristics and generated recommendations are stored and
  labelled separately. Nothing claims a site is "successful" or that the dataset is bigger than it is.

---

## Contents

1. [Status: what works today](#status-what-works-today)
2. [Install](#install) — from GitHub (Method A) or npm/npx (Method B)
3. [Connect to Claude Code](#connect-to-claude-code)
4. [How automatic design selection works](#how-automatic-design-selection-works)
5. [Verify it works](#verify-it-works)
6. [Tools](#tools)
7. [Example: prompt → design specification](#example-prompt--design-specification)
8. [The research system](#the-research-system)
9. [How the design engine decides](#how-the-design-engine-decides)
10. [Configuration](#configuration)
11. [Security model](#security-model)
12. [Tests](#tests)
13. [Troubleshooting](#troubleshooting)
14. [Project layout](#project-layout)

---

## Status: what works today

| Area | State |
| --- | --- |
| MCP server (stdio), 10 tools with typed Zod schemas | Works |
| Design system generation (20 directions, palette, type, spacing, components, motion, tokens) | Works offline, immediately |
| Existing design-system detection and preservation (framework, Tailwind v3/v4, CSS variables, fonts) | Works |
| Reuse of a project's design system for follow-up work | Works (SQLite + optional `.design-intelligence/` file) |
| Token validation (contrast, hierarchy, duplicates, missing states, off-grid values) | Works |
| Claude Code integration: installer, rules file, `UserPromptSubmit` hook (command or `mcp_tool`) | Works |
| Research pipeline: resumable jobs, cache, rate limits, robots.txt, SSRF protection | Works |
| **Research dataset** | **Partial — see below** |

**Dataset coverage, honestly stated.** The curated source list has **539 sources**: **519 websites**
across 17 categories and **20 public design systems**. The bundled snapshot
(`data/snapshots/2026-10-25-design-systems.json`) contains **real analyses of the 20 design systems**
(GitHub Primer, Shopify Polaris, Twilio Paste, Salesforce Lightning, Pinterest Gestalt, Wikimedia Codex,
Workday Canvas, HashiCorp Helios, Microsoft Fluent 2, Elastic EUI, Red Hat PatternFly, NHS.UK,
Canonical Vanilla, monday.com Vibe, Kiwi.com Orbit, Ant Design, Grafana, Tailwind, Radix Colors,
Bootstrap), fetched from their public GitHub repositories on 2026-10-25 with file references and SHA-256
hashes. **None of the 519 websites has been analyzed yet**: the environment this was built in only
allowed network access to GitHub and npm, so every website fetch was refused by its network policy (the
pipeline recorded those as `blocked` and carried on, as designed). Run `research` on your own machine to
build the website dataset progressively (see [The research system](#the-research-system)). Until then,
generation relies on curated heuristics plus the design-system evidence, and every specification says
how much evidence it used.

---

## Install

Requires **Node.js 22.13 or newer** (uses the built-in `node:sqlite`, so there are no native
dependencies to compile). Node 24 LTS is recommended.

### Method A — from GitHub (works today)

A GitHub URL does not run anything by itself: you download the source, build it, and point Claude Code
at the built `dist/cli.js` on your machine.

```bash
git clone https://github.com/MagicalPee/repoforclaude.git design-intelligence-mcp
cd design-intelligence-mcp
npm ci            # installs the exact locked dependency versions
npm run build     # compiles TypeScript to dist/
npm run test:smoke   # optional: starts the built server over stdio and checks the hook
```

### Method B — npm / npx (once published)

The package is prepared for publication as `design-intelligence-mcp` (`bin`, `files`, `engines`,
`prepublishOnly` that typechecks, tests, builds and smoke-tests). After `npm publish`, users can run it
without cloning:

```bash
npx -y design-intelligence-mcp init      # register with Claude Code, install rules + hook
# or register manually:
claude mcp add --scope user design-intelligence -- npx -y design-intelligence-mcp serve
```

It has not been published from this repository yet; until it is, use Method A.

---

## Connect to Claude Code

From the cloned directory:

```bash
node dist/cli.js init              # user scope: all your projects
node dist/cli.js init --dry-run    # show what would change first
```

`init` does three things, each optional:

1. **Registers the MCP server** with `claude mcp add --scope user design-intelligence -- node /abs/path/dist/cli.js serve`.
   If the `claude` CLI is not on your PATH it prints the exact command to run. (`--no-register` skips this.)
2. **Installs instructions** as a Claude Code rule at `~/.claude/rules/design-intelligence.md`
   (content: [`integration/claude-rules.md`](integration/claude-rules.md)). Rules load like `CLAUDE.md`
   and tell Claude when to call the server and when not to. (`--no-rules` skips this.)
3. **Adds a `UserPromptSubmit` hook** to `~/.claude/settings.json` that runs on each prompt and adds a short
   context note *only* for UI work. Existing settings and hooks are preserved, a `.bak` copy is written,
   and re-running `init` replaces rather than duplicates the hook. (`--hook none` skips this.)

Options: `--scope project --project-dir PATH` writes `.mcp.json`, `.claude/rules/` and
`.claude/settings.json` inside a project instead (shareable through git; Claude Code asks for approval
before using project MCP servers). `--hook mcp_tool` uses the `mcp_tool` hook type instead of a command
(see below). `node dist/cli.js uninstall` reverses everything (`--remove-data` also deletes the research
database).

Restart Claude Code (or run `/mcp`) afterwards.

**Manual setup**, if you prefer: copy [`integration/mcp.json.example`](integration/mcp.json.example)
into a project's `.mcp.json` (or use `claude mcp add` as above), copy
[`integration/claude-rules.md`](integration/claude-rules.md) to `~/.claude/rules/` or append it to a
`CLAUDE.md`, and merge [`integration/settings.hook-command.json`](integration/settings.hook-command.json)
into your settings.

---

## How automatic design selection works

Installing an MCP server does **not** make Claude Code call it on every prompt. Three supported
mechanisms work together:

| Layer | What it does | Guarantees |
| --- | --- | --- |
| Server `instructions` + tool descriptions | Claude sees when `generate_design_system` is appropriate | Advisory |
| Rule file (`~/.claude/rules/design-intelligence.md`) | Standing instruction: consult the server before visual decisions; reuse for follow-ups; skip backend/docs/tests | Advisory, always loaded |
| `UserPromptSubmit` hook | Classifies each prompt; for UI work it adds a factual note (and the existing design system id, if any) next to the prompt; for anything else it adds nothing | Runs every prompt; adds context only |

The hook is the strongest lever Claude Code offers, but it is still not a hard guarantee:

- A hook **adds context**; Claude still decides to call the tool. In practice the note plus the rule makes
  this very reliable for clear UI tasks, but a vague prompt may not trigger it.
- The **command** hook (default) runs `node dist/cli.js hook` (~150 ms, no network). It works even before
  the MCP server has connected, and it never fails the prompt: errors produce no output and exit 0.
- The **`mcp_tool`** hook (`--hook mcp_tool`) calls the server's `check_ui_task` tool directly with the
  prompt (`${prompt}`) and working directory (`${cwd}`). It avoids spawning a process but depends on the
  server being connected and on a Claude Code version that supports `mcp_tool` hooks.
- Classification is keyword-based and deliberately conservative: backend, database, CI, test,
  documentation and debugging prompts get no context, so unrelated work pays no tokens or latency.
- **Follow-ups reuse the decision.** When a project already has a design system from this server, the
  hook note names it, and `generate_design_system` returns the stored one (`reused: true`) unless
  `redesign: true` is passed.
- **Claude Code on the web** does not read `~/.claude/settings.json`; use project scope there
  (`init --scope project`) so the hook and `.mcp.json` live in the repository.

If you want zero automation, skip the hook (`--hook none`) and just ask: "use design-intelligence for this".

---

## Verify it works

```bash
claude mcp list                          # design-intelligence should show as connected
node dist/cli.js doctor                  # Node version, database, claude CLI, network mode
echo '{"prompt":"Build a landing page for my bakery","cwd":"'$PWD'"}' | node dist/cli.js hook
```

The last command should print the context note; a backend prompt should print nothing. Then, in Claude
Code inside a web project, type a normal request such as *"Build a landing page for my bakery"*. Claude
should call `generate_design_system` before writing styles; `/mcp` shows the server's tools. Hook
execution is visible with `claude --debug` (look for `UserPromptSubmit`).

**Verified end to end** with Claude Code 2.1.310 in headless mode, in a fresh Astro project set up with
`init --scope project`, using a prompt that never mentions the server ("Plan the visual design for the
homepage of my neighbourhood sourdough bakery website…"): the `UserPromptSubmit` hook ran and injected its
note, the project-scoped server reported `connected`, Claude called `generate_design_system` by itself
with the prompt and `project_path`, received the full ~17 KB specification, and answered from it
("Warm Craft — Olive", cream `#fdf3e5` background, the runner-up direction and the confidence). To
reproduce in any web project after `init`:

```bash
claude -p "Plan the visual design for my homepage" --output-format stream-json --verbose \
  --allowedTools "mcp__design-intelligence__generate_design_system" | grep -o '"name":"mcp__design-intelligence[^"]*"'
```

You can also use everything without Claude Code:

```bash
node dist/cli.js generate "Online store for handmade ceramic mugs, warm and cozy" --project ~/code/mugs
node dist/cli.js tokens ds_xxxxxxxxxx --format css
node dist/cli.js validate path/to/tokens.json
```

---

## Tools

| Tool | Input | Output |
| --- | --- | --- |
| `generate_design_system` | `prompt` (required), `project_path`, `framework`, `brand_preferences`, `constraints`, `redesign`, `direction_id`, `write_files`, `detail` | Markdown specification (direction, rationale, evidence, colors with contrast, typography, spacing, layout, shape, motion, components, responsive and accessibility rules, implementation steps, `tokens.css`, validation, confidence) ending with a JSON summary block (`id`, colors, fonts, confidence…) |
| `get_design_tokens` | `design_system_id` or `project_path` (or `project_context` to generate) and `format`: `json`, `spec`, `dtcg`, `css`, `tailwind-v4`, `tailwind-v3` | Tokens in the requested format |
| `analyze_website` | `url`, `refresh` | Observed colors and roles, fonts and delivery, type scale, spacing, radii, shadows, layout, components, motion, accessibility signals, tech hints, classification, evidence references, limitations |
| `search_design_patterns` | `category`, `style_keywords`, `component`, `limit` | Ranked mined conventions/distinctive choices (support counts, lift, example sources) and curated heuristics/anti-patterns, plus category statistics |
| `research_websites` | `category`, `max_websites` (≤1000), `source_kind`, `refresh`, `wait_seconds`, `resume_job_id`, `cancel_job_id` | Job id and status, processed/succeeded/failed counts, recent failures |
| `get_research_status` | `job_id` (optional) | Dataset size, analyzed sources, per-category coverage, last update, cache stats, patterns, recent errors, jobs (incl. resumable) |
| `validate_design_system` | `tokens` (JSON in DTCG/nested/flat form, or CSS text), `components` | Score, contrast table, issues with recommendations |
| `list_design_directions` | — | The 20 directions with mood, best-fit categories and signature moves |
| `check_ui_task` | `prompt`, `cwd` | Hook helper: context note or empty string |
| `export_research_dataset` | — | Writes the evidence dataset JSON to the data directory |

Large outputs declare `_meta["anthropic/maxResultSizeChars"]` so Claude Code keeps full specifications
inline (a full spec is ~15–30 KB of Markdown; `detail: "compact"` omits the CSS). `generate_design_system`
deliberately has no MCP `outputSchema`: when a tool returns `structuredContent`, Claude Code passes only
that JSON to the model, which would hide the specification itself (observed in testing, see below).

---

## Example: prompt → design specification

Prompt: *"Build a landing page for an AI-powered contract review tool for law firms. It should feel
trustworthy and premium, not like a typical purple AI startup."*

Abridged result (full output: [`docs/examples/ai-contract-review-landing.md`](docs/examples/ai-contract-review-landing.md)):

- **Direction: Lab Notebook** — off-white paper, serif + mono pairing, fine grid lines, annotation marks.
  Chosen over *Signal on Graphite*, *Editorial Authority* and *Precision Instrument*, each with a stated reason.
- **Inference:** category `ai-products` (+ landing page), audience `professionals`, purple excluded
  (the brief's negation is detected; violet and indigo hues are also avoided by default for AI products).
- **Color (light + dark):** primary `#006c49` ("lab green"), paper background `#faf3ea`, text
  `#1b150c` (16.45:1), muted `#655c50` (5.96:1); all 46 checked pairs pass, including labels on hover and
  pressed states.
- **Typography:** Lora (headings) + Onest (body) + Source Code Pro, all SIL OFL from Google Fonts, 17px
  base × 1.25, fluid `clamp()` headings, line heights and tracking per step, Google Fonts URL and
  Fontsource packages.
- **Signature moves:** faint 8px graph-paper grid behind figures; mono annotations with numbered markers
  linking claims to sources; figures with captions instead of decorative illustrations.
- **Avoid:** purple gradients, sparkle icons, glowing orbs, the interchangeable SaaS template, glassmorphism.
- **Components:** button (primary/secondary/tonal/ghost/destructive/link, 3 sizes, all states), nav,
  card, input, badge, loading, empty state as mandatory for a landing page; dialog, table, tooltip,
  alert and more as reusable defaults.
- **Implementation:** framework-specific steps and snippets, `tokens.css` with light/dark themes
  (`prefers-color-scheme` + `data-theme` override) and reduced-motion handling.

Two more real outputs: an existing project whose colors and fonts are **preserved and aliased**
([`docs/examples/existing-project-preserved.md`](docs/examples/existing-project-preserved.md)), and a
dark-first React + Tailwind v4 dashboard
([`docs/examples/k8s-dashboard-compact.md`](docs/examples/k8s-dashboard-compact.md)).

---

## The research system

### What is analyzed

| Source kind | Method | Count |
| --- | --- | --- |
| Websites | Initial HTML + up to 8 linked stylesheets (+ `@import`), parsed statically | 519 curated, 17 categories |
| Public design systems | Published token/source files (JSON/JSON5/DTCG, YAML, SCSS, CSS, JS/TS object literals) from `raw.githubusercontent.com`, parsed statically (never executed) | 20 |

For each source the analyzer records colors and their roles (background, text, brand candidates, CTA,
links, borders), dark-mode support, font families with role, classification and delivery (Google Fonts,
Adobe Fonts, self-hosted, system), h1–h6 and body sizes (including `clamp()`), type-scale ratio, weights,
line heights, tracking, spacing base unit and density, radii (buttons, cards), shadow style, container
widths, breakpoints, sticky headers, gradients, backdrop blur, motion durations/easings, reduced-motion
support, hero media and CTA counts, icon libraries, framework hints, and accessibility signals (`lang`,
zoom blocking, missing `alt`, body-text contrast, focus styles, skip links). Every observation has a
confidence score and evidence (selector or token path + file URL); every fetched file is referenced with
status, size, SHA-256 and timestamp. Limitations are stored with each analysis — most importantly that
this is **static analysis**: computed styles, JavaScript-injected styles and true on-screen dominance are
not measured.

Curated metadata (category, audience, positioning) is labelled `curator_judgement`. **No traffic,
conversion, revenue or "success" data is collected or claimed**; mined patterns describe frequency, not
effectiveness.

### Running research

```bash
node dist/cli.js research --max 50                       # 50 never-analyzed / stalest sources
node dist/cli.js research --category fintech --max 30
node dist/cli.js research --kind design_system --refresh
node dist/cli.js research --resume job_ab12cd34          # continue an interrupted job
node dist/cli.js status
```

Or from Claude: `research_websites` (runs in the background inside the server and returns after
`wait_seconds`). Building toward ~1,000 analyzed sources is meant to happen **progressively** — a few
dozen at a time, then refreshed every 30 days — never on every prompt.

- **Resumable:** each source's result is committed as soon as it finishes. A killed process leaves the job
  `interrupted`; `--resume` continues with the unfinished items.
- **Incremental and cached:** analyses younger than `DIM_REANALYZE_AFTER_DAYS` are skipped. Fetched files
  are cached in SQLite and revalidated with `ETag`/`Last-Modified`, so re-analysis after an analyzer
  upgrade needs almost no network.
- **Polite:** concurrency 4 (max 16), ≥1.5 s between requests to the same host, `Crawl-delay` honoured
  (capped at 10 s), retries with exponential backoff and `Retry-After` for 429/5xx, 15 s timeouts.
- **robots.txt (RFC 9309):** checked for every page *and* every stylesheet host; 4xx means allowed,
  5xx/unreachable means disallowed. The user agent identifies itself as `DesignIntelligenceBot`.
- **Failures never stop a job.** Each failure is stored with its reason (`blocked`, HTTP status, timeout…).

### Adding sources

Add entries to `data/seed-websites.json` (format `[name, url, audience, positioning, tags]` per
category), or keep your own list outside the repo and set `DIM_EXTRA_SEEDS_FILE=/path/to/my-seeds.json`
(same format). Design systems are configured in `data/seed-design-systems.json` with exact file paths.

### Sharing and backup

```bash
node dist/cli.js export --out dataset.json                     # full evidence dump (no cached page bodies)
node dist/cli.js snapshot --kind website --out my-snapshot.json   # portable latest-analysis-per-source
node dist/cli.js import my-snapshot.json                       # load a snapshot from a teammate
```

Snapshots in `data/snapshots/` are imported automatically on first start.

### Respecting sites

The crawler fetches one public page and its stylesheets per site, identifies itself, honours robots.txt
and rate limits, never logs in, never bypasses paywalls or bot protection, never executes scripts, and
does not download or redistribute images, fonts or other assets. Raw HTML/CSS is cached only locally to
avoid refetching; exports and snapshots contain derived measurements, not page bodies.

---

## How the design engine decides

1. **Inference** from the prompt, brand preferences and constraints: category (17), website type
   (landing page, marketing site, web app, dashboard, store, portfolio, editorial, docs, community),
   audience, seven personality traits (energy, playfulness, sophistication, warmth, techness, density,
   boldness), explicit colors (hex or words like "navy", in the order mentioned), negations ("no purple",
   "avoid gradients"), light/dark/both, named fonts, WCAG level, system-fonts-only, corner style, no
   animation, framework and styling system.
2. **Repository inspection** (read-only, bounded, nothing executed): framework, Tailwind v3/v4,
   CSS Modules, Sass, CSS-in-JS, component libraries, shadcn, fonts (Fontsource packages, `next/font`,
   Google Fonts links, CSS), CSS custom properties and Tailwind theme values, observed background, text,
   brand colors, fonts and radii. An **established** design system is preserved unless `redesign` is set:
   its colors and fonts are locked, and generated semantic tokens alias the existing variables.
3. **Direction scoring.** 20 parametric design languages (not templates) are scored on category fit,
   personality alignment, website type, explicitly requested or rejected styles, constraints, agreement
   with observed category conventions (weighted by sample size), similarity to the existing design, a
   **recent-use penalty** (directions, hues and fonts used by recently generated systems are discouraged),
   a **generic-look penalty**, and a small deterministic jitter. The top three alternatives are reported
   with the reason they lost.
4. **Generation** inside the chosen direction: OKLCH palette with gamut mapping and contrast enforcement
   (text ≥7:1, muted ≥4.5:1, labels on fills ≥4.5:1 including hover/pressed, input borders and focus
   rings ≥3:1, status colors kept distinct from the brand hue); font pairing from a catalog of 117
   OFL-licensed Google Fonts families (overused defaults penalised; requested or existing fonts kept); a
   10-step modular scale with fluid `clamp()` headings; 4 px spacing with density-dependent semantics;
   grid, breakpoints and section rhythm; radii and elevation per direction; motion with reduced-motion
   rules; component specs with every state; implementation guide for the detected stack.
5. **Validation** of the generated tokens, and a confidence score combining inference strength, research
   coverage, the margin over the runner-up and validation results.

Same brief + same project → same result (deterministic). Different projects → different results, even
for near-identical generic briefs. Directions: Precision Instrument, Signal on Graphite, Editorial
Authority, Lab Notebook, Quiet Luxury, Swiss Grid, Kinetic Studio, Warm Craft, Trust Ledger, Calm
Workspace, Night Arena, Neo-Brutalist Utility, Soft Pop, Gallery Minimal, Retail Clarity, Organic Field,
Civic Clarity, Clinical Calm, Retro Revival, Heritage Classic.

### Storage

SQLite (WAL mode) at `~/.local/share/design-intelligence-mcp/research.db` (or `%LOCALAPPDATA%` on
Windows). Versioned migrations. Tables: `categories`, `sources`, `analyses`, `observations`,
`color_observations`, `font_observations`, `component_observations`, `color_palettes`,
`source_references`, `http_cache`, `robots_cache`, `design_patterns` (origin `mined` or
`curated_heuristic`), `research_jobs`, `research_job_items`, `design_systems` (generated
recommendations, kept apart from evidence), `meta`.

---

## Configuration

All optional; see [`.env.example`](.env.example). Pass them via `claude mcp add --env KEY=value …` or
your shell.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DIM_DATA_DIR` / `DIM_DB_PATH` | XDG data dir | Where the database and exports live |
| `DIM_CONCURRENCY` | 4 | Parallel sources per job (1–16) |
| `DIM_PER_HOST_INTERVAL_MS` | 1500 | Minimum gap between requests to one host |
| `DIM_REQUEST_TIMEOUT_MS` | 15000 | Per-request timeout |
| `DIM_MAX_RETRIES` | 2 | Retries for network errors, 429, 5xx |
| `DIM_MAX_HTML_BYTES` / `DIM_MAX_CSS_BYTES` / `DIM_MAX_TOTAL_CSS_BYTES` | 2 MB / 1.5 MB / 6 MB | Size caps (after decompression) |
| `DIM_MAX_STYLESHEETS` | 8 | External stylesheets per page |
| `DIM_REANALYZE_AFTER_DAYS` | 30 | Freshness window |
| `DIM_USER_AGENT` | `DesignIntelligenceBot/…` | Crawler identity |
| `DIM_USE_PROXY` | false | Route research through `HTTPS_PROXY` (see security note) |
| `DIM_EXTRA_SEEDS_FILE` | — | Additional curated sources |
| `DIM_LOG_LEVEL` | info | stderr log level |

**Optional LLM enhancement:** none is required or used. If you want natural-language refinements, let
Claude (which is already in the loop) adjust the returned tokens and run `validate_design_system`.

---

## Security model

- **SSRF:** only `http`/`https` on default ports; no credentials in URLs; single-label and internal
  suffixes (`localhost`, `.local`, `.internal`, `.home.arpa`, …) refused; IP literals checked against all
  private, loopback, link-local (incl. `169.254.169.254`), CGNAT, multicast, reserved, NAT64, 6to4,
  Teredo and IPv4-mapped IPv6 ranges; decimal/hex IP encodings normalised first.
- **DNS rebinding:** the IP is validated inside the socket's own DNS lookup, so the address checked is the
  address connected to; a host with *any* private record is refused.
- **Redirects** are followed manually (max 5) and every hop is re-validated and robots-checked.
- **Responses:** content-type allowlists, binary types refused, size caps counted after decompression
  (compression bombs stop at the cap), timeouts on headers and body.
- **Untrusted content:** HTML/CSS is parsed as data; scripts are discarded unread; nothing is executed or
  followed except stylesheets; page text (e.g. headings) is not stored. Project config files such as
  `tailwind.config.js` are parsed statically, never `require`d (there is a test that proves it).
- **Proxy mode** (`DIM_USE_PROXY=1`): the proxy resolves DNS, so only a pre-resolution check is possible;
  enable it only for a proxy you trust.
- **Hook safety:** the hook reads only the prompt and cwd, never blocks the prompt, and exits 0 on any error.

---

## Tests

```bash
npm test            # 152 tests (vitest), ~4 s, no internet needed
npm run test:smoke  # after npm run build: drives dist/cli.js over real stdio + the hook CLI
npm run check       # typecheck + tests + build + smoke
```

Covered: server startup and tool listing; input validation and actionable errors; output schemas
(validated by the MCP client); URL validation, private-range blocking, DNS-rebinding defence, redirect
re-validation, size limits, compression bombs, content types, timeouts and retries; per-host rate
limiting and concurrency caps; robots.txt parsing and RFC 9309 fallbacks; CSS/HTML/token parsing
(JSON5/DTCG/YAML/SCSS/JS); website analysis end to end against a local server, caching and ETag
revalidation, partial failures; research jobs with mixed outcomes, incremental skipping, cancellation and
crash resume; database migrations, rollback, export and snapshot round-trips; pattern mining and search;
prompt inference; repository inspection (incl. no execution of config files); generation determinism,
diversity, contrast safety across 14 briefs, explicit preferences, existing-system preservation, reuse
and redesign; the validator; the installer (settings merge, idempotency, invalid JSON, uninstall); and
UI-task classification for the hook.

Last run in this repository: **152 passed, 0 failed**; smoke: **7/7 checks passed**.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `node:sqlite is unavailable` | Upgrade to Node 22.13+ (`node -v`). |
| Server not listed in `claude mcp list` | Re-run `node dist/cli.js init` or the printed `claude mcp add …` command; restart Claude Code. |
| Server listed but failing | Run the command from `claude mcp get design-intelligence` yourself; check that `dist/` exists (`npm run build`) and paths are absolute. |
| Claude does not call the tool | Check the rule file exists, run the hook test above, use `claude --debug`; for vague prompts ask explicitly once. |
| Hook output never appears | Make sure `settings.json` is valid JSON; `init` refuses to edit invalid files. Cloud sessions need `--scope project`. |
| Research fails with `blocked … robots.txt unreachable` | The site (or your network) refused the connection; the crawler treats unreachable robots.txt as "disallow". Check connectivity or your proxy (`DIM_USE_PROXY`). |
| Website analysis has few colors/fonts | The site renders styles with JavaScript; the analysis notes this limitation. |
| Want a different look | `generate_design_system` with `redesign: true`, or `direction_id` from `list_design_directions`. |
| Start over | `node dist/cli.js uninstall --remove-data` (or delete the data directory). |

---

## Project layout

```
src/
  server.ts            MCP tools (Zod schemas, annotations, errors)
  cli.ts               serve | init | uninstall | generate | tokens | analyze | research | status | …
  app.ts               database, seeds, snapshots, research service
  db/                  node:sqlite wrapper, migrations, data access
  net/                 SSRF guard, safe fetcher, rate limiter, robots.txt
  analysis/            color science, CSS/HTML parsers, profile builder, website + token analyzers
  research/            seeds, cached fetcher, resumable job service, snapshots
  patterns/            style classifier, pattern miner, search
  knowledge/           font catalog, 20 design directions, curated heuristics
  design/              inference, repo inspector, scoring, palette, typography, foundations,
                       components, exporters, implementation guide, validator, renderer, generator
  integration/         UI-task classifier, rules text, Claude Code installer
data/                  seed websites, design-system configs, research snapshots
integration/           ready-to-copy rules, hook settings and .mcp.json examples
docs/examples/         real generated specifications
test/                  vitest suites + fixtures; scripts/smoke.mjs for the built server
```

## License

MIT — see [LICENSE](LICENSE). Fonts recommended by the engine are SIL Open Font License families;
analyzed design systems remain under their own licenses and are not redistributed (only derived
measurements are stored).
