import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createLinkedinSource,
  parseLinkedinDetail,
  parseLinkedinSearch,
} from '../src/scrapers/linkedin.js';

const searchHtml = readFileSync(
  new URL('./fixtures/linkedin-search.html', import.meta.url),
  'utf-8',
);
const detailHtml = readFileSync(
  new URL('./fixtures/linkedin-detail.html', import.meta.url),
  'utf-8',
);

describe('parseLinkedinSearch', () => {
  const items = parseLinkedinSearch(searchHtml);

  it('extrae una entrada por cada card del fragmento', () => {
    expect(items).toHaveLength(10);
  });

  it('extrae id, url canónica sin tracking y los datos de la card', () => {
    const first = items[0]!;
    expect(first.sourceId).toBe('4460529305');
    expect(first.url).toBe('https://www.linkedin.com/jobs/view/4460529305');
    expect(first.title).toBe('Full Stack Engineer - Integrations');
    expect(first.company).toBe('Front');
    expect(first.location).toBe('Gran Santiago, Región Metropolitana de Santiago, Chile');
    expect(first.publishedAt).toBe('2026-09-19');
  });

  it('devuelve vacío para un fragmento sin cards (fin de la paginación)', () => {
    expect(parseLinkedinSearch('')).toEqual([]);
  });
});

describe('parseLinkedinDetail', () => {
  it('convierte la descripción HTML a texto plano', () => {
    const detail = parseLinkedinDetail(detailHtml);
    expect(detail.description).toContain('About FullStack');
    expect(detail.description).not.toContain('<strong>');
  });

  it('falla ruidosamente si el detalle no trae la descripción', () => {
    expect(() => parseLinkedinDetail('<html><body>Inicia sesión</body></html>')).toThrow(
      /descripción/,
    );
  });
});

describe('createLinkedinSource', () => {
  function sourceWithSpy(
    options: { searches?: string[]; maxDetails?: number; failDetailOf?: string } = {},
  ) {
    const fetched: string[] = [];
    const fetchPage = (url: string): Promise<string> => {
      fetched.push(url);
      if (url.includes('/seeMoreJobPostings/')) {
        return Promise.resolve(url.endsWith('start=0') ? searchHtml : '');
      }
      if (options.failDetailOf !== undefined && url.endsWith(options.failDetailOf)) {
        return Promise.reject(new Error('HTTP 404'));
      }
      return Promise.resolve(detailHtml);
    };
    const source = createLinkedinSource({
      searches: options.searches ?? ['.net'],
      ...(options.maxDetails !== undefined && { maxDetails: options.maxDetails }),
      fetchPage,
    });
    return { source, fetched };
  }

  it('pagina hasta una página vacía y baja un detalle por oferta', async () => {
    const { source, fetched } = sourceWithSpy();
    const jobs = await source.fetchListings();

    expect(jobs).toHaveLength(10);
    expect(fetched).toHaveLength(12); // 2 páginas de búsqueda + 10 detalles
    expect(fetched[0]).toContain('keywords=.net');
    expect(fetched[0]).toContain('location=Chile');
  });

  it('no repite el detalle de ofertas que aparecen en varias búsquedas', async () => {
    const { source, fetched } = sourceWithSpy({ searches: ['.net', 'c#'] });
    const jobs = await source.fetchListings();

    expect(jobs).toHaveLength(10);
    expect(fetched).toHaveLength(14); // 2 × 2 páginas + 10 detalles
    expect(fetched.some((url) => url.includes('keywords=c%23'))).toBe(true);
  });

  it('respeta el tope de detalles por run', async () => {
    const { source } = sourceWithSpy({ maxDetails: 3 });
    expect(await source.fetchListings()).toHaveLength(3);
  });

  it('normaliza cada oferta e infiere la modalidad del título', async () => {
    const { source } = sourceWithSpy();
    const jobs = await source.fetchListings();
    const job = jobs.find((candidate) => candidate.sourceId === '4469262148')!;

    expect(job.source).toBe('linkedin');
    expect(job.url).toBe('https://www.linkedin.com/jobs/view/4469262148');
    expect(job.title).toBe('Software Developer (.NET + Vue 3) - Remote - Latin America');
    expect(job.company).toBe('FullStack');
    expect(job.remote).toBe('remote');
    expect(job.publishedAt).toBe('2026-09-18');
    expect(job.description).toContain('About FullStack');
    expect(job.fingerprint).not.toBe('');
    expect(jobs[0]!.remote).toBeNull();
  });

  it('omite la oferta cuyo detalle falla y sigue con el resto', async () => {
    const { source } = sourceWithSpy({ failDetailOf: '4469262148' });
    const jobs = await source.fetchListings();

    expect(jobs).toHaveLength(9);
    expect(jobs.map((job) => job.sourceId)).not.toContain('4469262148');
  });

  it('falla si ninguna búsqueda trae ofertas, para no reportar un run sano en falso', async () => {
    const source = createLinkedinSource({
      searches: ['.net'],
      fetchPage: () => Promise.resolve(''),
    });
    await expect(source.fetchListings()).rejects.toThrow(/LinkedIn/);
  });

  it('falla si todos los detalles fallan (bloqueo o cambio de HTML)', async () => {
    const source = createLinkedinSource({
      searches: ['.net'],
      fetchPage: (url) =>
        url.includes('/seeMoreJobPostings/')
          ? Promise.resolve(url.endsWith('start=0') ? searchHtml : '')
          : Promise.reject(new Error('HTTP 999')),
    });
    await expect(source.fetchListings()).rejects.toThrow(/999/);
  });
});
