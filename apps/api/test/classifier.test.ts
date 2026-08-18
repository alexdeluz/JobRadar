import { describe, expect, it, vi } from 'vitest';
import { fingerprint, type NormalizedJob } from '@jobradar/core';
import { buildJobPrompt, classifyWith } from '../src/llm/classifier.js';

function job(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    source: 'getonbrd',
    sourceId: 'x',
    url: 'https://example.com/x',
    title: 'Desarrollador .NET',
    company: 'Acme',
    location: 'Santiago',
    salaryMin: 2500,
    salaryMax: 3000,
    salaryCurrency: 'USD',
    remote: 'hybrid',
    description: 'C# y SQL Server en banca',
    publishedAt: null,
    fingerprint: fingerprint('Desarrollador .NET', 'Acme'),
    ...overrides,
  };
}

describe('buildJobPrompt', () => {
  it('incluye título, empresa, salario, modalidad y descripción', () => {
    const prompt = buildJobPrompt(job());
    expect(prompt).toContain('Desarrollador .NET');
    expect(prompt).toContain('Acme');
    expect(prompt).toContain('2500');
    expect(prompt).toContain('hybrid');
    expect(prompt).toContain('C# y SQL Server en banca');
  });

  it('omite las líneas de datos ausentes en vez de imprimir null', () => {
    const prompt = buildJobPrompt(
      job({ company: null, salaryMin: null, salaryMax: null, salaryCurrency: null, remote: null }),
    );
    expect(prompt).not.toContain('null');
  });
});

describe('classifyWith', () => {
  it('devuelve la clasificación parseada por el SDK', async () => {
    const parse = vi.fn().mockResolvedValue({
      parsed_output: {
        category: 'dotnet',
        score: 88,
        reasons: ['Senior .NET en banca'],
        redFlags: [],
      },
    });
    const result = await classifyWith(parse, 'perfil...', job());
    expect(result).toEqual({
      category: 'dotnet',
      score: 88,
      reasons: ['Senior .NET en banca'],
      redFlags: [],
    });
    const request = parse.mock.calls[0]![0] as { system: unknown; messages: unknown };
    expect(JSON.stringify(request.system)).toContain('perfil...');
  });

  it('lanza error si el modelo no devolvió salida parseable', async () => {
    const parse = vi.fn().mockResolvedValue({ parsed_output: null });
    await expect(classifyWith(parse, 'perfil', job())).rejects.toThrow(/parseable/);
  });

  it('acota el score al rango 0-100', async () => {
    const parse = vi.fn().mockResolvedValue({
      parsed_output: { category: 'discard', score: 250, reasons: [], redFlags: [] },
    });
    const result = await classifyWith(parse, 'perfil', job());
    expect(result.score).toBe(100);
  });
});
