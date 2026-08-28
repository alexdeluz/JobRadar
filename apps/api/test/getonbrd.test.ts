import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  htmlToText,
  normalizeGetonbrdJob,
  type GetonbrdJobEntry,
} from '../src/scrapers/getonbrd.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/getonbrd-jobs.json', import.meta.url), 'utf-8'),
) as { data: GetonbrdJobEntry[] };

const first = fixture.data[0]!;

describe('normalizeGetonbrdJob', () => {
  it('mapea los campos básicos de la API al modelo común', () => {
    const job = normalizeGetonbrdJob(first);
    expect(job.source).toBe('getonbrd');
    expect(job.sourceId).toBe(
      'senior-software-engineer-java-angular-english-23people-santiago-e811',
    );
    expect(job.title).toBe('Senior Software Developer Java/Spring Boot (English)');
    expect(job.company).toBe('23people');
    expect(job.url).toBe(
      'https://www.getonbrd.com/jobs/senior-software-engineer-java-angular-english-23people-santiago-e811',
    );
  });

  it('convierte el salario a rango con moneda USD (la API publica en USD)', () => {
    const job = normalizeGetonbrdJob(first);
    expect(job.salaryMin).toBe(2900);
    expect(job.salaryMax).toBe(3200);
    expect(job.salaryCurrency).toBe('USD');
  });

  it('mapea remote_modality a la modalidad común', () => {
    const job = normalizeGetonbrdJob(first);
    expect(job.remote).toBe('remote');
  });

  it('convierte published_at (epoch segundos) a ISO 8601', () => {
    const job = normalizeGetonbrdJob(first);
    expect(job.publishedAt).toBe(new Date(1787000389 * 1000).toISOString());
  });

  it('convierte la descripción HTML a texto plano sin tags', () => {
    const job = normalizeGetonbrdJob(first);
    expect(job.description).toContain('4+ años de experiencia Java');
    expect(job.description).not.toContain('<p>');
    expect(job.description).not.toContain('<li>');
  });

  it('incluye un fingerprint no vacío', () => {
    const job = normalizeGetonbrdJob(first);
    expect(job.fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it('usa los países como ubicación', () => {
    const job = normalizeGetonbrdJob(first);
    expect(job.location).toBe('Remote');
  });
});

describe('htmlToText', () => {
  it('separa los bloques con salto de línea en vez de pegarlos', () => {
    const html = '<p>2 días presencial / 3 remoto</p><p>Ubicación: Las Condes</p>';
    expect(htmlToText(html)).toBe('2 días presencial / 3 remoto\nUbicación: Las Condes');
  });

  it('convierte <br> en salto de línea', () => {
    expect(htmlToText('Requisitos:<br>Node y React')).toBe('Requisitos:\nNode y React');
  });

  it('separa los items de una lista', () => {
    expect(htmlToText('<ul><li>C#</li><li>SQL Server</li></ul>')).toBe('C#\nSQL Server');
  });

  it('no deja saltos ni espacios de más entre bloques', () => {
    const html = '<div><p>Uno</p>\n\n  <p>  Dos  </p></div>';
    expect(htmlToText(html)).toBe('Uno\nDos');
  });

  it('deja intacto el texto sin etiquetas', () => {
    expect(htmlToText('Desarrollador .NET')).toBe('Desarrollador .NET');
  });
});
