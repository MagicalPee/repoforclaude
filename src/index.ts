// Library entry point: everything the CLI and MCP server use, for programmatic access.
export { createApp, type App } from "./app.js";
export { loadConfig, VERSION } from "./config.js";
export { createServer } from "./server.js";
export { generateDesignSystem, type DesignSystemSpec, type GenerateInput } from "./design/generator.js";
export { renderSpecMarkdown } from "./design/render.js";
export { validateDesignSystem } from "./design/validator.js";
export { inferProject } from "./design/inference.js";
export { inspectRepository } from "./design/repoInspector.js";
export { analyzeWebsite } from "./analysis/websiteAnalyzer.js";
export { uiTaskContext, classifyUiTask } from "./integration/uiTask.js";
export { DIRECTIONS } from "./knowledge/directions.js";
export { contrastRatio, toHex, toOklch } from "./analysis/color.js";
