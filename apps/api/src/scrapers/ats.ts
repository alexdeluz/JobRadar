import { fingerprint, type NormalizedJob, type RemoteModality } from '@jobradar/core';
import type { JobSource } from './types.js';
import { htmlToText } from './getonbrd.js';

/** Proveedores de ATS cuyos job boards exponen JSON público y estable. */
export type AtsProvider = 'greenhouse' | 'lever' | 'ashby';

export interface AtsCompany {
  provider: AtsProvider;
  /** Identificador de la empresa dentro del ATS (el de la URL del board). */
  slug: string;
  company: string;
}

export interface AtsAdapter {
  url(slug: string): string;
  normalize(payload: unknown, company: AtsCompany): NormalizedJob[];
}

/** Los ids son únicos dentro de cada board, no entre boards. */
function atsSourceId(company: AtsCompany, id: string): string {
  return `${company.provider}:${company.slug}:${id}`;
}

function baseJob(
  company: AtsCompany,
  fields: {
    id: string;
    url: string;
    title: string;
    location: string | null;
    description: string;
    publishedAt: string | null;
    remote: RemoteModality | null;
  },
): NormalizedJob {
  return {
    source: 'ats',
    sourceId: atsSourceId(company, fields.id),
    url: fields.url,
    title: fields.title,
    company: company.company,
    location: fields.location,
    // Ningún board de los tres publica renta en el listado.
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    remote: fields.remote,
    description: fields.description,
    publishedAt: fields.publishedAt,
    fingerprint: fingerprint(fields.title, company.company),
  };
}

function toIso(value: string | number | undefined): string | null {
  if (value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function blank(value: string | undefined | null): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  isRemote?: boolean;
  publishedAt?: string;
  jobUrl: string;
  descriptionPlain?: string;
}

interface LeverJob {
  id: string;
  text: string;
  categories?: { location?: string };
  createdAt?: number;
  hostedUrl: string;
  descriptionPlain?: string;
  additionalPlain?: string;
  /** Lever separa los requisitos del cuerpo; sin esto se pierde el stack. */
  lists?: { text?: string; content?: string }[];
}

interface GreenhouseJob {
  id: number;
  title: string;
  location?: { name?: string };
  first_published?: string;
  updated_at?: string;
  absolute_url: string;
  content?: string;
}

/**
 * Greenhouse entrega `content` con el HTML escapado como entidades
 * (`&lt;p&gt;`), así que hay que desescapar antes de convertir a texto.
 */
function greenhouseContentToText(content: string): string {
  return htmlToText(htmlToText(content));
}

export const ATS_ADAPTERS: Record<AtsProvider, AtsAdapter> = {
  ashby: {
    url: (slug) => `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
    normalize(payload, company) {
      const jobs = (payload as { jobs?: AshbyJob[] }).jobs ?? [];
      return jobs.map((job) =>
        baseJob(company, {
          id: job.id,
          url: job.jobUrl,
          title: job.title,
          location: blank(job.location),
          description: job.descriptionPlain ?? '',
          publishedAt: toIso(job.publishedAt),
          remote: job.isRemote === true ? 'remote' : null,
        }),
      );
    },
  },
  lever: {
    url: (slug) => `https://api.lever.co/v0/postings/${slug}?mode=json`,
    normalize(payload, company) {
      const jobs = (payload as LeverJob[] | undefined) ?? [];
      return jobs.map((job) =>
        baseJob(company, {
          id: job.id,
          url: job.hostedUrl,
          title: job.text,
          location: blank(job.categories?.location),
          description: [
            job.descriptionPlain ?? '',
            ...(job.lists ?? []).map(
              (list) => `${list.text ?? ''}\n${htmlToText(list.content ?? '')}`,
            ),
            job.additionalPlain ?? '',
          ]
            .map((part) => part.trim())
            .filter((part) => part !== '')
            .join('\n'),
          publishedAt: toIso(job.createdAt),
          remote: null,
        }),
      );
    },
  },
  greenhouse: {
    url: (slug) => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
    normalize(payload, company) {
      const jobs = (payload as { jobs?: GreenhouseJob[] }).jobs ?? [];
      return jobs.map((job) =>
        baseJob(company, {
          id: String(job.id),
          url: job.absolute_url,
          title: job.title,
          location: blank(job.location?.name),
          description: greenhouseContentToText(job.content ?? ''),
          publishedAt: toIso(job.first_published ?? job.updated_at),
          remote: null,
        }),
      );
    },
  },
};

/** Marcadores de que la vacante es en Chile. */
const CHILE_MARKERS = [
  'chile',
  'santiago',
  'region metropolitana',
  'las condes',
  'providencia',
  'valparaiso',
  'vina del mar',
  'concepcion',
];

/**
 * Palabras que no nombran un lugar: si tras quitarlas no queda nada, el board
 * dice "remoto" pero no dónde, y la oferta sigue siendo candidata.
 */
const GENERIC_WORDS = new Set([
  'remote',
  'remoto',
  'remota',
  'latam',
  'latin',
  'america',
  'latinoamerica',
  'anywhere',
  'any',
  'location',
  'fully',
  'international',
  'worldwide',
  'global',
  'or',
  'and',
  'o',
  'y',
]);

function normalizeLocation(location: string | null): string {
  return (location ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Los boards regionales publican también en México, Brasil, Polonia o Turquía.
 * Se conservan las de Chile y las que no declaran lugar; el resto se descarta.
 */
export function isChileanOrUnspecified(location: string | null): boolean {
  const text = normalizeLocation(location);
  if (CHILE_MARKERS.some((marker) => text.includes(marker))) return true;
  // Lista blanca, no negra: "Poland, Remote" o "Türkiye, Remote" dejan una
  // palabra que nombra un lugar, y eso alcanza para descartar sin conocer el país.
  const rest = text.split(/[^a-z]+/).filter((word) => word !== '' && !GENERIC_WORDS.has(word));
  return rest.length === 0;
}

async function fetchJsonWithUa(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} en ${url}`);
  }
  return response.json();
}

/**
 * Fuente ATS: recorre una lista curada de empresas y baja su job board.
 * Cada board es una sola request que ya trae la descripción completa, así que
 * el pre-filtro de reglas corre sobre el texto entero y no cuesta red.
 *
 * Un board caído (slug renombrado, empresa que migró de ATS) no puede voltear
 * al resto: se registra y se sigue. Solo si fallan todos la fuente da error.
 */
export function createAtsSource(options: {
  companies: readonly AtsCompany[];
  fetchJson?: (url: string) => Promise<unknown>;
}): JobSource {
  const fetchJson = options.fetchJson ?? fetchJsonWithUa;
  return {
    name: 'ats',
    async fetchListings() {
      const jobs: NormalizedJob[] = [];
      const failures: string[] = [];
      for (const company of options.companies) {
        const adapter = ATS_ADAPTERS[company.provider];
        try {
          const payload = await fetchJson(adapter.url(company.slug));
          jobs.push(...adapter.normalize(payload, company));
        } catch (error) {
          failures.push(`${company.provider}:${company.slug} (${String(error)})`);
        }
      }
      if (failures.length === options.companies.length) {
        throw new Error(`No respondió ningún board de ATS: ${failures.join(', ')}`);
      }
      if (failures.length > 0) {
        console.warn(`[ats] boards omitidos: ${failures.join(', ')}`);
      }
      // Sin pre-filtro de keywords: acá no ahorra requests (la descripción ya
      // vino) y el pipeline lo aplica igual, dejando registro de lo descartado.
      return jobs.filter((job) => isChileanOrUnspecified(job.location));
    },
  };
}
