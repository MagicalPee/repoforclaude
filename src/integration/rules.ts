// Text installed as a Claude Code rule (~/.claude/rules/ or .claude/rules/) and shipped in
// integration/claude-rules.md. Kept as data so the installer and the docs never drift.

export const SERVER_NAME = "design-intelligence";

export const RULES_MARKDOWN = `# UI design decisions: use the design-intelligence MCP server

The \`${SERVER_NAME}\` MCP server chooses project-specific visual design (colors, typography,
spacing, components, motion) from research evidence. You still own UX, flows and code.

## When to call it

- Before writing or restyling user-facing UI for a website or web app (new pages, landing
  pages, components, themes, redesigns), call \`generate_design_system\` once with:
  - \`prompt\`: the user's request, verbatim plus any product context you know
  - \`project_path\`: the absolute path of the project root
  - \`framework\`, \`brand_preferences\`, \`constraints\` when the user stated them
- For follow-up UI work in the same project, reuse the existing system: call
  \`get_design_tokens\` with the project path or design system id instead of generating again.
  Pass \`redesign: true\` only when the user asks for a new look.
- Skip it for work with no visual decisions: backend, APIs, databases, migrations, CI, tests,
  docs, refactors or bug fixes that do not change how the UI looks.

## How to apply the result

- User instructions override the specification; the specification overrides your own taste.
- Put the generated tokens in the file the spec names and reference tokens (CSS variables or
  Tailwind theme keys) instead of hard-coding colors, sizes or shadows.
- Implement the mandatory components with all listed states (hover, active, focus-visible,
  disabled) and respect the "avoid" list and the originality strategy.
- If the project already has an established design system, the spec preserves it; integrate,
  do not replace working styles.
- Use \`validate_design_system\` on tokens you add or change by hand.
`;
