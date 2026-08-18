import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseChiletrabajosDetail,
  parseChiletrabajosListing,
} from '../src/scrapers/chiletrabajos.js';

const listingHtml = readFileSync(
  new URL('./fixtures/chiletrabajos-search.html', import.meta.url),
  'utf-8',
);
const detailHtml = readFileSync(
  new URL('./fixtures/chiletrabajos-detail.html', import.meta.url),
  'utf-8',
);

describe('parseChiletrabajosListing', () => {
  const items = parseChiletrabajosListing(listingHtml);

  it('extrae todas las cards del listado', () => {
    expect(items.length).toBeGreaterThanOrEqual(10);
  });

  it('extrae título, url, id numérico y empresa de cada card', () => {
    const first = items[0]!;
    expect(first.title).toBe('TECNICO/AUXILIAR DE FARMACIA');
    expect(first.url).toBe(
      'https://www.chiletrabajos.cl/trabajo/tecnico-auxiliar-de-farmacia-3827502',
    );
    expect(first.sourceId).toBe('3827502');
    expect(first.company).toBe('Triodo spa');
    expect(first.location).toBe('Santiago');
  });

  it('incluye el snippet de descripción del listado', () => {
    expect(items[0]!.snippet).toContain('técnico en farmacia');
  });
});

describe('parseChiletrabajosDetail', () => {
  const detail = parseChiletrabajosDetail(detailHtml);

  it('extrae la descripción completa desde el JSON-LD JobPosting, sin HTML', () => {
    expect(detail.description).toContain('Técnico en Farmacia');
    expect(detail.description).not.toContain('<');
  });

  it('extrae la fecha de publicación del JSON-LD', () => {
    expect(detail.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
