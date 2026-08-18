import { load } from 'cheerio';
import { applyRules, fingerprint, type NormalizedJob } from '@jobradar/core';
import type { JobSource } from './types.js';
import { fetchWithThrottle } from './http.js';

const BASE = 'https://cl.computrabajo.com';

export interface ComputrabajoListingItem {
  sourceId: string;
  url: string;
  title: string;
  company: string | null;
  location: string | null;
}

/** Parsea los `article.box_offer` de una página de resultados. */
export function parseComputrabajoListing(html: string): ComputrabajoListingItem[] {
  const $ = load(html);
  const items: ComputrabajoListingItem[] = [];
  $('article.box_offer').each((_, card) => {
    const sourceId = $(card).attr('data-id');
    const link = $(card).find('a.js-o-link').first();
    const href = link.attr('href');
    const title = link.text().trim();
    if (sourceId === undefined || href === undefined || title === '') return;
    const company = $(card).find('[offer-grid-article-company-url]').first().text().trim();
    // La ubicación es el span.mr10 "pelado"; el rating usa span.fx_none.mr10.
    const location = $(card).find('p > span.mr10:not(.fx_none)').first().text().trim();
    items.push({
      sourceId,
      url: `${BASE}${href.split('#')[0] ?? href}`,
      title,
      company: company === '' ? null : company,
      location: location === '' ? null : location,
    });
  });
  return items;
}

/** Extrae la descripción completa del detalle (`div[div-link=oferta]`). */
export function parseComputrabajoDetail(html: string): { description: string } {
  const $ = load(html);
  const container = $('[div-link=oferta]').first();
  if (container.length === 0) {
    throw new Error('Detalle de Computrabajo sin contenedor de oferta (¿cambió el HTML?)');
  }
  container.find('script, style').remove();
  const description = container
    .text()
    .replace(/Descripción de la oferta/i, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  return { description };
}

/**
 * Fuente Computrabajo: búsqueda "trabajo-de-desarrollador" (SSR, requiere
 * user-agent de navegador e IP residencial). Baja el detalle solo de las
 * ofertas que pasan el pre-filtro de reglas por título.
 */
export function createComputrabajoSource(
  options: { pages?: number; fetchPage?: (url: string) => Promise<string> } = {},
): JobSource {
  const pages = options.pages ?? 2;
  const fetchPage = options.fetchPage ?? fetchWithThrottle(4000);
  return {
    name: 'computrabajo',
    async fetchListings() {
      const jobs: NormalizedJob[] = [];
      for (let page = 1; page <= pages; page++) {
        const url = `${BASE}/trabajo-de-desarrollador${page > 1 ? `?p=${page}` : ''}`;
        const items = parseComputrabajoListing(await fetchPage(url));
        if (items.length === 0 && page === 1) {
          throw new Error(
            'Listado de Computrabajo sin article.box_offer (¿cambió el HTML o bloqueó la IP?)',
          );
        }
        for (const item of items) {
          if (!applyRules({ title: item.title, description: '' }).passed) continue;
          const detail = parseComputrabajoDetail(await fetchPage(item.url));
          jobs.push({
            source: 'computrabajo',
            sourceId: item.sourceId,
            url: item.url,
            title: item.title,
            company: item.company,
            location: item.location,
            salaryMin: null,
            salaryMax: null,
            salaryCurrency: null,
            remote: null,
            description: detail.description,
            publishedAt: null,
            fingerprint: fingerprint(item.title, item.company),
          });
        }
        if (items.length === 0) break;
      }
      return jobs;
    },
  };
}
