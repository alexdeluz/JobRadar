import { load } from 'cheerio';
import { applyRules, fingerprint, type NormalizedJob } from '@jobradar/core';
import type { JobSource } from './types.js';
import { htmlToText } from './getonbrd.js';
import { fetchWithThrottle } from './http.js';

export interface TrabajandoSitemapEntry {
  sourceId: string;
  url: string;
  /** Título derivado del slug: alcanza para el pre-filtro, sin bajar el detalle. */
  title: string;
  lastmod: string;
}

/** Parsea el sitemap de ofertas: una entrada por `<url>`, con id y título del slug. */
export function parseTrabajandoSitemap(xml: string): TrabajandoSitemapEntry[] {
  const $ = load(xml, { xmlMode: true });
  const entries: TrabajandoSitemapEntry[] = [];
  $('url').each((_, node) => {
    const url = $(node).find('loc').first().text().trim();
    const lastmod = $(node).find('lastmod').first().text().trim();
    const slug = /\/trabajo\/(\d+)-(.+)$/.exec(url);
    if (slug === null || lastmod === '') return;
    entries.push({
      sourceId: slug[1]!,
      url,
      title: slug[2]!.replace(/-/g, ' '),
      lastmod,
    });
  });
  return entries;
}

export interface TrabajandoDetail {
  title: string;
  company: string | null;
  location: string | null;
  description: string;
  publishedAt: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
}

interface JobPostingLd {
  '@type'?: string;
  title?: string;
  description?: string;
  datePosted?: string;
  hiringOrganization?: { name?: string };
  jobLocation?: { address?: { addressLocality?: string; addressRegion?: string } };
  baseSalary?: { value?: { minValue?: number; maxValue?: number; value?: number } };
}

/** Trabajando publica 0 cuando la renta no se informa; no es un sueldo de cero. */
function salaryOrNull(amount: number | undefined): number | null {
  return amount === undefined || amount <= 0 ? null : amount;
}

/** Extrae los datos de la oferta del JSON-LD JobPosting del detalle. */
export function parseTrabajandoDetail(html: string): TrabajandoDetail {
  const $ = load(html);
  let posting: JobPostingLd | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text()) as JobPostingLd;
      if (data['@type'] === 'JobPosting') posting = data;
    } catch {
      // JSON-LD malformado: se ignora ese bloque
    }
  });
  if (posting === null) {
    throw new Error('Detalle de Trabajando sin JSON-LD JobPosting (¿cambió el HTML?)');
  }
  const found: JobPostingLd = posting;
  const salary = found.baseSalary?.value;
  const address = found.jobLocation?.address;
  const location = address?.addressLocality ?? address?.addressRegion ?? '';
  const company = found.hiringOrganization?.name ?? '';
  return {
    title: found.title ?? '',
    company: company === '' ? null : company,
    location: location === '' ? null : location,
    description: htmlToText(found.description ?? ''),
    publishedAt: found.datePosted ?? null,
    salaryMin: salaryOrNull(salary?.minValue ?? salary?.value),
    salaryMax: salaryOrNull(salary?.maxValue ?? salary?.value),
  };
}

const SITEMAP = 'https://www.trabajando.cl/sitemap-ofertas.xml';
const DAY_MS = 86_400_000;

/** Días completos entre dos fechas, ignorando la hora del día. */
function daysBetween(from: string, to: Date): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((end - start) / DAY_MS);
}

/**
 * Fuente Trabajando.cl: el sitemap de ofertas trae las ~11k vigentes en una
 * request, con `lastmod` por oferta y el título dentro del slug. Se baja el
 * detalle solo de las recientes que pasan el pre-filtro de reglas, con throttle.
 */
export function createTrabajandoSource(
  options: {
    windowDays?: number;
    now?: Date;
    fetchPage?: (url: string) => Promise<string>;
  } = {},
): JobSource {
  const windowDays = options.windowDays ?? 4;
  const fetchPage = options.fetchPage ?? fetchWithThrottle(3000);
  return {
    name: 'trabajando',
    async fetchListings() {
      const now = options.now ?? new Date();
      const entries = parseTrabajandoSitemap(await fetchPage(SITEMAP));
      if (entries.length === 0) {
        throw new Error('El sitemap de Trabajando vino sin ofertas (¿cambió el formato?)');
      }
      const jobs: NormalizedJob[] = [];
      for (const entry of entries) {
        // Ventana: el barrido es diario, no hace falta revisitar el archivo completo.
        if (daysBetween(entry.lastmod, now) >= windowDays) continue;
        // Pre-filtro barato: el slug ya trae el título, así que filtra sin red.
        if (!applyRules({ title: entry.title, description: '' }).passed) continue;
        const detail = parseTrabajandoDetail(await fetchPage(entry.url));
        jobs.push({
          source: 'trabajando',
          sourceId: entry.sourceId,
          url: entry.url,
          title: detail.title !== '' ? detail.title : entry.title,
          company: detail.company,
          location: detail.location,
          salaryMin: detail.salaryMin,
          salaryMax: detail.salaryMax,
          salaryCurrency: detail.salaryMin !== null ? 'CLP' : null,
          remote: null,
          description: detail.description,
          publishedAt: detail.publishedAt,
          fingerprint: fingerprint(detail.title, detail.company),
        });
      }
      return jobs;
    },
  };
}
