import { load } from 'cheerio';
import { applyRules, fingerprint, type NormalizedJob } from '@jobradar/core';
import type { JobSource } from './types.js';
import { htmlToText } from './getonbrd.js';
import { fetchWithThrottle } from './http.js';

export interface ChiletrabajosListingItem {
  sourceId: string;
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  snippet: string;
}

export interface ChiletrabajosDetail {
  description: string;
  publishedAt: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
}

/** Parsea las cards `.job-item` de una página de listado/búsqueda. */
export function parseChiletrabajosListing(html: string): ChiletrabajosListingItem[] {
  const $ = load(html);
  const items: ChiletrabajosListingItem[] = [];
  $('.job-item').each((_, card) => {
    const link = $(card).find('h2.title a').first();
    const url = link.attr('href');
    const title = link.text().trim();
    if (url === undefined || title === '') return;
    const sourceId = /-(\d+)$/.exec(url)?.[1];
    if (sourceId === undefined) return;
    const meta = $(card).find('h3.meta').first();
    const company = meta
      .clone()
      .children()
      .remove()
      .end()
      .text()
      .replace(/[,\s]+$/g, '')
      .trim();
    const location = meta.find('a').first().text().trim();
    const snippet = $(card).find('p.description').clone().find('a').remove().end().text().trim();
    items.push({
      sourceId,
      url,
      title,
      company: company === '' ? null : company,
      location: location === '' ? null : location,
      snippet,
    });
  });
  return items;
}

interface JobPostingLd {
  '@type'?: string;
  description?: string;
  datePosted?: string;
  baseSalary?: { value?: { minValue?: number; maxValue?: number; value?: number } };
}

/** Extrae la descripción completa y metadatos del JSON-LD JobPosting del detalle. */
export function parseChiletrabajosDetail(html: string): ChiletrabajosDetail {
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
    throw new Error('Detalle de Chiletrabajos sin JSON-LD JobPosting (¿cambió el HTML?)');
  }
  const found: JobPostingLd = posting;
  const salary = found.baseSalary?.value;
  return {
    description: htmlToText(found.description ?? ''),
    publishedAt: found.datePosted ?? null,
    salaryMin: salary?.minValue ?? salary?.value ?? null,
    salaryMax: salary?.maxValue ?? salary?.value ?? null,
  };
}

const BASE = 'https://www.chiletrabajos.cl';

/**
 * Fuente Chiletrabajos: listado de la categoría informática (SSR clásico).
 * Baja el detalle solo de las ofertas que pasan el pre-filtro de reglas,
 * con throttle para no castigar al sitio.
 */
export function createChiletrabajosSource(
  options: { pages?: number; fetchPage?: (url: string) => Promise<string> } = {},
): JobSource {
  const pages = options.pages ?? 3;
  const fetchPage = options.fetchPage ?? fetchWithThrottle(3000);
  return {
    name: 'chiletrabajos',
    async fetchListings() {
      const jobs: NormalizedJob[] = [];
      for (let page = 1; page <= pages; page++) {
        const url = `${BASE}/trabajos/informatica${page > 1 ? `?page=${page}` : ''}`;
        const items = parseChiletrabajosListing(await fetchPage(url));
        if (items.length === 0 && page === 1) {
          throw new Error('Listado de Chiletrabajos sin cards .job-item (¿cambió el HTML?)');
        }
        for (const item of items) {
          // Pre-filtro barato: solo baja el detalle si título+snippet aluden al stack.
          if (!applyRules({ title: item.title, description: item.snippet }).passed) continue;
          const detail = parseChiletrabajosDetail(await fetchPage(item.url));
          jobs.push({
            source: 'chiletrabajos',
            sourceId: item.sourceId,
            url: item.url,
            title: item.title,
            company: item.company,
            location: item.location,
            salaryMin: detail.salaryMin,
            salaryMax: detail.salaryMax,
            salaryCurrency: detail.salaryMin !== null ? 'CLP' : null,
            remote: null,
            description: detail.description !== '' ? detail.description : item.snippet,
            publishedAt: detail.publishedAt,
            fingerprint: fingerprint(item.title, item.company),
          });
        }
        if (items.length === 0) break;
      }
      return jobs;
    },
  };
}
