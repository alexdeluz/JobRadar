import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createTrabajandoSource,
  parseTrabajandoDetail,
  parseTrabajandoSitemap,
} from '../src/scrapers/trabajando.js';

const sitemapXml = readFileSync(
  new URL('./fixtures/trabajando-sitemap.xml', import.meta.url),
  'utf-8',
);
const detailHtml = readFileSync(
  new URL('./fixtures/trabajando-detail.html', import.meta.url),
  'utf-8',
);

describe('parseTrabajandoSitemap', () => {
  const entries = parseTrabajandoSitemap(sitemapXml);

  it('extrae una entrada por cada <url> del sitemap', () => {
    expect(entries).toHaveLength(19);
  });

  it('extrae url, id numérico y fecha de cada entrada', () => {
    const first = entries[0]!;
    expect(first.url).toBe('https://www.trabajando.cl/trabajo/6112992-especialista-qa-qc-rysfr-08');
    expect(first.sourceId).toBe('6112992');
    expect(first.lastmod).toBe('2026-08-26');
  });

  it('deriva del slug un título legible para el pre-filtro', () => {
    expect(entries[1]!.title).toBe('ingeniero fullstack react typescript las condes urgente');
  });
});

describe('parseTrabajandoDetail', () => {
  const detail = parseTrabajandoDetail(detailHtml);

  it('extrae título, empresa y ubicación del JSON-LD', () => {
    expect(detail.title).toBe('Desarrollador Full Stack');
    expect(detail.company).toBe('RYC Consultores');
    expect(detail.location).toBe('Las Condes');
  });

  it('convierte la descripción HTML a texto plano', () => {
    expect(detail.description).toContain('Modalidad híbrida');
    expect(detail.description).not.toContain('<p>');
  });

  it('extrae la fecha de publicación', () => {
    expect(detail.publishedAt).toBe('2026-08-26');
  });

  it('trata el salario 0 como "no informado", no como sueldo cero', () => {
    expect(detail.salaryMin).toBeNull();
    expect(detail.salaryMax).toBeNull();
  });

  it('falla ruidosamente si el detalle no trae JSON-LD JobPosting', () => {
    expect(() => parseTrabajandoDetail('<html><body>sin datos</body></html>')).toThrow(
      /JobPosting/,
    );
  });
});

describe('createTrabajandoSource', () => {
  const SITEMAP = 'https://www.trabajando.cl/sitemap-ofertas.xml';

  function sourceWithSpy(options: { windowDays?: number } = {}) {
    const fetched: string[] = [];
    const fetchPage = (url: string): Promise<string> => {
      fetched.push(url);
      return Promise.resolve(url === SITEMAP ? sitemapXml : detailHtml);
    };
    const source = createTrabajandoSource({
      fetchPage,
      now: new Date('2026-08-26T12:00:00Z'),
      ...options,
    });
    return { source, fetched };
  }

  it('solo baja el detalle de ofertas recientes que pasan el pre-filtro', async () => {
    const { source, fetched } = sourceWithSpy();
    const jobs = await source.fetchListings();

    expect(jobs.map((job) => job.sourceId)).toEqual(['6118051', '6117456', '6117381']);
    expect(fetched).toHaveLength(4); // sitemap + 3 detalles
  });

  it('descarta ofertas cuyo lastmod cae fuera de la ventana', async () => {
    const { source } = sourceWithSpy({ windowDays: 1 });
    const jobs = await source.fetchListings();

    expect(jobs.map((job) => job.sourceId)).toEqual(['6118051']);
  });

  it('normaliza cada oferta con los datos del detalle', async () => {
    const { source } = sourceWithSpy();
    const [job] = await source.fetchListings();

    expect(job!.source).toBe('trabajando');
    expect(job!.url).toContain('/trabajo/6118051-');
    expect(job!.title).toBe('Desarrollador Full Stack');
    expect(job!.company).toBe('RYC Consultores');
    expect(job!.salaryCurrency).toBeNull();
    expect(job!.fingerprint).not.toBe('');
  });

  it('falla si el sitemap viene vacío, para no reportar un run sano en falso', async () => {
    const source = createTrabajandoSource({
      fetchPage: () => Promise.resolve('<urlset></urlset>'),
      now: new Date('2026-08-26T12:00:00Z'),
    });
    await expect(source.fetchListings()).rejects.toThrow(/sitemap/i);
  });
});
