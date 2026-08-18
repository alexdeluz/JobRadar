import Database from 'better-sqlite3';

export type JobRadarDb = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  salary_min REAL,
  salary_max REAL,
  salary_currency TEXT,
  remote TEXT,
  description TEXT NOT NULL,
  published_at TEXT,
  fingerprint TEXT NOT NULL,
  category TEXT,
  score INTEGER,
  reasons TEXT,          -- JSON string[]
  red_flags TEXT,        -- JSON string[]
  rules_matched TEXT,    -- JSON string[]
  status TEXT NOT NULL DEFAULT 'new',
  cover_letter TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint ON jobs (fingerprint);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);

CREATE TABLE IF NOT EXISTS job_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  UNIQUE (job_id, source, url)
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  fetched INTEGER NOT NULL,
  inserted INTEGER NOT NULL,
  error TEXT
);
`;

/** Abre (o crea) la base y aplica el esquema. Usar ':memory:' en tests. */
export function createDb(path: string): JobRadarDb {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
