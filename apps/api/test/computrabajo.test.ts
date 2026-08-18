import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseComputrabajoDetail, parseComputrabajoListing } from '../src/scrapers/computrabajo.js';

const listingHtml = readFileSync(
  new URL('./fixtures/computrabajo-search.html', import.meta.url),
  'utf-8',
);
const detailHtml = readFileSync(
  new URL('./fixtures/computrabajo-detail.html', import.meta.url),
  'utf-8',
);

describe('parseComputrabajoListing', () => {
  const items = parseComputrabajoListing(listingHtml);

  it('extrae todas las ofertas del listado', () => {
    expect(items.length).toBeGreaterThanOrEqual(15);
  });

  it('extrae id, título, url absoluta, empresa y ubicación', () => {
    const first = items[0]!;
    expect(first.sourceId).toBe('3CAC641DFC4E147061373E686DCF3405');
    expect(first.title).toBe('Desarrollador Cobol Las Condes');
    expect(first.url).toMatch(/^https:\/\/cl\.computrabajo\.com\/ofertas-de-trabajo\//);
    expect(first.url).not.toContain('#');
    expect(first.company).toBe('XinerLink');
    expect(first.location).toContain('Santiago');
  });

  it('tolera ofertas confidenciales sin empresa', () => {
    for (const item of items) {
      expect(typeof item.title).toBe('string');
      expect(item.title.length).toBeGreaterThan(0);
    }
  });
});

describe('parseComputrabajoDetail', () => {
  it('extrae la descripción completa de la oferta', () => {
    const detail = parseComputrabajoDetail(detailHtml);
    expect(detail.description).toContain('COBOL');
    expect(detail.description).toContain('mantenimiento correctivo');
    expect(detail.description).not.toContain('<');
  });
});
