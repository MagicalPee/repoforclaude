import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative } from "node:path";
import { toHex } from "../analysis/color.js";
import { parseCss, type ParsedCss, resolveVars } from "../analysis/cssParser.js";
import { buildProfile, type StyleFact } from "../analysis/profileBuilder.js";
import { flattenJsObjects } from "../analysis/tokenAnalyzer.js";
import { lookupFont } from "../knowledge/fonts.js";
import type { SiteProfile } from "../types.js";

export type FrameworkId =
  | "nextjs"
  | "nuxt"
  | "sveltekit"
  | "svelte"
  | "astro"
  | "remix"
  | "gatsby"
  | "angular"
  | "solid"
  | "vue"
  | "react"
  | "plain-html"
  | "unknown";

export interface RepoInspection {
  path: string;
  exists: boolean;
  framework: { id: FrameworkId; version?: string; evidence: string[] };
  styling: {
    tailwind?: { version: 3 | 4 | "unknown"; configFile?: string; cssEntry?: string };
    cssModules: boolean;
    sass: boolean;
    cssInJs?: string;
    componentLibrary?: string;
    shadcn: boolean;
    globalCss: string[];
  };
  fonts: Array<{ family: string; source: string }>;
  tokens: {
    colors: Array<{ name: string; hex: string; file: string }>;
    fonts: Array<{ name: string; value: string; file: string }>;
    radii: Array<{ name: string; value: string; file: string }>;
    spacing: Array<{ name: string; value: string; file: string }>;
  };
  observed?: {
    background?: string;
    text?: string;
    brandCandidates: string[];
    headingFont?: string;
    bodyFont?: string;
    monoFont?: string;
    dominantRadiusPx?: number;
    buttonRadiusPx?: number;
    supportsDarkMode: boolean;
    bodySizePx?: number;
  };
  existingSpec?: { id: string; directionId?: string; file: string };
  established: boolean;
  strength: number;
  filesScanned: number;
  summary: string;
  warnings: string[];
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".astro",
  ".vercel",
  ".netlify",
  ".turbo",
  ".cache",
  "coverage",
  "vendor",
  "out",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  "storybook-static",
]);

const MAX_ENTRIES = 6000;
const MAX_STYLE_FILES = 80;
const MAX_STYLE_BYTES = 1_500_000;
const MAX_FILE_BYTES = 400_000;

function walk(root: string): string[] {
  const out: string[] = [];
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  let seen = 0;
  while (stack.length > 0) {
    const { dir, depth } = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (++seen > MAX_ENTRIES) return out;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name) && !name.startsWith(".") && depth < 7) stack.push({ dir: full, depth: depth + 1 });
        else if (name === ".design-intelligence") stack.push({ dir: full, depth: depth + 1 });
      } else if (st.isFile() && st.size <= MAX_FILE_BYTES) {
        out.push(full);
      }
    }
  }
  return out;
}

function readText(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

const STYLE_PRIORITY = /(global|globals|tokens?|theme|variables|vars|base|app|index|main|style|styles|design)/i;

/** Read-only inspection of a project directory. Nothing is executed; config files are parsed statically. */
export function inspectRepository(projectPath: string): RepoInspection {
  const empty: RepoInspection = {
    path: projectPath,
    exists: false,
    framework: { id: "unknown", evidence: [] },
    styling: { cssModules: false, sass: false, shadcn: false, globalCss: [] },
    fonts: [],
    tokens: { colors: [], fonts: [], radii: [], spacing: [] },
    established: false,
    strength: 0,
    filesScanned: 0,
    summary: "Project path not inspected.",
    warnings: [],
  };
  if (!isAbsolute(projectPath)) return { ...empty, summary: "project_path must be an absolute path.", warnings: ["project_path must be absolute"] };
  if (!existsSync(projectPath) || !statSync(projectPath).isDirectory()) {
    return { ...empty, summary: `No directory at ${projectPath}; treating as a new project.` };
  }
  const root = realpathSync(projectPath);
  const files = walk(root);
  const rel = (f: string) => relative(root, f);
  const result: RepoInspection = { ...empty, path: root, exists: true, filesScanned: files.length };

  // ----- package.json & framework -----
  const pkgPath = join(root, "package.json");
  let deps: Record<string, string> = {};
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readText(pkgPath)) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      deps = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch {
      result.warnings.push("package.json could not be parsed");
    }
  }
  const has = (name: string) => name in deps;
  const fwChecks: Array<[FrameworkId, string, boolean]> = [
    ["nextjs", "next", has("next")],
    ["nuxt", "nuxt", has("nuxt")],
    ["sveltekit", "@sveltejs/kit", has("@sveltejs/kit")],
    ["astro", "astro", has("astro")],
    ["remix", "@remix-run/react", has("@remix-run/react") || has("@react-router/dev")],
    ["gatsby", "gatsby", has("gatsby")],
    ["angular", "@angular/core", has("@angular/core")],
    ["solid", "solid-js", has("solid-js")],
    ["svelte", "svelte", has("svelte")],
    ["vue", "vue", has("vue")],
    ["react", "react", has("react")],
  ];
  const fw = fwChecks.find(([, , ok]) => ok);
  if (fw) {
    result.framework = { id: fw[0], version: deps[fw[1]], evidence: [`package.json depends on ${fw[1]}`] };
  } else if (files.some((f) => f.endsWith(".html"))) {
    result.framework = { id: "plain-html", evidence: ["HTML files without a JS framework dependency"] };
  }

  // ----- styling system -----
  const twVersion = deps.tailwindcss ?? deps["@tailwindcss/vite"] ?? deps["@tailwindcss/postcss"];
  const twConfig = files.find((f) => /^tailwind\.config\.(js|cjs|mjs|ts)$/.test(basename(f)));
  const cssFiles = files.filter((f) => /\.(css|scss)$/.test(f) && !f.endsWith(".min.css"));
  const twV4Entry = cssFiles.find((f) => /@import\s+["']tailwindcss["']|@theme\b/.test(readText(f)));
  if (twVersion || twConfig || twV4Entry) {
    const major = twVersion ? Number(/(\d+)/.exec(twVersion)?.[1]) : twV4Entry ? 4 : 3;
    result.styling.tailwind = {
      version: major === 4 ? 4 : major === 3 ? 3 : "unknown",
      configFile: twConfig ? rel(twConfig) : undefined,
      cssEntry: twV4Entry ? rel(twV4Entry) : undefined,
    };
  }
  result.styling.cssModules = files.some((f) => /\.module\.(css|scss)$/.test(f));
  result.styling.sass = has("sass") || files.some((f) => f.endsWith(".scss"));
  result.styling.cssInJs = ["styled-components", "@emotion/react", "@vanilla-extract/css", "@stitches/react", "@pandacss/dev"].find(has);
  result.styling.componentLibrary = ["@mui/material", "@chakra-ui/react", "@mantine/core", "antd", "@radix-ui/themes", "vuetify", "@nextui-org/react", "@heroui/react", "daisyui", "bootstrap"].find(has);
  result.styling.shadcn = existsSync(join(root, "components.json"));

  // ----- fonts from dependencies and imports -----
  const addFont = (family: string, source: string) => {
    const clean = family.replace(/_/g, " ").trim();
    if (clean && !result.fonts.some((f) => f.family.toLowerCase() === clean.toLowerCase())) result.fonts.push({ family: clean, source });
  };
  for (const dep of Object.keys(deps)) {
    const m = /^@fontsource(?:-variable)?\/(.+)$/.exec(dep);
    if (m) {
      const slug = m[1]!;
      const known = lookupFont(slug.replace(/-/g, " "));
      addFont(known?.family ?? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), `package.json: ${dep}`);
    }
  }
  const codeFiles = files.filter((f) => /\.(tsx|jsx|ts|js|vue|svelte|astro|html)$/.test(f) && !/\.(test|spec|stories)\./.test(f)).slice(0, 400);
  const embeddedStyles: Array<{ file: string; css: string }> = [];
  for (const f of codeFiles) {
    const text = readText(f);
    for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']next\/font\/google["']/g)) {
      for (const name of m[1]!.split(",")) {
        const fam = name.trim().split(/\s+as\s+/)[0]!;
        if (fam) addFont(fam, `${rel(f)}: next/font/google`);
      }
    }
    for (const m of text.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/g)) {
      for (const part of m[1]!.split("&")) {
        const fam = /^family=([^:&]+)/.exec(part)?.[1];
        if (fam) addFont(decodeURIComponent(fam.replace(/\+/g, " ")), `${rel(f)}: Google Fonts link`);
      }
    }
    if (/\.(vue|svelte|astro|html)$/.test(f)) {
      for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) embeddedStyles.push({ file: rel(f), css: m[1]! });
    }
  }

  // ----- CSS tokens and observed styles -----
  const ordered = [...cssFiles].sort((a, b) => Number(STYLE_PRIORITY.test(basename(b))) - Number(STYLE_PRIORITY.test(basename(a))));
  const sheets: Array<{ css: ParsedCss; file: string }> = [];
  let bytes = 0;
  for (const f of ordered.slice(0, MAX_STYLE_FILES)) {
    const text = readText(f);
    if (bytes + text.length > MAX_STYLE_BYTES) break;
    bytes += text.length;
    sheets.push({ css: parseCss(text), file: rel(f) });
  }
  for (const e of embeddedStyles.slice(0, 60)) sheets.push({ css: parseCss(e.css), file: e.file });
  result.styling.globalCss = sheets
    .filter((s) => s.css.customProperties.size > 0 || /global|app|index|main|style/i.test(basename(s.file)))
    .map((s) => s.file)
    .filter((f) => /\.(css|scss)$/.test(f))
    .slice(0, 5);

  const customProperties: ParsedCss["customProperties"] = new Map();
  for (const { css } of sheets) {
    for (const [name, defs] of css.customProperties) {
      const list = customProperties.get(name) ?? [];
      list.push(...defs);
      customProperties.set(name, list);
    }
  }
  const seen = new Set<string>();
  for (const { css, file } of sheets) {
    for (const [name, defs] of css.customProperties) {
      if (seen.has(name)) continue;
      const def = defs.find((d) => !d.media && !/dark/i.test(d.selector)) ?? defs[0]!;
      const value = resolveVars(def.value, customProperties).trim();
      seen.add(name);
      const lower = name.toLowerCase();
      if (/font|family|typeface/.test(lower) && /[a-z]/i.test(value) && !/^\d/.test(value)) {
        result.tokens.fonts.push({ name, value, file });
      } else if (/radius|rounded|corner/.test(lower)) {
        result.tokens.radii.push({ name, value, file });
      } else if (/space|spacing|gap|gutter|size-\d|^--s-\d/.test(lower) && /\d/.test(value)) {
        result.tokens.spacing.push({ name, value, file });
      } else {
        const hex = /^(#|rgb|hsl|oklch|oklab|hwb)|^[a-z]+$/i.test(value) ? toHex(value) : null;
        if (hex && !/shadow/.test(lower)) result.tokens.colors.push({ name, hex, file });
      }
    }
  }
  result.tokens.colors = result.tokens.colors.slice(0, 80);
  result.tokens.fonts = result.tokens.fonts.slice(0, 20);
  result.tokens.radii = result.tokens.radii.slice(0, 20);
  result.tokens.spacing = result.tokens.spacing.slice(0, 40);

  // Tailwind v3 theme (parsed, never executed).
  if (twConfig) {
    const text = readText(twConfig);
    const flat = flattenJsObjects(text);
    for (const [path, value] of flat) {
      if (/(^|\.)colors\./.test(path)) {
        const hex = toHex(value);
        if (hex) result.tokens.colors.push({ name: `tailwind:${path.replace(/^.*?colors\./, "")}`, hex, file: rel(twConfig) });
      } else if (/borderRadius\./.test(path)) {
        result.tokens.radii.push({ name: `tailwind:${path.replace(/^.*?borderRadius\./, "")}`, value, file: rel(twConfig) });
      }
    }
    const fontBlock = /fontFamily\s*:\s*\{([\s\S]*?)\}/.exec(text)?.[1];
    if (fontBlock) {
      for (const m of fontBlock.matchAll(/["']?([\w-]+)["']?\s*:\s*\[\s*["']([^"']+)["']/g)) {
        result.tokens.fonts.push({ name: `tailwind:fontFamily.${m[1]}`, value: m[2]!, file: rel(twConfig) });
      }
    }
  }

  const facts: StyleFact[] = [];
  for (const { css, file } of sheets) {
    for (const d of css.declarations) facts.push({ selector: d.selector, property: d.property, value: resolveVars(d.value, customProperties), media: d.media, sourceRef: file });
  }
  let profile: SiteProfile | undefined;
  if (facts.length > 0) {
    profile = buildProfile({
      sourceKind: "website",
      url: `file://${root}`,
      finalUrl: `file://${root}`,
      facts,
      fontFaces: sheets.flatMap((s) => s.css.fontFaces),
      fontLinks: [],
      mediaQueries: sheets.flatMap((s) => s.css.mediaQueries),
      keyframes: 0,
      limitations: [],
    });
    result.observed = {
      background: profile.colors.background,
      text: profile.colors.text,
      brandCandidates: profile.colors.brandCandidates,
      headingFont: profile.typography.headingFont,
      bodyFont: profile.typography.bodyFont,
      monoFont: profile.typography.monoFont,
      dominantRadiusPx: profile.shape.dominantRadiusPx,
      buttonRadiusPx: profile.shape.buttonRadiusPx,
      supportsDarkMode: profile.colors.supportsDarkMode,
      bodySizePx: profile.typography.bodySizePx,
    };
    for (const f of profile.typography.fonts) {
      if (f.classification !== "system" && f.role !== "declared") addFont(f.family, `CSS font-family (${f.role})`);
    }
  }

  // ----- previously generated spec -----
  const specFile = join(root, ".design-intelligence", "design-system.json");
  if (existsSync(specFile)) {
    try {
      const spec = JSON.parse(readText(specFile)) as { id?: string; direction?: { id?: string } };
      if (spec.id) result.existingSpec = { id: spec.id, directionId: spec.direction?.id, file: rel(specFile) };
    } catch {
      result.warnings.push(".design-intelligence/design-system.json is not valid JSON");
    }
  }

  // ----- how established is the current design? -----
  const colorScore = Math.min(1, result.tokens.colors.length / 8);
  const fontScore = result.fonts.length > 0 || result.tokens.fonts.length > 0 ? 1 : 0;
  const shapeScore = result.tokens.radii.length > 0 || result.tokens.spacing.length > 0 ? 1 : 0;
  const observedScore = result.observed?.background && result.observed.text ? 1 : 0;
  result.strength = Math.round((colorScore * 0.4 + fontScore * 0.25 + shapeScore * 0.15 + observedScore * 0.2) * 100) / 100;
  result.established = result.strength >= 0.55 || Boolean(result.existingSpec);

  const parts = [
    `${result.framework.id}${result.framework.version ? ` ${result.framework.version}` : ""}`,
    result.styling.tailwind ? `Tailwind ${result.styling.tailwind.version}` : result.styling.cssModules ? "CSS Modules" : result.styling.sass ? "Sass" : "plain CSS",
    result.styling.componentLibrary ? `component library ${result.styling.componentLibrary}` : "",
    `${result.tokens.colors.length} color tokens`,
    result.fonts.length ? `fonts: ${result.fonts.map((f) => f.family).join(", ")}` : "no explicit fonts",
  ].filter(Boolean);
  result.summary = `${result.established ? "Established design system detected" : "No established design system"} (${parts.join("; ")}).`;
  return result;
}
