import { describe, expect, it } from 'vitest';
import { fingerprint, type Classification, type NormalizedJob } from '@jobradar/core';
import { createDb } from '../src/db/index.js';
import { listJobs, listRuns } from '../src/db/repo.js';
import { runScrape } from '../src/pipeline/run.js';
import type { JobSource } from '../src/scrapers/types.js';

function job(title: string, description: string, sourceId: string): NormalizedJob {
  return {
    source: 'getonbrd',
    sourceId,
    url: `https://example.com/${sourceId}`,
    title,
    company: 'Acme',
    location: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    remote: null,
    description,
    publishedAt: null,
    fingerprint: fingerprint(title, 'Acme'),
  };
}

function source(name: string, jobs: NormalizedJob[]): JobSource {
  return { name: name as JobSource['name'], fetchListings: () => Promise.resolve(jobs) };
}

describe('runScrape', () => {
  it('descarta por reglas las ofertas sin keywords y no las manda al clasificador', async () => {
    const db = createDb(':memory:');
    const classified: string[] = [];
    await runScrape({
      db,
      sources: [
        source('getonbrd', [
          job('Desarrollador C#', 'Plataforma bancaria en .NET', 'dev-1'),
          job('Vendedor Terreno', 'Ventas en retail', 'ven-1'),
        ]),
      ],
      classify: (j) => {
        classified.push(j.title);
        return Promise.resolve({
          category: 'dotnet',
          score: 80,
          reasons: ['match'],
          redFlags: [],
        } satisfies Classification);
      },
    });
    expect(classified).toEqual(['Desarrollador C#']);
    const discarded = listJobs(db, { status: 'discarded_rules' });
    expect(discarded.map((j) => j.title)).toEqual(['Vendedor Terreno']);
  });

  it('guarda la clasificación del LLM en la oferta', async () => {
    const db = createDb(':memory:');
    await runScrape({
      db,
      sources: [source('getonbrd', [job('Desarrollador C#', '.NET', 'dev-1')])],
      classify: () =>
        Promise.resolve({
          category: 'dotnet',
          score: 92,
          reasons: ['Senior .NET calza con el perfil'],
          redFlags: [],
        }),
    });
    const [stored] = listJobs(db, { category: 'dotnet' });
    expect(stored?.score).toBe(92);
    expect(stored?.status).toBe('new');
    expect(stored?.reasons).toEqual(['Senior .NET calza con el perfil']);
  });

  it('si el clasificador falla, la oferta queda pending_classification para reintentar', async () => {
    const db = createDb(':memory:');
    await runScrape({
      db,
      sources: [source('getonbrd', [job('Desarrollador C#', '.NET', 'dev-1')])],
      classify: () => Promise.reject(new Error('API caída')),
    });
    const pending = listJobs(db, { status: 'pending_classification' });
    expect(pending).toHaveLength(1);
  });

  it('una fuente que falla no impide que las demás corran, y el error queda en runs', async () => {
    const db = createDb(':memory:');
    const failing: JobSource = {
      name: 'chiletrabajos',
      fetchListings: () => Promise.reject(new Error('HTML cambió')),
    };
    await runScrape({
      db,
      sources: [failing, source('getonbrd', [job('Desarrollador C#', '.NET', 'dev-1')])],
      classify: () => Promise.resolve({ category: 'dotnet', score: 70, reasons: [], redFlags: [] }),
    });
    expect(listJobs(db)).toHaveLength(1);
    const runs = listRuns(db);
    const failed = runs.find((r) => r.source === 'chiletrabajos');
    expect(failed?.error).toContain('HTML cambió');
    const ok = runs.find((r) => r.source === 'getonbrd');
    expect(ok?.error).toBeNull();
    expect(ok?.inserted).toBe(1);
  });

  it('es idempotente: correr dos veces no duplica ofertas ni reclasifica', async () => {
    const db = createDb(':memory:');
    let calls = 0;
    const opts = {
      db,
      sources: [source('getonbrd', [job('Desarrollador C#', '.NET', 'dev-1')])],
      classify: () => {
        calls++;
        return Promise.resolve({
          category: 'dotnet' as const,
          score: 70,
          reasons: [],
          redFlags: [],
        });
      },
    };
    await runScrape(opts);
    await runScrape(opts);
    expect(listJobs(db)).toHaveLength(1);
    expect(calls).toBe(1);
  });
});
