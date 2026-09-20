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
  /** Días desde la publicación según el listado; null si el texto no se reconoce. */
  ageDays: number | null;
}

/** Convierte la fecha relativa del listado ("Hace 3 horas", "Ayer", "Hace 2 días") a días. */
export function parseComputrabajoAge(text: string): number | null {
  const clean = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/^hace \d+ (minuto|hora)/.test(clean)) return 0;
  if (clean === 'ayer') return 1;
  const days = /^hace (\d+) d[ií]as?/.exec(clean);
  if (days !== null) return Number(days[1]);
  if (/^m[aá]s de 30 d[ií]as/.test(clean)) return 31;
  return null;
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
      ageDays: parseComputrabajoAge($(card).find('p.fs13').first().text()),
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

const DAY_MS = 86_400_000;

/**
 * Fuente Computrabajo: búsquedas `/trabajo-de-<término>` (SSR, requiere
 * user-agent de navegador e IP residencial). Cada búsqueda se pagina mientras
 * la página traiga ofertas dentro de la ventana de días, así un barrido tras
 * varios días sin correr recupera lo que ya salió de las primeras páginas.
 * Baja el detalle solo de las ofertas recientes que pasan el pre-filtro por título.
 */
export function createComputrabajoSource(
  options: {
    searches?: readonly string[];
    windowDays?: number;
    maxPagesPerSearch?: number;
    now?: Date;
    fetchPage?: (url: string) => Promise<string>;
  } = {},
): JobSource {
  const searches = options.searches ?? ['desarrollador'];
  const windowDays = options.windowDays ?? 7;
  const maxPages = options.maxPagesPerSearch ?? 6;
  const fetchPage = options.fetchPage ?? fetchWithThrottle(4000);
  return {
    name: 'computrabajo',
    async fetchListings() {
      const now = options.now ?? new Date();
      const jobs: NormalizedJob[] = [];
      const seen = new Set<string>();
      let listed = 0;
      for (const search of searches) {
        for (let page = 1; page <= maxPages; page++) {
          const url = `${BASE}/trabajo-de-${search}${page > 1 ? `?p=${page}` : ''}`;
          const items = parseComputrabajoListing(await fetchPage(url));
          listed += items.length;
          // El orden no es estricto por fecha: una fecha ilegible cuenta como reciente.
          const recent = items.filter(
            (item) => item.ageDays === null || item.ageDays <= windowDays,
          );
          for (const item of recent) {
            if (seen.has(item.sourceId)) continue;
            seen.add(item.sourceId);
            // Filtro estricto: buscando "desarrollador"/"programador" el amplio dejaría pasar todo
            // (medido: 75 → 173 detalles); las búsquedas por stack cubren lo que el título calla.
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
              publishedAt:
                item.ageDays === null || item.ageDays > 30
                  ? null
                  : new Date(now.getTime() - item.ageDays * DAY_MS).toISOString().slice(0, 10),
              fingerprint: fingerprint(item.title, item.company),
            });
          }
          if (recent.length === 0) break;
        }
      }
      if (listed === 0) {
        throw new Error(
          'Listados de Computrabajo sin article.box_offer (¿cambió el HTML o bloqueó la IP?)',
        );
      }
      return jobs;
    },
  };
}
