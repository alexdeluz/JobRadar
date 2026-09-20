import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyRules } from '@jobradar/core';
import {
  createComputrabajoSource,
  parseComputrabajoAge,
  parseComputrabajoDetail,
  parseComputrabajoListing,
} from '../src/scrapers/computrabajo.js';

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

describe('parseComputrabajoAge', () => {
  it('convierte la fecha relativa del listado a días de antigüedad', () => {
    expect(parseComputrabajoAge('Hace  16  minutos')).toBe(0);
    expect(parseComputrabajoAge('Hace 1 hora')).toBe(0);
    expect(parseComputrabajoAge('Ayer')).toBe(1);
    expect(parseComputrabajoAge('Hace  2  días')).toBe(2);
    expect(parseComputrabajoAge('Más de 30 días')).toBe(31);
  });

  it('devuelve null si no reconoce el texto, para no descartar por error', () => {
    expect(parseComputrabajoAge('')).toBeNull();
    expect(parseComputrabajoAge('Postulado')).toBeNull();
  });
});

describe('createComputrabajoSource', () => {
  const passing = parseComputrabajoListing(listingHtml).filter(
    (item) => applyRules({ title: item.title, description: '' }).passed,
  );
  // La misma página, pero con todas las ofertas fuera de la ventana.
  const oldListingHtml = listingHtml.replace(/Hace\s+\d+\s+(minutos?|horas?)/g, 'Hace 9 días');

  function sourceWithSpy(
    pageFor: (url: string) => string,
    options: { searches?: string[]; windowDays?: number; maxPagesPerSearch?: number } = {},
  ) {
    const fetched: string[] = [];
    const fetchPage = (url: string): Promise<string> => {
      fetched.push(url);
      return Promise.resolve(url.includes('/ofertas-de-trabajo/') ? detailHtml : pageFor(url));
    };
    const source = createComputrabajoSource({
      searches: ['desarrollador'],
      now: new Date('2026-09-20T12:00:00Z'),
      fetchPage,
      ...options,
    });
    const listings = () => fetched.filter((url) => url.includes('/trabajo-de-'));
    return { source, listings };
  }

  it('lee el listado de cada página con su fecha', () => {
    const items = parseComputrabajoListing(listingHtml);
    expect(items[0]!.ageDays).toBe(0);
    expect(parseComputrabajoListing(oldListingHtml)[0]!.ageDays).toBe(9);
  });

  it('sigue paginando mientras haya ofertas dentro de la ventana', async () => {
    const { source, listings } = sourceWithSpy((url) =>
      url.endsWith('?p=3') ? oldListingHtml : listingHtml,
    );
    await source.fetchListings();

    expect(listings()).toEqual([
      'https://cl.computrabajo.com/trabajo-de-desarrollador',
      'https://cl.computrabajo.com/trabajo-de-desarrollador?p=2',
      'https://cl.computrabajo.com/trabajo-de-desarrollador?p=3',
    ]);
  });

  it('corta en el tope de páginas aunque siga habiendo ofertas recientes', async () => {
    const { source, listings } = sourceWithSpy(() => listingHtml, { maxPagesPerSearch: 2 });
    await source.fetchListings();
    expect(listings()).toHaveLength(2);
  });

  it('no baja el detalle de ofertas fuera de la ventana', async () => {
    const { source } = sourceWithSpy(() => oldListingHtml, { windowDays: 3 });
    expect(await source.fetchListings()).toEqual([]);
  });

  it('recorre todas las búsquedas sin repetir ofertas', async () => {
    const { source, listings } = sourceWithSpy((url) => (url.includes('?p=') ? '' : listingHtml), {
      searches: ['desarrollador', 'net'],
    });
    const jobs = await source.fetchListings();

    expect(listings()).toContain('https://cl.computrabajo.com/trabajo-de-net');
    expect(jobs.map((job) => job.sourceId)).toEqual(passing.map((item) => item.sourceId));
  });

  it('fecha la oferta según su antigüedad en el listado', async () => {
    const { source } = sourceWithSpy((url) => (url.includes('?p=') ? '' : listingHtml));
    const [job] = await source.fetchListings();

    expect(job!.source).toBe('computrabajo');
    expect(job!.publishedAt).toBe('2026-09-20');
  });

  it('tolera una búsqueda vacía, pero falla si todas vienen vacías', async () => {
    const some = sourceWithSpy((url) => (url.endsWith('/trabajo-de-net') ? listingHtml : ''), {
      searches: ['inexistente', 'net'],
    });
    expect(await some.source.fetchListings()).toHaveLength(passing.length);

    const none = sourceWithSpy(() => '', { searches: ['desarrollador', 'net'] });
    await expect(none.source.fetchListings()).rejects.toThrow(/Computrabajo/);
  });
});
