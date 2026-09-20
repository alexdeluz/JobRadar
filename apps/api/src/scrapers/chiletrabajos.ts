import { load } from 'cheerio';
import {
  applyRules,
  fingerprint,
  TITLE_PREFILTER_KEYWORDS,
  type NormalizedJob,
} from '@jobradar/core';
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
  /** Fecha de la card en ISO (YYYY-MM-DD); null si no se reconoce. */
  publishedAt: string | null;
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Convierte "18 de Agosto de 2026" a "2026-08-18". */
export function parseChiletrabajosDate(text: string): string | null {
  const match = /(\d{1,2}) de ([a-záéíóú]+) de (\d{4})/i.exec(text);
  if (match === null) return null;
  const month = MONTHS.indexOf(match[2]!.toLowerCase().replace('setiembre', 'septiembre'));
  if (month === -1) return null;
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1]!.padStart(2, '0')}`;
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
      publishedAt: parseChiletrabajosDate($(card).find('h3.meta .fa-calendar').parent().text()),
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
const PAGE_SIZE = 30;
const DAY_MS = 86_400_000;

/**
 * Fuente Chiletrabajos: listado de la categoría informática (SSR clásico),
 * paginado por offset en la ruta (`/informatica/30`, `/60`…; el sitio ignora
 * `?page=`). Avanza mientras la página traiga ofertas dentro de la ventana de
 * días y baja el detalle solo de las recientes que pasan el pre-filtro, con
 * throttle para no castigar al sitio.
 */
export function createChiletrabajosSource(
  options: {
    windowDays?: number;
    maxPages?: number;
    now?: Date;
    fetchPage?: (url: string) => Promise<string>;
  } = {},
): JobSource {
  const windowDays = options.windowDays ?? 7;
  const maxPages = options.maxPages ?? 8;
  const fetchPage = options.fetchPage ?? fetchWithThrottle(3000);
  return {
    name: 'chiletrabajos',
    async fetchListings() {
      const now = options.now ?? new Date();
      const isRecent = (publishedAt: string | null): boolean =>
        // Una fecha ilegible cuenta como reciente: mejor bajar de más que perderla.
        publishedAt === null || (now.getTime() - Date.parse(publishedAt)) / DAY_MS <= windowDays;
      const jobs: NormalizedJob[] = [];
      const seen = new Set<string>();
      for (let page = 0; page < maxPages; page++) {
        const url = `${BASE}/trabajos/informatica${page > 0 ? `/${page * PAGE_SIZE}` : ''}`;
        const items = parseChiletrabajosListing(await fetchPage(url));
        if (items.length === 0 && page === 0) {
          throw new Error('Listado de Chiletrabajos sin cards .job-item (¿cambió el HTML?)');
        }
        const recent = items.filter((item) => isRecent(item.publishedAt));
        for (const item of recent) {
          // Las destacadas se repiten entre páginas.
          if (seen.has(item.sourceId)) continue;
          seen.add(item.sourceId);
          // Pre-filtro barato: solo baja el detalle si título+snippet aluden a desarrollo.
          const prefilter = { title: item.title, description: item.snippet };
          if (!applyRules(prefilter, TITLE_PREFILTER_KEYWORDS).passed) continue;
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
            publishedAt: detail.publishedAt ?? item.publishedAt,
            fingerprint: fingerprint(item.title, item.company),
          });
        }
        if (recent.length === 0) break;
      }
      return jobs;
    },
  };
}
