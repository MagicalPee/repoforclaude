import type { RepoInspection } from "./repoInspector.js";
import type { TypographySpec } from "./typography.js";

export interface ImplementationGuide {
  framework: string;
  styling: string;
  tokenFile: string;
  steps: string[];
  fontSetup: string;
  snippets: Record<string, string>;
  integrationNotes: string[];
}

interface GuideInput {
  framework?: string;
  styling?: string;
  repo?: RepoInspection;
  typography: TypographySpec;
  preserveExisting: boolean;
  tailwindVersion?: 3 | 4 | "unknown";
  existingMapping: Array<{ existing: string; token: string }>;
}

function nextFontSnippet(ty: TypographySpec): string {
  const fonts = [ty.heading, ty.body, ty.mono].filter((f, i, a) => f.nextFontImport && a.findIndex((x) => x.family === f.family) === i);
  if (fonts.length === 0) return "// Fonts are system or project-provided; no next/font setup needed.";
  const imports = fonts.map((f) => f.nextFontImport).join(", ");
  const decls = fonts
    .map((f) => {
      const v = `--font-${f.role}-loaded`;
      const weights = f.variable ? "" : `, weight: [${f.weights.map((w) => `"${w}"`).join(", ")}]`;
      return `const ${f.role}Font = ${f.nextFontImport}({ subsets: ["latin"], display: "swap", variable: "${v}"${weights} });`;
    })
    .join("\n");
  const classes = fonts.map((f) => `\${${f.role}Font.variable}`).join(" ");
  return `// app/layout.tsx
import { ${imports} } from "next/font/google";
import "./tokens.css";

${decls}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={\`${classes}\`}>
      <body>{children}</body>
    </html>
  );
}

/* Then point the font tokens at the loaded fonts, e.g. in tokens.css:
   --font-heading: var(--font-heading-loaded), ${ty.heading.stack.split(", ").slice(1).join(", ")}; */`;
}

export function buildImplementationGuide(input: GuideInput): ImplementationGuide {
  const fw = input.repo?.framework.id && input.repo.framework.id !== "unknown" ? input.repo.framework.id : (input.framework ?? "plain-html");
  const tw = input.repo?.styling.tailwind ?? (input.styling === "tailwind" ? { version: input.tailwindVersion ?? 4 } : undefined);
  const styling = tw ? `tailwind-v${tw.version}` : input.repo?.styling.cssModules || input.styling === "css-modules" ? "css-modules" : input.repo?.styling.cssInJs ?? input.styling ?? "css-variables";
  const ty = input.typography;

  const existingCss = input.repo?.styling.globalCss[0];
  const tokenFile =
    input.preserveExisting && existingCss
      ? existingCss
      : fw === "nextjs"
        ? "app/tokens.css (or src/app/tokens.css)"
        : fw === "nuxt"
          ? "assets/css/tokens.css"
          : fw === "sveltekit" || fw === "svelte"
            ? "src/app.css"
            : fw === "astro"
              ? "src/styles/tokens.css"
              : fw === "angular"
                ? "src/styles/tokens.css (add to angular.json styles)"
                : fw === "plain-html"
                  ? "css/tokens.css"
                  : "src/styles/tokens.css";

  const fontPkgs = [ty.heading, ty.body, ...(ty.monoUse !== "optional" ? [ty.mono] : [])]
    .filter((f, i, a) => f.fontsourcePackage && a.findIndex((x) => x.family === f.family) === i)
    .map((f) => f.fontsourcePackage!);
  const installFonts = fontPkgs.length ? `npm install ${fontPkgs.join(" ")}` : "";
  const importFonts = fontPkgs.map((p) => `import "${p}";`).join("\n");

  let fontSetup: string;
  const snippets: Record<string, string> = {};
  switch (fw) {
    case "nextjs":
      fontSetup = "Use next/font/google (self-hosts automatically, no layout shift).";
      snippets["app/layout.tsx"] = nextFontSnippet(ty);
      break;
    case "nuxt":
      fontSetup = installFonts ? `${installFonts}, then add the packages to nuxt.config css[] (or use the @nuxt/fonts module, which resolves Google Fonts by family name).` : "No web fonts to load.";
      snippets["nuxt.config.ts"] = `export default defineNuxtConfig({\n  css: [${fontPkgs.map((p) => `"${p}"`).join(", ")}${fontPkgs.length ? ", " : ""}"~/assets/css/tokens.css"],\n});`;
      break;
    case "astro":
      fontSetup = installFonts ? `${installFonts} and import them in your base layout frontmatter.` : "No web fonts to load.";
      snippets["src/layouts/Base.astro"] = `---\n${importFonts}\nimport "../styles/tokens.css";\n---`;
      break;
    case "sveltekit":
    case "svelte":
      fontSetup = installFonts ? `${installFonts} and import them in src/routes/+layout.svelte.` : "No web fonts to load.";
      snippets["src/routes/+layout.svelte"] = `<script>\n  ${importFonts.replace(/\n/g, "\n  ")}\n  import "../app.css";\n</script>\n\n<slot />`;
      break;
    case "plain-html":
      fontSetup = ty.sourcing.googleFontsUrl ? "Link the Google Fonts CSS (or self-host the WOFF2 files and write @font-face rules)." : "No web fonts to load.";
      snippets["index.html <head>"] = [
        ...ty.sourcing.preconnect.map((u) => `<link rel="preconnect" href="${u}"${u.includes("gstatic") ? " crossorigin" : ""}>`),
        ty.sourcing.googleFontsUrl ? `<link rel="stylesheet" href="${ty.sourcing.googleFontsUrl}">` : "",
        '<link rel="stylesheet" href="css/tokens.css">',
      ]
        .filter(Boolean)
        .join("\n");
      break;
    default:
      fontSetup = installFonts ? `${installFonts} and import them once in your entry file (main.tsx / main.ts).` : "No web fonts to load.";
      snippets["src/main.tsx"] = `${importFonts}\nimport "./styles/tokens.css";`;
  }

  const steps: string[] = [];
  if (input.preserveExisting) {
    steps.push(`Keep the existing stylesheet (${existingCss ?? "current global CSS"}); add the semantic aliases below to its :root so components can use --color-* names without changing current values.`);
  } else {
    steps.push(`Create ${tokenFile} with the generated CSS (tokens.css output) and import it once, before any component styles.`);
  }
  steps.push(`Fonts: ${fontSetup}`);
  if (tw?.version === 4) {
    steps.push("Tailwind v4: paste the tailwindV4 output into your main CSS after @import \"tailwindcss\"; utilities like bg-primary, text-text-muted, font-heading, text-h1, rounded-card and shadow-md become available.");
  } else if (tw) {
    steps.push("Tailwind v3: keep tokens.css for the variables and merge the tailwindV3 theme.extend block into tailwind.config; use the darkMode selector it sets.");
  } else if (styling === "css-modules") {
    steps.push("CSS Modules: reference tokens with var(--…) inside each module; never hard-code colors or sizes.");
  } else if (input.repo?.styling.cssInJs) {
    steps.push(`${input.repo.styling.cssInJs}: inject tokens.css as a global stylesheet and reference var(--…) in styled rules; optionally expose a theme object whose values are the var() strings.`);
  } else {
    steps.push("Reference tokens with var(--color-…), var(--space-…), var(--radius-…) in every component style.");
  }
  if (input.repo?.styling.componentLibrary) {
    steps.push(`Map the tokens into ${input.repo.styling.componentLibrary}'s theme (primary, background, text, radius, font families) instead of overriding its components one by one.`);
  }
  steps.push("Build the mandatory components first using the component specs (states included), then compose pages.");
  steps.push("Dark mode (if generated): it follows prefers-color-scheme automatically; set data-theme=\"light\" or \"dark\" on <html> to force a theme from a toggle.");
  steps.push("Verify: run validate_design_system on the final tokens, check focus visibility with the keyboard, and test at 360px, 768px and 1280px widths.");

  if (input.existingMapping.length) {
    snippets["semantic aliases for existing variables"] = `:root {\n${input.existingMapping.map((m) => `  --color-${m.token}: var(${m.existing});`).join("\n")}\n}`;
  }

  const integrationNotes = [
    "Prefer integrating into the current build over replacing working infrastructure; tokens are plain CSS variables and need no runtime.",
    "If a token conflicts with an existing variable name, keep the existing one and alias it.",
  ];
  if (input.repo && !input.repo.exists) integrationNotes.push("No project directory was found; paths above assume a fresh project.");
  return { framework: fw, styling, tokenFile, steps, fontSetup, snippets, integrationNotes };
}
