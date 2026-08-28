import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ATS_ADAPTERS, createAtsSource, type AtsCompany } from '../src/scrapers/ats.js';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8'));
}

const ashbyPayload = fixture('ats-ashby.json');
const leverPayload = fixture('ats-lever.json');
const greenhousePayload = fixture('ats-greenhouse.json');

const TOKU: AtsCompany = { provider: 'ashby', slug: 'toku', company: 'Toku' };
const XEPELIN: AtsCompany = { provider: 'lever', slug: 'xepelin', company: 'Xepelin' };
const STRIPE: AtsCompany = { provider: 'greenhouse', slug: 'stripe', company: 'Stripe' };

describe('ATS_ADAPTERS.ashby', () => {
  const jobs = ATS_ADAPTERS.ashby.normalize(ashbyPayload, TOKU);
  const job = jobs.find((j) => j.title === 'Software Engineer')!;

  it('normaliza cada oferta del board', () => {
    expect(jobs).toHaveLength(17);
  });

  it('mapea id, url, empresa y ubicación', () => {
    expect(job.sourceId).toBe('ashby:toku:9c327e8b-1cf3-45da-a99a-e60420df8a0c');
    expect(job.url).toBe('https://jobs.ashbyhq.com/toku/9c327e8b-1cf3-45da-a99a-e60420df8a0c');
    expect(job.company).toBe('Toku');
    expect(job.location).toBe('Chile');
  });

  it('marca la modalidad remota que declara el board', () => {
    expect(job.remote).toBe('remote');
  });

  it('usa la descripción en texto plano que ya trae la respuesta', () => {
    expect(job.description).toContain('En Toku estamos buscando Software Engineers');
  });

  it('convierte publishedAt a ISO 8601', () => {
    expect(job.publishedAt).toBe('2025-08-13T19:16:52.961Z');
  });
});

describe('ATS_ADAPTERS.lever', () => {
  const jobs = ATS_ADAPTERS.lever.normalize(leverPayload, XEPELIN);
  const job = jobs.find((j) => j.title === 'Sr Software Engineer')!;

  it('normaliza cada oferta del board', () => {
    expect(jobs).toHaveLength(13);
  });

  it('mapea id, url y ubicación desde categories', () => {
    expect(job.sourceId).toBe('lever:xepelin:95565922-016f-4208-941c-0b15f9626bcd');
    expect(job.url).toBe('https://jobs.lever.co/xepelin/95565922-016f-4208-941c-0b15f9626bcd');
    expect(job.location).toBe('Santiago');
  });

  it('convierte createdAt (epoch ms) a ISO 8601', () => {
    expect(job.publishedAt).toBe(new Date(1718286344024).toISOString());
  });
});

describe('ATS_ADAPTERS.greenhouse', () => {
  const jobs = ATS_ADAPTERS.greenhouse.normalize(greenhousePayload, STRIPE);

  it('normaliza cada oferta del board', () => {
    expect(jobs).toHaveLength(3);
  });

  it('desescapa el HTML doblemente escapado de content y lo deja en texto', () => {
    const description = jobs[0]!.description;
    expect(description).toContain('About Stripe');
    expect(description).not.toContain('&lt;');
    expect(description).not.toContain('<h2>');
  });
});

describe('createAtsSource', () => {
  const COMPANIES: AtsCompany[] = [TOKU, XEPELIN];

  function sourceWith(
    fetchJson: (url: string) => Promise<unknown>,
    companies: AtsCompany[] = COMPANIES,
  ) {
    return createAtsSource({ companies, fetchJson });
  }

  const byCompany = (url: string): Promise<unknown> =>
    Promise.resolve(url.includes('ashby') ? ashbyPayload : leverPayload);

  it('descarta las ofertas de otros países y conserva las chilenas', async () => {
    const jobs = await sourceWith(byCompany).fetchListings();

    expect(jobs.every((j) => /chile|santiago/i.test(j.location ?? ''))).toBe(true);
    expect(jobs.length).toBeGreaterThan(0);
  });

  it('no pre-filtra por keywords: eso lo hace el pipeline, que deja registro', async () => {
    const jobs = await sourceWith(byCompany).fetchListings();
    const titles = jobs.map((j) => j.title);

    // Roles chilenos sin stack en el texto: la fuente los entrega igual y es el
    // pipeline el que los marca discarded_rules, para que sigan siendo visibles.
    expect(titles).toContain('Sr Software Engineer');
    expect(titles).toContain('Payment Consultant');
  });

  it('incluye los requisitos que Lever publica aparte, en lists', async () => {
    const jobs = await sourceWith(byCompany).fetchListings();
    const job = jobs.find((j) => j.title === 'Sr Software Engineer')!;

    expect(job.description).toContain('¿Qué te hará brillar?');
    expect(job.description).toContain('años totales de experiencia');
    expect(job.description).not.toContain('<li>');
  });

  it('sigue con las demás empresas si el board de una falla', async () => {
    const flaky = (url: string): Promise<unknown> =>
      url.includes('lever') ? Promise.reject(new Error('HTTP 404')) : byCompany(url);
    const jobs = await sourceWith(flaky).fetchListings();

    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((j) => j.sourceId.startsWith('ashby:'))).toBe(true);
  });

  it('falla solo si se cayeron todos los boards', async () => {
    const dead = (): Promise<unknown> => Promise.reject(new Error('HTTP 404'));

    await expect(sourceWith(dead).fetchListings()).rejects.toThrow(/ning[uú]n board/i);
  });
});
