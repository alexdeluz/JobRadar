import { config } from './config.js';
import { createChiletrabajosSource } from './scrapers/chiletrabajos.js';
import { createComputrabajoSource } from './scrapers/computrabajo.js';
import { createGetonbrdSource } from './scrapers/getonbrd.js';
import type { JobSource } from './scrapers/types.js';

/** Las fuentes activas de la v1, ya configuradas. */
export function createSources(): JobSource[] {
  return [
    createGetonbrdSource({ maxPages: config.getonbrd.maxPages }),
    createChiletrabajosSource(),
    createComputrabajoSource(),
  ];
}
