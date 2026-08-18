import { beforeEach, describe, expect, it } from 'vitest';
import { fingerprint, type NormalizedJob } from '@jobradar/core';
import { createDb, type JobRadarDb } from '../src/db/index.js';
import { listJobs, listRuns, recordRun, setStatus, upsertJobs } from '../src/db/repo.js';

function makeJob(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  const title = overrides.title ?? 'Desarrollador .NET Senior';
  const company = overrides.company !== undefined ? overrides.company : 'Acme';
  return {
    source: 'getonbrd',
    sourceId: 'job-1',
    url: 'https://example.com/job-1',
    title,
    company,
    location: 'Santiago',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    remote: null,
    description: 'C# y SQL Server',
    publishedAt: null,
    fingerprint: fingerprint(title, company),
    ...overrides,
  };
}

describe('repositorio de jobs', () => {
  let db: JobRadarDb;
  beforeEach(() => {
    db = createDb(':memory:');
  });

  it('inserta una oferta nueva con status "new"', () => {
    const result = upsertJobs(db, [makeJob()]);
    expect(result.inserted).toBe(1);
    const jobs = listJobs(db);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.status).toBe('new');
    expect(jobs[0]!.title).toBe('Desarrollador .NET Senior');
  });

  it('re-scrapear la misma oferta no la duplica ni resetea su estado', () => {
    upsertJobs(db, [makeJob()]);
    setStatus(db, 1, 'applied');
    const result = upsertJobs(db, [makeJob()]);
    expect(result.inserted).toBe(0);
    const jobs = listJobs(db);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.status).toBe('applied');
  });

  it('la misma oferta en otro portal se registra como link extra, no como oferta nueva', () => {
    upsertJobs(db, [makeJob()]);
    const enOtroPortal = makeJob({
      source: 'computrabajo',
      sourceId: 'ct-99',
      url: 'https://cl.computrabajo.com/oferta-99',
    });
    const result = upsertJobs(db, [enOtroPortal]);
    expect(result.inserted).toBe(0);
    expect(result.crossPortalDuplicates).toBe(1);
    const jobs = listJobs(db);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.extraLinks).toEqual([
      { source: 'computrabajo', url: 'https://cl.computrabajo.com/oferta-99' },
    ]);
  });

  it('ofertas distintas con distinto fingerprint se insertan ambas', () => {
    upsertJobs(db, [
      makeJob(),
      makeJob({ sourceId: 'job-2', title: 'QA Automation', url: 'https://example.com/job-2' }),
    ]);
    expect(listJobs(db)).toHaveLength(2);
  });

  it('registra runs con conteos y errores por fuente', () => {
    recordRun(db, {
      source: 'getonbrd',
      startedAt: '2026-08-18T12:00:00.000Z',
      finishedAt: '2026-08-18T12:01:00.000Z',
      fetched: 40,
      inserted: 5,
      error: null,
    });
    const runs = listRuns(db);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.source).toBe('getonbrd');
    expect(runs[0]!.inserted).toBe(5);
    expect(runs[0]!.error).toBeNull();
  });
});
