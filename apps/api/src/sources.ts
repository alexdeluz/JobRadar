import type { SourceName } from '@jobradar/core';
import { config } from './config.js';
import type { JobRadarDb } from './db/index.js';
import { lastSuccessfulRunAt } from './db/repo.js';
import { catchUpWindowDays } from './pipeline/schedule.js';
import { ATS_COMPANIES } from './scrapers/ats-companies.js';
import { createAtsSource } from './scrapers/ats.js';
import { createChiletrabajosSource } from './scrapers/chiletrabajos.js';
import { createComputrabajoSource } from './scrapers/computrabajo.js';
import { createGetonbrdSource } from './scrapers/getonbrd.js';
import { createLinkedinSource } from './scrapers/linkedin.js';
import { createTrabajandoSource } from './scrapers/trabajando.js';
import type { JobSource } from './scrapers/types.js';

/** Las fuentes activas, ya configuradas. La DB solo se consulta por los barridos previos. */
export function createSources(db: JobRadarDb): JobSource[] {
  // Tras días sin barrer, cada portal mira hasta cubrir lo publicado desde su último barrido sano.
  const windowFor = (source: SourceName): number =>
    config.windowDaysOverride ?? catchUpWindowDays(lastSuccessfulRunAt(db, source));
  return [
    createGetonbrdSource({ maxPages: config.getonbrd.maxPages }),
    createChiletrabajosSource({ windowDays: windowFor('chiletrabajos') }),
    createComputrabajoSource({
      searches: config.computrabajo.searches,
      maxPagesPerSearch: config.computrabajo.maxPagesPerSearch,
      windowDays: windowFor('computrabajo'),
    }),
    createTrabajandoSource({ windowDays: windowFor('trabajando') }),
    createAtsSource({ companies: ATS_COMPANIES }),
    // Al final: si la oferta ya vino por otro portal, LinkedIn queda como link extra.
    createLinkedinSource(config.linkedin),
  ];
}
