import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import type { NormalizedJob } from '@jobradar/core';
import { config } from '../config.js';
import { buildJobPrompt } from './classifier.js';

const SYSTEM = `Redactas cartas de presentación breves (120-180 palabras) para postulaciones laborales.
Escribe en primera persona, en el mismo idioma de la oferta (español por defecto).
Conecta la experiencia real del perfil con lo que pide la oferta; nada de frases genéricas ni exageraciones.
Devuelve solo el texto de la carta, sin asunto ni firmas de plantilla.`;

type CreateFn = (request: {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: 'user'; content: string }[];
}) => Promise<{ content: { type: string; text?: string }[] }>;

/** Genera la carta con una función `create` inyectable (SDK real o mock). */
export async function generateCoverLetterWith(
  create: CreateFn,
  profile: string,
  job: NormalizedJob,
): Promise<string> {
  const response = await create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: `${SYSTEM}\n\n# Perfil del candidato\n\n${profile}`,
    messages: [{ role: 'user', content: `Oferta a la que postulo:\n\n${buildJobPrompt(job)}` }],
  });
  const text = response.content.find((block) => block.type === 'text')?.text;
  if (text === undefined || text.trim() === '') {
    throw new Error('El modelo no devolvió texto para la carta');
  }
  return text.trim();
}

/** Carta real con SDK de Anthropic y perfil de data/profile.md. */
export function generateCoverLetter(job: NormalizedJob): Promise<string> {
  const client = new Anthropic();
  const profile = readFileSync(config.profilePath, 'utf-8');
  const create: CreateFn = (request) =>
    client.messages.create(request as Parameters<typeof client.messages.create>[0]) as ReturnType<CreateFn>;
  return generateCoverLetterWith(create, profile, job);
}
