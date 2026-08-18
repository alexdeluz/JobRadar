import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { fingerprint, type NormalizedJob } from '@jobradar/core';
import { createDb, type JobRadarDb } from '../src/db/index.js';
import { setClassification, upsertJobs } from '../src/db/repo.js';
import { buildServer } from '../src/server.js';

function seed(db: JobRadarDb, title: string, sourceId: string): number {
  const job: NormalizedJob = {
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
    description: 'C# .NET',
    publishedAt: null,
    fingerprint: fingerprint(title, 'Acme'),
  };
  return upsertJobs(db, [job]).insertedIds[0]!;
}

describe('API REST', () => {
  let db: JobRadarDb;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = createDb(':memory:');
    app = await buildServer(db);
  });

  it('GET /api/jobs lista las ofertas con sus campos', async () => {
    seed(db, 'Desarrollador .NET', 'a');
    const res = await app.inject({ method: 'GET', url: '/api/jobs' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { jobs: { title: string; status: string }[] };
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]!.title).toBe('Desarrollador .NET');
  });

  it('GET /api/jobs?category=dotnet filtra por categoría', async () => {
    const id = seed(db, 'Desarrollador .NET', 'a');
    seed(db, 'Otro rol', 'b');
    setClassification(db, id, { category: 'dotnet', score: 90, reasons: [], redFlags: [] });
    const res = await app.inject({ method: 'GET', url: '/api/jobs?category=dotnet' });
    const body = res.json() as { jobs: { id: number }[] };
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]!.id).toBe(id);
  });

  it('PATCH /api/jobs/:id/status cambia el estado', async () => {
    const id = seed(db, 'Desarrollador .NET', 'a');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/jobs/${id}/status`,
      payload: { status: 'applied' },
    });
    expect(res.statusCode).toBe(200);
    const jobs = (await app.inject({ method: 'GET', url: '/api/jobs?status=applied' })).json() as {
      jobs: unknown[];
    };
    expect(jobs.jobs).toHaveLength(1);
  });

  it('PATCH /api/jobs/:id/status rechaza estados inválidos', async () => {
    const id = seed(db, 'Desarrollador .NET', 'a');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/jobs/${id}/status`,
      payload: { status: 'no-existe' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/runs devuelve el historial de barridos', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/runs' });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { runs: unknown[] }).runs).toEqual([]);
  });
});
