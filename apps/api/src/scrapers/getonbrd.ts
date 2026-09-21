import { load } from 'cheerio';
import { fingerprint, type NormalizedJob, type RemoteModality } from '@jobradar/core';
import type { JobSource } from './types.js';
import { isChileanOrUnspecified } from './location.js';

/** Forma relevante de una entrada de /api/v0/.../jobs con expand=["company"]. */
export interface GetonbrdJobEntry {
  id: string;
  links: { public_url: string };
  attributes: {
    title: string;
    description: string;
    functions?: string | null;
    remote: boolean;
    remote_modality: string | null;
    countries: string[];
    min_salary: number | null;
    max_salary: number | null;
    published_at: number;
    company: { data: { attributes: { name: string } } | null };
  };
}

interface GetonbrdPage {
  data: GetonbrdJobEntry[];
  meta: { page: number; total_pages: number };
}

/**
 * Etiquetas que en pantalla ocupan su propia línea. Sin marcarlas, `.text()`
 * de cheerio concatena sus textos y produce "3 remotoUbicación: Las Condes",
 * que llega así al clasificador.
 */
const BLOCK_TAGS =
  'p, div, li, ul, ol, h1, h2, h3, h4, h5, h6, tr, section, article, blockquote, pre';

/** Convierte el HTML de una descripción a texto plano, respetando los bloques. */
export function htmlToText(html: string): string {
  const $ = load(html);
  $('br').replaceWith('\n');
  $(BLOCK_TAGS).append('\n');
  return $.text()
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function mapRemote(remote: boolean, modality: string | null): RemoteModality {
  if (modality === 'hybrid') return 'hybrid';
  return remote ? 'remote' : 'onsite';
}

/** Convierte una entrada de la API de Get on Board al modelo común. */
export function normalizeGetonbrdJob(entry: GetonbrdJobEntry): NormalizedJob {
  const a = entry.attributes;
  const company = a.company.data?.attributes.name ?? null;
  const description = [a.description, a.functions ?? '']
    .filter(Boolean)
    .map(htmlToText)
    .join('\n')
    .trim();
  return {
    source: 'getonbrd',
    sourceId: entry.id,
    url: entry.links.public_url,
    title: a.title,
    company,
    location: a.countries.length > 0 ? a.countries.join(', ') : null,
    salaryMin: a.min_salary,
    salaryMax: a.max_salary,
    salaryCurrency: a.min_salary !== null || a.max_salary !== null ? 'USD' : null,
    remote: mapRemote(a.remote, a.remote_modality),
    description,
    publishedAt: new Date(a.published_at * 1000).toISOString(),
    fingerprint: fingerprint(a.title, company),
  };
}

const API_BASE = 'https://www.getonbrd.com/api/v0';

/**
 * Fuente Get on Board: usa la API JSON pública oficial (sin auth) y se queda
 * con las ofertas de Chile o remotas sin país.
 * Docs: https://getonbrd.com/api-doc.html
 */
export function createGetonbrdSource(options: { maxPages?: number } = {}): JobSource {
  const maxPages = options.maxPages ?? 15;
  return {
    name: 'getonbrd',
    async fetchListings() {
      const jobs: NormalizedJob[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const url = `${API_BASE}/categories/programming/jobs?per_page=20&page=${page}&expand=${encodeURIComponent('["company"]')}`;
        const response = await fetch(url, { headers: { accept: 'application/json' } });
        if (!response.ok) {
          throw new Error(`Get on Board respondió HTTP ${response.status} en página ${page}`);
        }
        const body = (await response.json()) as GetonbrdPage;
        jobs.push(...body.data.map(normalizeGetonbrdJob));
        if (body.meta.page >= body.meta.total_pages || body.data.length === 0) break;
      }
      // La categoría es de toda LATAM: fuera Perú, México, etc. Las remotas sin país se quedan.
      return jobs.filter((job) => isChileanOrUnspecified(job.location));
    },
  };
}
