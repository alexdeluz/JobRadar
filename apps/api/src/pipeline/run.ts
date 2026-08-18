import { applyRules, type Classification, type NormalizedJob } from '@jobradar/core';
import type { JobRadarDb } from '../db/index.js';
import {
  getJob,
  listJobs,
  recordRun,
  setClassification,
  setRulesVerdict,
  setStatus,
  upsertJobs,
} from '../db/repo.js';
import type { JobSource } from '../scrapers/types.js';

export interface ScrapeOptions {
  db: JobRadarDb;
  sources: JobSource[];
  /** Clasificador (LLM). Si falla, la oferta queda pendiente y se reintenta en el próximo run. */
  classify: (job: NormalizedJob) => Promise<Classification>;
  log?: (message: string) => void;
}

export interface ScrapeSummary {
  perSource: { source: string; fetched: number; inserted: number; error: string | null }[];
  classified: number;
  discardedByRules: number;
}

/**
 * Pipeline completo: fetch → dedup (upsert) → reglas → clasificación LLM.
 * Cada fuente está aislada: un portal caído no detiene a los demás.
 */
export async function runScrape(options: ScrapeOptions): Promise<ScrapeSummary> {
  const { db, sources, classify, log = () => {} } = options;
  const summary: ScrapeSummary = { perSource: [], classified: 0, discardedByRules: 0 };
  const newIds: number[] = [];

  for (const source of sources) {
    const startedAt = new Date().toISOString();
    let fetched = 0;
    let inserted = 0;
    let error: string | null = null;
    try {
      log(`[${source.name}] descargando listados…`);
      const jobs = await source.fetchListings();
      fetched = jobs.length;
      const result = upsertJobs(db, jobs);
      inserted = result.inserted;
      newIds.push(...result.insertedIds);
      log(
        `[${source.name}] ${fetched} ofertas, ${inserted} nuevas, ` +
          `${result.crossPortalDuplicates} duplicadas cross-portal`,
      );
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      log(`[${source.name}] ERROR: ${error}`);
    }
    recordRun(db, {
      source: source.name,
      startedAt,
      finishedAt: new Date().toISOString(),
      fetched,
      inserted,
      error,
    });
    summary.perSource.push({ source: source.name, fetched, inserted, error });
  }

  // Reglas sobre las recién insertadas.
  for (const id of newIds) {
    const job = getJob(db, id);
    if (job === null) continue;
    const verdict = applyRules(job);
    setRulesVerdict(db, id, verdict.matched);
    if (!verdict.passed) {
      setStatus(db, id, 'discarded_rules');
      summary.discardedByRules++;
    } else {
      setStatus(db, id, 'pending_classification');
    }
  }

  // Clasifica todas las pendientes (incluye las que quedaron de runs anteriores).
  const pending = listJobs(db, { status: 'pending_classification' });
  for (const job of pending) {
    try {
      const classification = await classify(job);
      setClassification(db, job.id, classification);
      summary.classified++;
    } catch (err) {
      log(`[classify] ${job.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return summary;
}
