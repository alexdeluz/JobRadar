import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createChiletrabajosSource,
  parseChiletrabajosDate,
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

  it('extrae la fecha de publicación de la card', () => {
    expect(items[0]!.publishedAt).toBe('2026-08-18');
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

describe('parseChiletrabajosDate', () => {
  it('convierte la fecha en español a ISO', () => {
    expect(parseChiletrabajosDate(' 18 de Agosto de 2026')).toBe('2026-08-18');
    expect(parseChiletrabajosDate('3 de septiembre de 2026')).toBe('2026-09-03');
  });

  it('devuelve null si no reconoce el texto', () => {
    expect(parseChiletrabajosDate('ayer')).toBeNull();
  });
});

describe('createChiletrabajosSource', () => {
  const BASE = 'https://www.chiletrabajos.cl/trabajos/informatica';
  // La misma página con otros ids y fechas, para simular páginas siguientes.
  const pageWith = (idSuffix: string, date: string) =>
    listingHtml
      .replace(/-(\d{6,})(?=['"])/g, `-$1${idSuffix}`)
      .replace(/\d{1,2} de [A-Za-zé]+ de \d{4}/g, date);

  function sourceWithSpy(pageFor: (url: string) => string, options: { maxPages?: number } = {}) {
    const fetched: string[] = [];
    const fetchPage = (url: string): Promise<string> => {
      fetched.push(url);
      return Promise.resolve(url.includes('/trabajo/') ? detailHtml : pageFor(url));
    };
    const source = createChiletrabajosSource({
      windowDays: 5,
      now: new Date('2026-08-20T12:00:00Z'),
      fetchPage,
      ...options,
    });
    const listings = () => fetched.filter((url) => url.startsWith(BASE));
    return { source, listings };
  }

  it('pagina por offset en la ruta, no con ?page= (el sitio lo ignora)', async () => {
    const { source, listings } = sourceWithSpy((url) =>
      url === BASE
        ? listingHtml
        : url === `${BASE}/30`
          ? pageWith('1', '17 de Agosto de 2026')
          : pageWith('2', '1 de Agosto de 2026'),
    );
    await source.fetchListings();

    expect(listings()).toEqual([BASE, `${BASE}/30`, `${BASE}/60`]);
  });

  it('corta en el tope de páginas aunque siga habiendo ofertas recientes', async () => {
    const { source, listings } = sourceWithSpy(() => listingHtml, { maxPages: 2 });
    await source.fetchListings();
    expect(listings()).toHaveLength(2);
  });

  it('no baja dos veces una oferta destacada que se repite entre páginas', async () => {
    const { source } = sourceWithSpy(() => listingHtml, { maxPages: 2 });
    const jobs = await source.fetchListings();
    expect(new Set(jobs.map((job) => job.sourceId)).size).toBe(jobs.length);
  });

  it('ignora ofertas fuera de la ventana de días', async () => {
    const { source } = sourceWithSpy(() => pageWith('', '1 de Agosto de 2026'));
    expect(await source.fetchListings()).toEqual([]);
  });

  it('falla si la primera página viene sin cards', async () => {
    const { source } = sourceWithSpy(() => '<html></html>');
    await expect(source.fetchListings()).rejects.toThrow(/Chiletrabajos/);
  });
});
