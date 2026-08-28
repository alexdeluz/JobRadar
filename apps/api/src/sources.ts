import { config } from './config.js';
import { ATS_COMPANIES } from './scrapers/ats-companies.js';
import { createAtsSource } from './scrapers/ats.js';
import { createChiletrabajosSource } from './scrapers/chiletrabajos.js';
import { createComputrabajoSource } from './scrapers/computrabajo.js';
import { createGetonbrdSource } from './scrapers/getonbrd.js';
import { createTrabajandoSource } from './scrapers/trabajando.js';
import type { JobSource } from './scrapers/types.js';

/** Las fuentes activas, ya configuradas. */
export function createSources(): JobSource[] {
  return [
    createGetonbrdSource({ maxPages: config.getonbrd.maxPages }),
    createChiletrabajosSource(),
    createComputrabajoSource(),
    createTrabajandoSource(),
    createAtsSource({ companies: ATS_COMPANIES }),
  ];
}
