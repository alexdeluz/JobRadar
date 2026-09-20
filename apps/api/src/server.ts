import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { createDb, type JobRadarDb } from './db/index.js';
import { getJob, listJobs, listRuns, setCoverLetter, setStatus } from './db/repo.js';
import { config } from './config.js';
import { generateCoverLetter } from './llm/cover-letter.js';

const StatusSchema = z.enum([
  'new',
  'reviewed',
  'applying',
  'applied',
  'pending_classification',
  'discarded_rules',
  'discarded_llm',
  'discarded_manual',
]);

const JobsQuerySchema = z.object({
  status: StatusSchema.optional(),
  category: z.enum(['dotnet', 'js_transition', 'discard']).optional(),
});

/** Construye la app Fastify sobre una base dada (inyectable en tests). */
export async function buildServer(db: JobRadarDb): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(cors, { origin: true });

  app.get('/api/jobs', (request, reply) => {
    const query = JobsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: query.error.message });
    }
    return { jobs: listJobs(db, query.data) };
  });

  app.get('/api/runs', () => ({ runs: listRuns(db) }));

  app.patch('/api/jobs/:id/status', (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const body = z.object({ status: StatusSchema }).safeParse(request.body);
    if (!body.success || Number.isNaN(id)) {
      return reply.status(400).send({ error: 'status inválido' });
    }
    if (getJob(db, id) === null) {
      return reply.status(404).send({ error: 'oferta no encontrada' });
    }
    setStatus(db, id, body.data.status);
    return { ok: true };
  });

  app.post('/api/jobs/:id/cover-letter', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const job = getJob(db, id);
    if (job === null) {
      return reply.status(404).send({ error: 'oferta no encontrada' });
    }
    if (job.coverLetter !== null) {
      return { coverLetter: job.coverLetter };
    }
    const coverLetter = await generateCoverLetter(job);
    setCoverLetter(db, id, coverLetter);
    return { coverLetter };
  });

  return app;
}

// Arranque directo (tsx src/server.ts); en tests solo se importa buildServer.
if (process.argv[1]?.endsWith('server.ts')) {
  const { runScrape } = await import('./pipeline/run.js');
  const { needsScrape } = await import('./pipeline/schedule.js');
  const { createSources } = await import('./sources.js');
  const { createClassifier } = await import('./llm/classifier.js');

  const db = createDb(config.dbPath);
  const app = await buildServer(db);
  await app.listen({ port: config.api.port });
  console.log(`API en http://localhost:${config.api.port}`);

  // Catch-up: al arrancar y cada hora, scrapea si el último barrido es viejo.
  let scraping = false;
  const maybeScrape = async () => {
    if (scraping || !needsScrape(listRuns(db, 1)[0]?.finishedAt ?? null)) return;
    scraping = true;
    try {
      await runScrape({
        db,
        sources: createSources(db),
        classify: createClassifier(),
        log: (message) => console.log(message),
      });
    } catch (err) {
      console.error('scrape falló:', err);
    } finally {
      scraping = false;
    }
  };
  void maybeScrape();
  setInterval(() => void maybeScrape(), 3_600_000);
}
