import { toHex } from "../analysis/color.js";
import { FONT_CATALOG } from "../knowledge/fonts.js";
import { CATEGORY_IDS, type CategoryId } from "../types.js";

export const TRAITS = ["energy", "playfulness", "sophistication", "warmth", "techness", "density", "boldness"] as const;
export type Trait = (typeof TRAITS)[number];
export type Traits = Record<Trait, number>;

export type WebsiteType =
  | "landing-page"
  | "marketing-site"
  | "web-app"
  | "dashboard"
  | "ecommerce-store"
  | "portfolio"
  | "blog-editorial"
  | "documentation"
  | "community";

export interface ExplicitPreferences {
  colors: Array<{ hex: string; source: string }>;
  avoidColors: string[];
  mode?: "light" | "dark" | "both";
  fonts: string[];
  styleKeywords: string[];
  avoidStyles: string[];
  constraints: {
    wcag: "AA" | "AAA";
    noGradients: boolean;
    noAnimation: boolean;
    systemFontsOnly: boolean;
    corners?: "sharp" | "rounded" | "pill";
  };
  framework?: string;
  styling?: string;
}

export interface ProjectProfile {
  summary: string;
  category: CategoryId;
  secondaryCategory?: CategoryId;
  categoryScores: Array<{ category: CategoryId; score: number }>;
  websiteType: WebsiteType;
  audience: string[];
  traits: Traits;
  explicit: ExplicitPreferences;
  signals: string[];
  confidence: number;
}

// ---------- lexicons ----------

const CATEGORY_TERMS: Record<Exclude<CategoryId, "reference-frameworks">, Record<string, number>> = {
  "saas-b2b": { saas: 3, b2b: 3, crm: 3, "sales team": 2, enterprise: 2, workflow: 1.5, "customer success": 2, onboarding: 1, "subscription software": 2, platform: 0.8, teams: 1, startup: 0.8, "admin panel": 1.5, hr: 1.5, payroll: 2, invoicing: 1.5, analytics: 1.2 },
  "ai-products": { ai: 2.5, "artificial intelligence": 3, llm: 3, gpt: 2.5, chatbot: 3, agent: 1.5, agents: 1.5, "machine learning": 3, ml: 2, model: 1, prompt: 1.5, copilot: 2.5, "generative": 2.5, inference: 1.5, "voice cloning": 2.5, "image generation": 2.5, rag: 2.5 },
  ecommerce: { shop: 3, store: 2.5, ecommerce: 3, "e-commerce": 3, cart: 2.5, checkout: 2.5, product: 1, products: 1.5, sell: 1.5, catalog: 2, merch: 2.5, apparel: 2.5, clothing: 2.5, sneakers: 2.5, jewelry: 2, jewellery: 2, cosmetics: 2, skincare: 2, dtc: 2.5, retail: 2.5, marketplace: 1.5 },
  "developer-tools": { developer: 3, developers: 3, api: 2.5, sdk: 3, cli: 3, devops: 3, "open source": 2, "open-source": 2, database: 2, hosting: 2, deploy: 2, deployment: 2, infrastructure: 2.5, kubernetes: 3, observability: 3, logging: 2, monitoring: 2, "code editor": 3, ide: 2.5, github: 1.5, docs: 1, documentation: 1.5, terminal: 2.5, framework: 1, library: 1 },
  fintech: { fintech: 3, bank: 3, banking: 3, payments: 3, payment: 2.5, finance: 2.5, financial: 2.5, invest: 2.5, investing: 3, investment: 2.5, trading: 3, crypto: 3, wallet: 2, budget: 2.5, budgeting: 2.5, loan: 2.5, loans: 2.5, insurance: 2.5, accounting: 2.5, tax: 2, expense: 2, money: 2, stock: 2, portfolio_tracker: 2 },
  portfolio: { portfolio: 3, "my work": 2.5, "personal site": 3, "personal website": 3, resume: 2.5, cv: 2, freelancer: 2, photographer: 2.5, illustrator: 2.5, "designer portfolio": 3, "about me": 2, showcase: 1.5 },
  agency: { agency: 3, studio: 2.5, "creative studio": 3, "design studio": 3, consultancy: 2, "branding agency": 3, "marketing agency": 3, "web agency": 3, "our services": 1.5, clients: 1.2, "case studies": 2 },
  gaming: { game: 3, games: 3, gaming: 3, esports: 3, "e-sports": 3, gamer: 3, gamers: 3, steam: 2, console: 2, rpg: 3, mmo: 3, shooter: 2.5, "indie game": 3, guild: 2.5, tournament: 2, twitch: 2, discord: 1.2, "game studio": 3, arcade: 2.5, "pixel art": 2 },
  "media-editorial": { blog: 2.5, magazine: 3, news: 3, newsletter: 2, journalism: 3, articles: 2.5, article: 2, editorial: 3, publication: 3, publishing: 2.5, podcast: 2, essays: 2.5, writer: 2, stories: 1.5, longform: 3, "long-form": 3 },
  education: { course: 2.5, courses: 3, learning: 2.5, learn: 1.5, education: 3, school: 2.5, students: 2.5, student: 2.5, teachers: 2.5, tutoring: 3, lessons: 2.5, university: 3, academy: 2.5, quiz: 2, kids: 1.5, curriculum: 3, bootcamp: 2.5, "e-learning": 3, elearning: 3, classroom: 2.5 },
  "landing-conversion": { "landing page": 3, waitlist: 3, launch: 1.5, "coming soon": 3, "sign up": 1.2, signup: 1.2, conversion: 2.5, "lead generation": 3, "product launch": 2.5, "pre-order": 2, preorder: 2, "one-page": 2, "single page": 2 },
  productivity: { productivity: 3, "to-do": 3, todo: 3, tasks: 2.5, "task manager": 3, notes: 2.5, "note-taking": 3, calendar: 2.5, planner: 2.5, kanban: 3, "project management": 3, habit: 2, "time tracking": 3, collaboration: 1.5, workspace: 1.5, docs: 0.8, email: 1, focus: 1 },
  "community-social": { community: 3, social: 2.5, forum: 3, "social network": 3, members: 1.5, profiles: 1.5, feed: 2, followers: 2.5, chat: 1.5, messaging: 1.5, dating: 3, meetup: 2.5, club: 2, fans: 1.5, creators: 1.5, "user-generated": 2 },
  "luxury-premium": { luxury: 3, premium: 2, "high-end": 3, couture: 3, boutique: 2, jewelry: 1.5, jewellery: 1.5, watches: 2.5, "fine dining": 1.5, villa: 2, yacht: 3, fragrance: 2.5, perfume: 2.5, bespoke: 2.5, exclusive: 1.5, atelier: 3, haute: 3, designer: 0.5 },
  "health-wellness": { health: 2.5, healthcare: 3, clinic: 3, doctor: 2.5, doctors: 2.5, patient: 3, patients: 3, medical: 3, therapy: 3, therapist: 3, "mental health": 3, wellness: 3, meditation: 3, fitness: 3, gym: 2.5, workout: 2.5, yoga: 3, nutrition: 2.5, sleep: 2, dental: 3, pharmacy: 3, telehealth: 3 },
  "food-hospitality": { restaurant: 3, cafe: 3, "café": 3, coffee: 2.5, bakery: 3, burger: 3, burgers: 3, pizza: 3, menu: 2, food: 2.5, recipes: 2.5, recipe: 2.5, bar: 1.5, brewery: 3, wine: 2, hotel: 3, hostel: 3, travel: 2.5, booking: 1.5, tours: 2, catering: 3, "food truck": 3, delivery: 1, chef: 2.5, dining: 2.5, kitchen: 1.5 },
  "public-sector": { government: 3, council: 2.5, municipality: 3, "public service": 3, nonprofit: 3, "non-profit": 3, charity: 3, ngo: 3, donate: 2.5, donation: 2.5, volunteer: 2.5, civic: 3, citizens: 2.5, museum: 2.5, library: 1.5, campaign: 1, foundation: 1.5 },
};

const WEBSITE_TYPE_TERMS: Record<WebsiteType, Record<string, number>> = {
  "landing-page": { "landing page": 3, landing: 2, waitlist: 2.5, "coming soon": 3, "one-page": 2, "single page": 2, "launch page": 3, "sales page": 3, hero: 0.5 },
  "marketing-site": { website: 1, "marketing site": 3, homepage: 1.5, "home page": 1.5, "company site": 2.5, "about page": 1, pricing: 1, "multi-page": 2 },
  "web-app": { app: 1.5, "web app": 3, application: 1.5, saas: 1, "sign in": 1, login: 1.2, "user accounts": 1.5, settings: 1, crud: 2.5, editor: 1.5, workspace: 1.2 },
  dashboard: { dashboard: 3, "admin panel": 3, admin: 2, analytics: 2, metrics: 2, reports: 1.5, charts: 2, "data table": 2.5, "internal tool": 3, backoffice: 3, "back office": 3 },
  "ecommerce-store": { shop: 2.5, store: 2, cart: 3, checkout: 3, "product page": 3, "product pages": 3, catalog: 2.5, ecommerce: 3, "e-commerce": 3, shopify: 2.5 },
  portfolio: { portfolio: 3, "personal site": 3, "personal website": 3, "case studies": 1.5, resume: 2, showcase: 1.5 },
  "blog-editorial": { blog: 3, magazine: 3, articles: 2.5, newsletter: 1.5, news: 2.5, publication: 2.5, posts: 1.5 },
  documentation: { documentation: 3, docs: 2.5, "api reference": 3, guides: 1.5, "knowledge base": 3, "help center": 3, wiki: 2 },
  community: { forum: 3, community: 2, "social network": 3, feed: 2, profiles: 1.5, comments: 1.5, threads: 2 },
};

const AUDIENCE_TERMS: Record<string, string[]> = {
  developers: ["developer", "developers", "engineers", "programmers", "devops"],
  "enterprise buyers": ["enterprise", "b2b", "procurement", "it teams", "cio", "companies"],
  "small businesses": ["small business", "smb", "freelancers", "solopreneurs", "local business"],
  consumers: ["consumers", "customers", "shoppers", "users", "everyone", "people"],
  "kids and families": ["kids", "children", "families", "parents", "toddlers"],
  teenagers: ["teens", "teenagers", "gen z", "young people", "students"],
  "older adults": ["seniors", "older adults", "elderly", "retirees"],
  gamers: ["gamers", "players", "esports fans"],
  creatives: ["designers", "artists", "creatives", "photographers", "musicians", "filmmakers"],
  professionals: ["professionals", "lawyers", "law firms", "legal teams", "doctors", "accountants", "executives", "consultants"],
  "affluent buyers": ["luxury", "high-net-worth", "affluent", "premium customers", "collectors"],
  patients: ["patients", "caregivers"],
  learners: ["learners", "students", "teachers"],
};

// Each matched term nudges personality traits (−1..1).
const TRAIT_TERMS: Record<string, Partial<Traits>> = {
  playful: { playfulness: 0.8, energy: 0.3 },
  fun: { playfulness: 0.7, energy: 0.3 },
  whimsical: { playfulness: 0.8, warmth: 0.3 },
  quirky: { playfulness: 0.6, boldness: 0.3 },
  kids: { playfulness: 0.7, warmth: 0.4, energy: 0.3 },
  children: { playfulness: 0.6, warmth: 0.4 },
  friendly: { warmth: 0.6, playfulness: 0.2 },
  approachable: { warmth: 0.5, sophistication: -0.2 },
  warm: { warmth: 0.7 },
  cozy: { warmth: 0.8, energy: -0.3 },
  human: { warmth: 0.5 },
  premium: { sophistication: 0.7 },
  luxury: { sophistication: 0.9, energy: -0.3 },
  luxurious: { sophistication: 0.9, energy: -0.3 },
  elegant: { sophistication: 0.8, boldness: -0.2 },
  refined: { sophistication: 0.7 },
  sophisticated: { sophistication: 0.8 },
  minimal: { boldness: -0.3, density: -0.3, energy: -0.2 },
  minimalist: { boldness: -0.3, density: -0.3, energy: -0.2 },
  clean: { density: -0.1 },
  calm: { energy: -0.7, warmth: 0.2 },
  serene: { energy: -0.7 },
  trustworthy: { sophistication: 0.3, playfulness: -0.3 },
  professional: { playfulness: -0.5, sophistication: 0.3 },
  serious: { playfulness: -0.7 },
  corporate: { playfulness: -0.5, sophistication: 0.2 },
  bold: { boldness: 0.8, energy: 0.3 },
  loud: { boldness: 0.9, energy: 0.6 },
  striking: { boldness: 0.7 },
  energetic: { energy: 0.8, boldness: 0.3 },
  vibrant: { energy: 0.6, boldness: 0.4, playfulness: 0.2 },
  dynamic: { energy: 0.6 },
  edgy: { boldness: 0.7, playfulness: 0.2, warmth: -0.2 },
  futuristic: { techness: 0.7, energy: 0.3 },
  technical: { techness: 0.8, density: 0.3 },
  dense: { density: 0.8 },
  "data-heavy": { density: 0.8, techness: 0.4 },
  spacious: { density: -0.6 },
  airy: { density: -0.6, energy: -0.2 },
  retro: { playfulness: 0.4, warmth: 0.4 },
  vintage: { warmth: 0.5, sophistication: 0.2 },
  organic: { warmth: 0.6, techness: -0.4 },
  natural: { warmth: 0.5, techness: -0.3 },
  handmade: { warmth: 0.7, techness: -0.5 },
  artisanal: { warmth: 0.6, sophistication: 0.3 },
  editorial: { sophistication: 0.4, density: 0.1 },
  brutalist: { boldness: 0.8, playfulness: 0.2, sophistication: -0.2 },
  dark: { energy: 0.1 },
  neon: { energy: 0.8, boldness: 0.6, techness: 0.3 },
  cinematic: { boldness: 0.6, energy: 0.4 },
  accessible: { sophistication: -0.1 },
  inclusive: { warmth: 0.3 },
};

const CATEGORY_PRIORS: Partial<Record<CategoryId, Partial<Traits>>> = {
  "saas-b2b": { techness: 0.3, playfulness: -0.2, sophistication: 0.2 },
  "ai-products": { techness: 0.5, sophistication: 0.2 },
  ecommerce: { energy: 0.1, warmth: 0.2 },
  "developer-tools": { techness: 0.8, density: 0.5, playfulness: -0.2 },
  fintech: { sophistication: 0.4, playfulness: -0.4, techness: 0.2 },
  portfolio: { boldness: 0.3, sophistication: 0.3 },
  agency: { boldness: 0.5, sophistication: 0.4 },
  gaming: { energy: 0.7, boldness: 0.6, playfulness: 0.3, techness: 0.3 },
  "media-editorial": { sophistication: 0.5, density: 0.3 },
  education: { warmth: 0.4, playfulness: 0.3 },
  "landing-conversion": { boldness: 0.3, energy: 0.2 },
  productivity: { energy: -0.3, density: 0.3, techness: 0.3 },
  "community-social": { warmth: 0.4, playfulness: 0.3 },
  "luxury-premium": { sophistication: 0.9, energy: -0.5, boldness: -0.2 },
  "health-wellness": { energy: -0.4, warmth: 0.5 },
  "food-hospitality": { warmth: 0.7, energy: 0.3, playfulness: 0.2 },
  "public-sector": { playfulness: -0.4, sophistication: -0.1, warmth: 0.2 },
};

const STYLE_KEYWORDS = [
  "minimal",
  "minimalist",
  "brutalist",
  "neo-brutalist",
  "editorial",
  "playful",
  "elegant",
  "luxury",
  "retro",
  "vintage",
  "y2k",
  "neon",
  "cyberpunk",
  "futuristic",
  "glassmorphism",
  "glass",
  "gradient",
  "gradients",
  "bold",
  "swiss",
  "corporate",
  "organic",
  "handmade",
  "hand-drawn",
  "geometric",
  "monochrome",
  "pastel",
  "dark",
  "cinematic",
  "technical",
  "serif",
  "sans-serif",
  "monospace",
  "rounded",
  "sharp",
  "flat",
  "skeuomorphic",
  "3d",
  "illustrated",
  "photographic",
  "grid",
  "magazine",
  "warm",
  "earthy",
  "colorful",
  "colourful",
  "vibrant",
  "calm",
  "industrial",
];

// Representative colors for words people use in briefs. Approximate on purpose.
const COLOR_WORDS: Record<string, string> = {
  navy: "#1b2a4a",
  "navy blue": "#1b2a4a",
  "midnight blue": "#191970",
  cobalt: "#1f4fd1",
  "royal blue": "#2f55d4",
  "sky blue": "#5aa9e6",
  blue: "#2563eb",
  teal: "#0f766e",
  turquoise: "#1aa5a5",
  cyan: "#0891b2",
  aqua: "#22b8c8",
  mint: "#5fc9a0",
  sage: "#8a9a7b",
  olive: "#6b7238",
  "forest green": "#1f5135",
  emerald: "#047857",
  green: "#16a34a",
  "neon green": "#39ff14",
  lime: "#84cc16",
  chartreuse: "#a3c614",
  yellow: "#facc15",
  mustard: "#d4a017",
  gold: "#c9a227",
  ochre: "#c8851a",
  amber: "#f59e0b",
  orange: "#f97316",
  "burnt orange": "#c2541c",
  rust: "#b4471f",
  terracotta: "#c4623f",
  coral: "#f26b5b",
  peach: "#f7b39b",
  salmon: "#f08a75",
  red: "#dc2626",
  "tomato red": "#e34234",
  crimson: "#b3122e",
  burgundy: "#7a1f3d",
  maroon: "#6d1a2a",
  oxblood: "#5c1a1b",
  wine: "#6e1f35",
  pink: "#ec4899",
  "hot pink": "#ff3e9a",
  magenta: "#c026d3",
  fuchsia: "#d946ef",
  lavender: "#a99bd8",
  lilac: "#b7a3d6",
  purple: "#7e22ce",
  violet: "#7c3aed",
  plum: "#6b3a5e",
  aubergine: "#3b1f3a",
  indigo: "#4338ca",
  brown: "#7a4a2a",
  chocolate: "#4a2c1d",
  tan: "#c8a27a",
  beige: "#e8dcc4",
  cream: "#f7f1e3",
  ivory: "#fbf8ef",
  sand: "#dccaa5",
  charcoal: "#2b2d31",
  graphite: "#33363b",
  slate: "#475569",
  black: "#0b0b0c",
  white: "#ffffff",
};

const COLOR_CONTEXT = /colou?rs?|palette|accent|brand|theme|tones?|hues?|shades?|background|primary|scheme|vibe|feel|look/;

const NEGATORS = /\b(no|not|avoid|avoiding|without|never|don'?t|dont|nothing|less|minus|skip|hate)\b/;

export function projectKeyFor(prompt: string, projectPath?: string): string {
  return projectPath ? `path:${projectPath}` : `prompt:${hash(prompt.trim().toLowerCase()).toString(36)}`;
}

export function hash(input: string): number {
  // FNV-1a 32-bit: deterministic seeds for tie-breaking and variety.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function countTerm(text: string, term: string): number {
  const re = new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/_/g, " ")}(?=$|[^a-z0-9])`, "g");
  return (text.match(re) ?? []).length;
}

function isNegated(text: string, index: number): boolean {
  const window = text.slice(Math.max(0, index - 32), index);
  // Negation scope ends at clause boundaries and at words that start a positive instruction.
  const clause = window.split(/[.;:!?\n,]|\b(?:but|use|using|instead|prefer|want)\b/).pop() ?? "";
  return NEGATORS.test(clause);
}

function clamp(n: number): number {
  return Math.max(-1, Math.min(1, Math.round(n * 100) / 100));
}

export interface InferenceInput {
  prompt: string;
  brandPreferences?: string;
  constraints?: string;
  framework?: string;
}

export function inferProject(input: InferenceInput): ProjectProfile {
  const raw = [input.prompt, input.brandPreferences ?? "", input.constraints ?? ""].join("\n");
  const text = raw.toLowerCase();
  const signals: string[] = [];

  // ----- category -----
  const scores = new Map<CategoryId, number>();
  for (const [cat, terms] of Object.entries(CATEGORY_TERMS) as Array<[CategoryId, Record<string, number>]>) {
    let s = 0;
    for (const [term, weight] of Object.entries(terms)) {
      const n = countTerm(text, term);
      if (n > 0) {
        s += weight * Math.min(n, 3);
        signals.push(`${cat}:${term.replace(/_/g, " ")}`);
      }
    }
    scores.set(cat, s);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  // "Landing page" describes the page type; when the brief also names a product domain,
  // the domain is the category and landing-conversion becomes secondary.
  if (ranked[0]![0] === "landing-conversion") {
    const domain = ranked.findIndex(([c, s]) => c !== "landing-conversion" && s >= 1.5);
    if (domain > 0) ranked.unshift(...ranked.splice(domain, 1));
  }
  const top = ranked[0]!;
  const second = ranked[1]!;
  const category: CategoryId = top[1] > 0 ? top[0] : "landing-conversion";
  const total = ranked.reduce((s, [, v]) => s + v, 0);
  const categoryConfidence = top[1] > 0 ? Math.min(1, (top[1] - second[1] * 0.5) / Math.max(4, total * 0.6)) : 0.15;

  // ----- website type -----
  const typeScores = Object.entries(WEBSITE_TYPE_TERMS).map(([t, terms]) => {
    let s = 0;
    for (const [term, w] of Object.entries(terms)) s += countTerm(text, term) > 0 ? w : 0;
    return [t as WebsiteType, s] as const;
  });
  typeScores.sort((a, b) => b[1] - a[1]);
  let websiteType: WebsiteType = typeScores[0]![1] > 0 ? typeScores[0]![0] : "marketing-site";
  if (typeScores[0]![1] === 0) {
    const byCategory: Partial<Record<CategoryId, WebsiteType>> = {
      ecommerce: "ecommerce-store",
      portfolio: "portfolio",
      "media-editorial": "blog-editorial",
      "landing-conversion": "landing-page",
      productivity: "web-app",
      "community-social": "community",
    };
    websiteType = byCategory[category] ?? "marketing-site";
  }

  // ----- audience -----
  const audience = Object.entries(AUDIENCE_TERMS)
    .filter(([, terms]) => terms.some((t) => countTerm(text, t) > 0))
    .map(([a]) => a);

  // ----- traits -----
  const traits: Traits = { energy: 0, playfulness: 0, sophistication: 0, warmth: 0, techness: 0, density: 0, boldness: 0 };
  const prior = CATEGORY_PRIORS[category] ?? {};
  for (const t of TRAITS) traits[t] += (prior[t] ?? 0) * 0.6;
  for (const [term, delta] of Object.entries(TRAIT_TERMS)) {
    const re = new RegExp(`(^|[^a-z])${term}(?=$|[^a-z])`, "g");
    for (const m of text.matchAll(re)) {
      const negated = isNegated(text, m.index ?? 0);
      for (const [k, v] of Object.entries(delta) as Array<[Trait, number]>) traits[k] += negated ? -v * 0.6 : v;
      signals.push(`${negated ? "not " : ""}${term}`);
    }
  }
  if (websiteType === "dashboard" || websiteType === "web-app") traits.density += 0.3;
  if (audience.includes("kids and families")) traits.playfulness += 0.3;
  for (const t of TRAITS) traits[t] = clamp(traits[t]);

  // ----- explicit preferences -----
  const explicit: ExplicitPreferences = {
    colors: [],
    avoidColors: [],
    fonts: [],
    styleKeywords: [],
    avoidStyles: [],
    constraints: { wcag: /\bwcag\s*2?\.?\d?\s*aaa\b|\baaa\b/.test(text) ? "AAA" : "AA", noGradients: false, noAnimation: false, systemFontsOnly: false },
  };
  for (const m of raw.matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    const hex = toHex(m[0]);
    if (hex) explicit.colors.push({ hex, source: `hex ${m[0]} in brief` });
  }
  const colorTerms = Object.keys(COLOR_WORDS).sort((a, b) => b.length - a.length);
  const used = new Set<number>();
  for (const word of colorTerms) {
    const re = new RegExp(`(^|[^a-z])(${word})(?=$|[^a-z])`, "g");
    for (const m of text.matchAll(re)) {
      const idx = (m.index ?? 0) + m[1]!.length;
      if (used.has(idx)) continue;
      const around = text.slice(Math.max(0, idx - 40), idx + word.length + 40);
      const listed = new RegExp(`(${colorTerms.join("|")})\\s*(,|and|&|\\+|/)\\s*${word}|${word}\\s*(,|and|&|\\+|/)\\s*(${colorTerms.join("|")})`).test(around);
      const negated = isNegated(text, idx);
      // "no purple" is unambiguous; positive mentions need color context ("navy palette", "navy and gold").
      if (!negated && !COLOR_CONTEXT.test(around) && !listed) continue;
      if (negated && (word === "black" || word === "white")) continue;
      for (let k = idx; k < idx + word.length; k++) used.add(k);
      if (negated) {
        explicit.avoidColors.push(word);
        signals.push(`avoid color ${word}`);
      } else {
        explicit.colors.push({ hex: COLOR_WORDS[word]!, source: `"${word}" in brief` });
        signals.push(`color ${word}`);
      }
    }
  }
  // Keep the order the brief mentions colors in: the first one named becomes the primary.
  const position = (c: { source: string }) => {
    const word = /"(.+)"/.exec(c.source)?.[1] ?? /hex (#\w+)/.exec(c.source)?.[1] ?? "";
    const idx = word.startsWith("#") ? raw.indexOf(word) : text.indexOf(word);
    return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
  };
  explicit.colors = explicit.colors
    .filter((c, i, arr) => arr.findIndex((x) => x.hex === c.hex) === i)
    .sort((a, b) => position(a) - position(b))
    .slice(0, 4);

  if (/\b(light and dark|dark and light|both (light and dark|themes|modes)|theme (toggle|switch)|dark[- ]mode toggle|support dark mode)\b/.test(text)) {
    explicit.mode = "both";
  } else if (/\b(dark[- ](mode|theme|ui|interface|background|website|site|design)|dark[- ]first|night mode)\b/.test(text)) {
    const idx = text.search(/\bdark[- ](mode|theme|ui|interface|background|website|site|design)|dark[- ]first|night mode/);
    if (isNegated(text, idx)) explicit.mode = "light";
    else explicit.mode = "dark";
  } else if (/\b(light[- ](mode|theme)|white background|bright and airy)\b/.test(text)) {
    explicit.mode = "light";
  }

  for (const font of FONT_CATALOG) {
    if (font.family.length < 4) continue;
    const re = new RegExp(`(^|[^A-Za-z])${font.family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^A-Za-z])`);
    if (re.test(raw) && !explicit.fonts.includes(font.family)) explicit.fonts.push(font.family);
  }
  for (const m of raw.matchAll(/(?:font|typeface|typography)[^."'\n]{0,30}["“']([A-Z][\w ]{2,40})["”']/g)) {
    if (!explicit.fonts.includes(m[1]!.trim())) explicit.fonts.push(m[1]!.trim());
  }

  for (const kw of STYLE_KEYWORDS) {
    const re = new RegExp(`(^|[^a-z])${kw.replace(/-/g, "[- ]?")}(?=$|[^a-z])`, "g");
    for (const m of text.matchAll(re)) {
      if (isNegated(text, m.index ?? 0)) explicit.avoidStyles.push(kw);
      else explicit.styleKeywords.push(kw);
    }
  }
  explicit.styleKeywords = [...new Set(explicit.styleKeywords)];
  explicit.avoidStyles = [...new Set(explicit.avoidStyles)];
  explicit.constraints.noGradients = explicit.avoidStyles.some((s) => s.startsWith("gradient"));
  explicit.constraints.noAnimation =
    /\b(no|without|avoid|minimal|reduce[d]?)\s+(animations?|motion)\b/.test(text) || /\bstatic\b.*\b(site|page)\b/.test(text);
  explicit.constraints.systemFontsOnly = /\bsystem fonts?( only)?\b|\bno (web ?fonts|custom fonts|google fonts)\b/.test(text);
  if (/\b(sharp|square)\s+(corners|edges)\b|\bno (rounded|round) corners\b/.test(text)) explicit.constraints.corners = "sharp";
  else if (/\bpill[- ]shaped\b|\bpill buttons\b/.test(text)) explicit.constraints.corners = "pill";
  else if (/\b(rounded|soft) (corners|edges|shapes)\b/.test(text)) explicit.constraints.corners = "rounded";

  const frameworks: Array<[RegExp, string]> = [
    [/\bnext\.?js\b|\bnextjs\b/, "nextjs"],
    [/\bnuxt\b/, "nuxt"],
    [/\bsveltekit\b|\bsvelte kit\b/, "sveltekit"],
    [/\bsvelte\b/, "svelte"],
    [/\bastro\b/, "astro"],
    [/\bremix\b/, "remix"],
    [/\bvue\b/, "vue"],
    [/\bangular\b/, "angular"],
    [/\bsolid(js|\.js)?\b/, "solid"],
    [/\breact\b/, "react"],
    [/\b(plain|vanilla|static) (html|css)\b|\bhtml and css\b/, "plain-html"],
  ];
  const fw = input.framework?.toLowerCase() ?? text;
  explicit.framework = frameworks.find(([re]) => re.test(fw))?.[1];
  if (/\btailwind/.test(text)) explicit.styling = "tailwind";
  else if (/\bcss modules\b/.test(text)) explicit.styling = "css-modules";
  else if (/\bstyled-components\b/.test(text)) explicit.styling = "styled-components";
  else if (/\bsass\b|\bscss\b/.test(text)) explicit.styling = "sass";

  const secondary = second[1] > 0 && second[1] >= top[1] * 0.5 ? second[0] : undefined;
  return {
    summary: input.prompt.trim().replace(/\s+/g, " ").slice(0, 280),
    category,
    secondaryCategory: secondary,
    categoryScores: ranked.filter(([, s]) => s > 0).slice(0, 4).map(([c, s]) => ({ category: c, score: Math.round(s * 10) / 10 })),
    websiteType,
    audience,
    traits,
    explicit,
    signals: [...new Set(signals)].slice(0, 30),
    confidence: Math.round(Math.max(0.15, categoryConfidence) * 100) / 100,
  };
}

export function isKnownCategory(value: string): value is CategoryId {
  return (CATEGORY_IDS as string[]).includes(value);
}
