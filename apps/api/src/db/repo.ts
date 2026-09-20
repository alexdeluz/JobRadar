import type { Classification, JobStatus, NormalizedJob, SourceName } from '@jobradar/core';
import type { JobRadarDb } from './index.js';

export interface StoredJob extends NormalizedJob {
  id: number;
  category: string | null;
  score: number | null;
  reasons: string[];
  redFlags: string[];
  rulesMatched: string[];
  status: JobStatus;
  coverLetter: string | null;
  extraLinks: { source: string; url: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertResult {
  inserted: number;
  /** Ofertas ya existentes en el mismo portal (re-scrape). */
  samePortalDuplicates: number;
  /** Ofertas ya conocidas vía otro portal (se agregó link). */
  crossPortalDuplicates: number;
  /** Ids de las filas recién insertadas. */
  insertedIds: number[];
}

interface JobRow {
  id: number;
  source: SourceName;
  source_id: string;
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  remote: StoredJob['remote'];
  description: string;
  published_at: string | null;
  fingerprint: string;
  category: string | null;
  score: number | null;
  reasons: string | null;
  red_flags: string | null;
  rules_matched: string | null;
  status: JobStatus;
  cover_letter: string | null;
  created_at: string;
  updated_at: string;
}

function parseJsonArray(value: string | null): string[] {
  return value === null ? [] : (JSON.parse(value) as string[]);
}

function rowToJob(db: JobRadarDb, row: JobRow): StoredJob {
  const links = db
    .prepare('SELECT source, url FROM job_links WHERE job_id = ? ORDER BY id')
    .all(row.id) as { source: string; url: string }[];
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    url: row.url,
    title: row.title,
    company: row.company,
    location: row.location,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryCurrency: row.salary_currency,
    remote: row.remote,
    description: row.description,
    publishedAt: row.published_at,
    fingerprint: row.fingerprint,
    category: row.category,
    score: row.score,
    reasons: parseJsonArray(row.reasons),
    redFlags: parseJsonArray(row.red_flags),
    rulesMatched: parseJsonArray(row.rules_matched),
    status: row.status,
    coverLetter: row.cover_letter,
    extraLinks: links,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Inserta ofertas nuevas con dedup en dos niveles:
 * 1. (source, source_id): re-scrape del mismo portal → se ignora.
 * 2. fingerprint: misma oferta vista en otro portal → se guarda solo el link.
 */
export function upsertJobs(db: JobRadarDb, jobs: NormalizedJob[]): UpsertResult {
  const result: UpsertResult = {
    inserted: 0,
    samePortalDuplicates: 0,
    crossPortalDuplicates: 0,
    insertedIds: [],
  };
  const bySourceId = db.prepare('SELECT id FROM jobs WHERE source = ? AND source_id = ?');
  const byFingerprint = db.prepare('SELECT id FROM jobs WHERE fingerprint = ?');
  const insertJob = db.prepare(`
    INSERT INTO jobs (source, source_id, url, title, company, location, salary_min, salary_max,
      salary_currency, remote, description, published_at, fingerprint)
    VALUES (@source, @sourceId, @url, @title, @company, @location, @salaryMin, @salaryMax,
      @salaryCurrency, @remote, @description, @publishedAt, @fingerprint)
  `);
  const insertLink = db.prepare(
    'INSERT OR IGNORE INTO job_links (job_id, source, url) VALUES (?, ?, ?)',
  );

  const run = db.transaction(() => {
    for (const job of jobs) {
      if (bySourceId.get(job.source, job.sourceId) !== undefined) {
        result.samePortalDuplicates++;
        continue;
      }
      const existing = byFingerprint.get(job.fingerprint) as { id: number } | undefined;
      if (existing !== undefined) {
        insertLink.run(existing.id, job.source, job.url);
        result.crossPortalDuplicates++;
        continue;
      }
      const info = insertJob.run(job);
      result.inserted++;
      result.insertedIds.push(Number(info.lastInsertRowid));
    }
  });
  run();
  return result;
}

export function setStatus(db: JobRadarDb, jobId: number, status: JobStatus): void {
  db.prepare(
    "UPDATE jobs SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  ).run(status, jobId);
}

export function setRulesVerdict(db: JobRadarDb, jobId: number, matched: string[]): void {
  db.prepare('UPDATE jobs SET rules_matched = ? WHERE id = ?').run(JSON.stringify(matched), jobId);
}

export function setClassification(
  db: JobRadarDb,
  jobId: number,
  classification: Classification,
): void {
  const status: JobStatus = classification.category === 'discard' ? 'discarded_llm' : 'new';
  db.prepare(
    `UPDATE jobs SET category = ?, score = ?, reasons = ?, red_flags = ?, status = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  ).run(
    classification.category,
    classification.score,
    JSON.stringify(classification.reasons),
    JSON.stringify(classification.redFlags),
    status,
    jobId,
  );
}

export function setCoverLetter(db: JobRadarDb, jobId: number, coverLetter: string): void {
  db.prepare('UPDATE jobs SET cover_letter = ? WHERE id = ?').run(coverLetter, jobId);
}

export function getJob(db: JobRadarDb, jobId: number): StoredJob | null {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as JobRow | undefined;
  return row === undefined ? null : rowToJob(db, row);
}

export function listJobs(
  db: JobRadarDb,
  filter: { status?: JobStatus | JobStatus[] | undefined; category?: string | undefined } = {},
): StoredJob[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.status !== undefined) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    clauses.push(`status IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
  }
  if (filter.category !== undefined) {
    clauses.push('category = ?');
    params.push(filter.category);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM jobs ${where} ORDER BY score DESC NULLS LAST, id DESC`)
    .all(...params) as JobRow[];
  return rows.map((row) => rowToJob(db, row));
}

export interface RunRecord {
  source: SourceName;
  startedAt: string;
  finishedAt: string;
  fetched: number;
  inserted: number;
  error: string | null;
}

export function recordRun(db: JobRadarDb, run: RunRecord): void {
  db.prepare(
    `INSERT INTO runs (source, started_at, finished_at, fetched, inserted, error)
     VALUES (@source, @startedAt, @finishedAt, @fetched, @inserted, @error)`,
  ).run(run);
}

/** Fin del último barrido sin error de una fuente; null si nunca tuvo uno. */
export function lastSuccessfulRunAt(db: JobRadarDb, source: SourceName): string | null {
  const row = db
    .prepare(
      'SELECT finished_at FROM runs WHERE source = ? AND error IS NULL ORDER BY id DESC LIMIT 1',
    )
    .get(source) as { finished_at: string } | undefined;
  return row?.finished_at ?? null;
}

export function listRuns(db: JobRadarDb, limit = 50): (RunRecord & { id: number })[] {
  const rows = db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT ?').all(limit) as {
    id: number;
    source: SourceName;
    started_at: string;
    finished_at: string;
    fetched: number;
    inserted: number;
    error: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    fetched: r.fetched,
    inserted: r.inserted,
    error: r.error,
  }));
}
