import { load } from 'cheerio';
import { fingerprint, type NormalizedJob } from '@jobradar/core';
import type { JobSource } from './types.js';
import { htmlToText } from './getonbrd.js';
import { fetchWithThrottle } from './http.js';

export interface LinkedinSearchItem {
  sourceId: string;
  url: string;
  title: string;
  company: string | null;
  location: string | null;
  publishedAt: string | null;
}

function blank(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/** Parsea el fragmento de resultados del buscador público: una entrada por card. */
export function parseLinkedinSearch(html: string): LinkedinSearchItem[] {
  const $ = load(html);
  const items: LinkedinSearchItem[] = [];
  $('[data-entity-urn^="urn:li:jobPosting:"]').each((_, node) => {
    const card = $(node);
    const sourceId = card.attr('data-entity-urn')!.split(':').pop()!;
    const title = card.find('.base-search-card__title').first().text().trim();
    if (!/^\d+$/.test(sourceId) || title === '') return;
    items.push({
      sourceId,
      // El href de la card trae subdominio regional y tracking; el id alcanza.
      url: `https://www.linkedin.com/jobs/view/${sourceId}`,
      title,
      company: blank(card.find('.base-search-card__subtitle').first().text()),
      location: blank(card.find('.job-search-card__location').first().text()),
      publishedAt: card.find('time[datetime]').first().attr('datetime') ?? null,
    });
  });
  return items;
}

/** Extrae la descripción del detalle público de la oferta. */
export function parseLinkedinDetail(html: string): { description: string } {
  const $ = load(html);
  const markup = $('.show-more-less-html__markup').first();
  if (markup.length === 0) {
    throw new Error('Detalle de LinkedIn sin descripción (¿cambió el HTML o pide login?)');
  }
  return { description: htmlToText(markup.html() ?? '') };
}

/** LinkedIn no publica la modalidad sin login; se rescata si el título o la ubicación la dicen. */
function inferRemote(text: string): NormalizedJob['remote'] {
  const lower = text.toLowerCase();
  if (/h[ií]brid|hybrid/.test(lower)) return 'hybrid';
  if (/remot/.test(lower)) return 'remote';
  if (/presencial|on-?site/.test(lower)) return 'onsite';
  return null;
}

const GUEST_API = 'https://www.linkedin.com/jobs-guest/jobs/api';
const PAGE_SIZE = 10;
/** Ventana de publicación en segundos: 2 días cubren el barrido cada 12 h con holgura. */
const WINDOW_SECONDS = 172_800;

function searchUrl(keywords: string, start: number): string {
  return (
    `${GUEST_API}/seeMoreJobPostings/search?keywords=${encodeURIComponent(keywords)}` +
    `&location=Chile&f_TPR=r${WINDOW_SECONDS}&start=${start}`
  );
}

/**
 * Fuente LinkedIn, solo lectura: usa el buscador público (sin login, así la
 * cuenta del usuario no corre riesgo) para recopilar ofertas recientes de Chile
 * y enlazarlas. No hay pre-filtro por título: las búsquedas ya son específicas
 * y LinkedIn matchea contra la descripción, que el título solo no refleja.
 * El volumen se acota con páginas por búsqueda y un tope de detalles por run.
 */
export function createLinkedinSource(options: {
  searches: readonly string[];
  maxPagesPerSearch?: number;
  maxDetails?: number;
  fetchPage?: (url: string) => Promise<string>;
}): JobSource {
  const maxPages = options.maxPagesPerSearch ?? 3;
  const maxDetails = options.maxDetails ?? 60;
  const fetchPage = options.fetchPage ?? fetchWithThrottle(4000, { retries: 2 });
  return {
    name: 'linkedin',
    async fetchListings() {
      const found = new Map<string, LinkedinSearchItem>();
      for (const keywords of options.searches) {
        for (let page = 0; page < maxPages; page++) {
          const items = parseLinkedinSearch(await fetchPage(searchUrl(keywords, page * PAGE_SIZE)));
          for (const item of items) {
            if (!found.has(item.sourceId)) found.set(item.sourceId, item);
          }
          if (items.length < PAGE_SIZE) break;
        }
      }
      if (found.size === 0) {
        throw new Error(
          'Las búsquedas de LinkedIn vinieron sin ofertas (¿cambió el HTML o hay bloqueo?)',
        );
      }

      const jobs: NormalizedJob[] = [];
      const failures: string[] = [];
      for (const item of [...found.values()].slice(0, maxDetails)) {
        let description: string;
        try {
          ({ description } = parseLinkedinDetail(
            await fetchPage(`${GUEST_API}/jobPosting/${item.sourceId}`),
          ));
        } catch (err) {
          // Un detalle caído (oferta cerrada, muro de login) no invalida el resto.
          failures.push(`${item.sourceId}: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
        jobs.push({
          source: 'linkedin',
          sourceId: item.sourceId,
          url: item.url,
          title: item.title,
          company: item.company,
          location: item.location,
          salaryMin: null,
          salaryMax: null,
          salaryCurrency: null,
          remote: inferRemote(`${item.title} ${item.location ?? ''}`),
          description,
          publishedAt: item.publishedAt,
          fingerprint: fingerprint(item.title, item.company),
        });
      }
      if (jobs.length === 0) {
        throw new Error(`Fallaron todos los detalles de LinkedIn: ${failures.join('; ')}`);
      }
      return jobs;
    },
  };
}
