export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Append-only list. Never edit a shipped migration; add a new one instead.
 *
 * Evidence (sources, analyses, observations, references) and generated recommendations
 * (design_systems) live in separate tables so a recommendation can never be mistaken
 * for a measured fact.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    sql: `
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('website', 'design_system')),
  url TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  audience TEXT,
  positioning TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  config_json TEXT,
  selection_basis TEXT NOT NULL DEFAULT 'curator_judgement',
  origin TEXT NOT NULL DEFAULT 'seed',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_sources_category ON sources(category_id);
CREATE INDEX idx_sources_kind ON sources(kind);

CREATE TABLE analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  final_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed', 'blocked')),
  error TEXT,
  http_status INTEGER,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  bytes_fetched INTEGER NOT NULL DEFAULT 0,
  profile_json TEXT,
  classification_json TEXT,
  limitations_json TEXT NOT NULL DEFAULT '[]',
  analyzer_version TEXT NOT NULL
);
CREATE INDEX idx_analyses_source ON analyses(source_id, finished_at);
CREATE INDEX idx_analyses_url ON analyses(url, finished_at);

CREATE TABLE observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  source_id INTEGER,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  numeric_value REAL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence TEXT NOT NULL,
  source_ref TEXT,
  observed_at TEXT NOT NULL
);
CREATE INDEX idx_observations_analysis ON observations(analysis_id);
CREATE INDEX idx_observations_kind_key ON observations(kind, key);

CREATE TABLE color_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  source_id INTEGER,
  hex TEXT NOT NULL,
  role TEXT NOT NULL,
  frequency INTEGER NOT NULL,
  hue_family TEXT NOT NULL,
  lightness REAL NOT NULL,
  chroma REAL NOT NULL,
  hue REAL,
  confidence REAL NOT NULL,
  evidence TEXT NOT NULL
);
CREATE INDEX idx_color_obs_analysis ON color_observations(analysis_id);

CREATE TABLE font_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  source_id INTEGER,
  family TEXT NOT NULL,
  normalized TEXT NOT NULL,
  role TEXT NOT NULL,
  classification TEXT,
  delivery TEXT,
  frequency INTEGER NOT NULL,
  confidence REAL NOT NULL,
  evidence TEXT NOT NULL
);
CREATE INDEX idx_font_obs_analysis ON font_observations(analysis_id);
CREATE INDEX idx_font_obs_normalized ON font_observations(normalized);

CREATE TABLE component_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  source_id INTEGER,
  component TEXT NOT NULL,
  property TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence TEXT NOT NULL
);
CREATE INDEX idx_component_obs_analysis ON component_observations(analysis_id);

CREATE TABLE color_palettes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  source_id INTEGER,
  scheme TEXT NOT NULL,
  palette_json TEXT NOT NULL,
  confidence REAL NOT NULL
);

CREATE TABLE source_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  kind TEXT NOT NULL,
  http_status INTEGER,
  content_type TEXT,
  bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  fetched_at TEXT NOT NULL,
  from_cache INTEGER NOT NULL DEFAULT 0,
  note TEXT
);
CREATE INDEX idx_source_refs_analysis ON source_references(analysis_id);

CREATE TABLE http_cache (
  url TEXT PRIMARY KEY,
  status INTEGER NOT NULL,
  content_type TEXT,
  etag TEXT,
  last_modified TEXT,
  body TEXT,
  bytes INTEGER NOT NULL,
  sha256 TEXT,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE robots_cache (
  origin TEXT PRIMARY KEY,
  status INTEGER NOT NULL,
  body TEXT,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE design_patterns (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL CHECK (origin IN ('curated_heuristic', 'mined')),
  kind TEXT NOT NULL CHECK (kind IN ('convention', 'distinctive', 'guideline', 'anti_pattern')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category_id TEXT,
  component TEXT,
  dimension TEXT,
  value TEXT,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  support_count INTEGER NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  share REAL,
  lift REAL,
  confidence REAL NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  rationale TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_patterns_category ON design_patterns(category_id);

CREATE TABLE research_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'interrupted')),
  params_json TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE research_job_items (
  job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'success', 'partial', 'failed', 'skipped', 'blocked')),
  attempts INTEGER NOT NULL DEFAULT 0,
  analysis_id INTEGER,
  error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (job_id, source_id)
);

CREATE TABLE design_systems (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  project_path TEXT,
  prompt_excerpt TEXT,
  direction_id TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_design_systems_project ON design_systems(project_key, created_at);
CREATE INDEX idx_design_systems_direction ON design_systems(direction_id, created_at);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
  },
];
