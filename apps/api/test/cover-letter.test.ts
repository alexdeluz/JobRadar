import { describe, expect, it, vi } from 'vitest';
import { fingerprint, type NormalizedJob } from '@jobradar/core';
import { generateCoverLetterWith } from '../src/llm/cover-letter.js';

const job: NormalizedJob = {
  source: 'getonbrd',
  sourceId: 'x',
  url: 'https://example.com/x',
  title: 'Desarrollador .NET',
  company: 'Acme',
  location: 'Santiago',
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  remote: null,
  description: 'C# y SQL Server en banca',
  publishedAt: null,
  fingerprint: fingerprint('Desarrollador .NET', 'Acme'),
};

describe('generateCoverLetterWith', () => {
  it('envía perfil y oferta al modelo y devuelve el texto generado', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Estimado equipo de Acme...' }],
    });
    const letter = await generateCoverLetterWith(create, 'perfil del usuario', job);
    expect(letter).toBe('Estimado equipo de Acme...');
    const request = create.mock.calls[0]![0] as { system: string; messages: { content: string }[] };
    expect(request.system).toContain('perfil del usuario');
    expect(request.messages[0]!.content).toContain('Desarrollador .NET');
  });

  it('lanza error si el modelo no devuelve texto', async () => {
    const create = vi.fn().mockResolvedValue({ content: [] });
    await expect(generateCoverLetterWith(create, 'perfil', job)).rejects.toThrow(/texto/);
  });
});
