import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { Classification, NormalizedJob } from '@jobradar/core';
import { config } from '../config.js';

const ClassificationSchema = z.object({
  category: z.enum(['dotnet', 'js_transition', 'discard']),
  score: z.number(),
  reasons: z.array(z.string()),
  redFlags: z.array(z.string()),
});

const SYSTEM_INTRO = `Eres el clasificador de un radar personal de ofertas laborales.
Evalúa cada oferta contra el perfil del usuario y clasifícala:
- "dotnet": rol principalmente .NET/C#/SQL Server. Categoría objetivo.
- "js_transition": rol JS/TS/React/Node accesible para un senior backend en transición (no exige años de experiencia profesional en ese stack).
- "discard": no calza con el perfil.
El score (0-100) mide qué tan buen match es la oferta contra el perfil y sus criterios.
En "reasons" da 1-3 razones concretas en español. En "redFlags" lista impedimentos reales según el perfil (puede quedar vacío).`;

/** Prompt por oferta: solo los datos presentes, sin imprimir nulls. */
export function buildJobPrompt(job: NormalizedJob): string {
  const lines = [`Título: ${job.title}`];
  if (job.company !== null) lines.push(`Empresa: ${job.company}`);
  if (job.location !== null) lines.push(`Ubicación: ${job.location}`);
  if (job.salaryMin !== null || job.salaryMax !== null) {
    lines.push(
      `Salario: ${job.salaryMin ?? '?'} - ${job.salaryMax ?? '?'} ${job.salaryCurrency ?? ''}`.trim(),
    );
  }
  if (job.remote !== null) lines.push(`Modalidad: ${job.remote}`);
  lines.push('', 'Descripción:', job.description);
  return lines.join('\n');
}

type ParseFn = (request: {
  model: string;
  max_tokens: number;
  system: { type: 'text'; text: string; cache_control: { type: 'ephemeral' } }[];
  messages: { role: 'user'; content: string }[];
  output_config: { format: unknown };
}) => Promise<{ parsed_output: unknown }>;

/**
 * Clasifica una oferta usando una función `parse` inyectable (el SDK en
 * producción, un mock en tests). El perfil va en `system` con cache_control
 * para que el batch diario reutilice el prefijo cacheado.
 */
export async function classifyWith(
  parse: ParseFn,
  profile: string,
  job: NormalizedJob,
): Promise<Classification> {
  const response = await parse({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: `${SYSTEM_INTRO}\n\n# Perfil del usuario\n\n${profile}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: buildJobPrompt(job) }],
    output_config: { format: zodOutputFormat(ClassificationSchema) },
  });
  const parsed = ClassificationSchema.nullable().parse(response.parsed_output ?? null);
  if (parsed === null) {
    throw new Error(`El modelo no devolvió una clasificación parseable para "${job.title}"`);
  }
  return { ...parsed, score: Math.max(0, Math.min(100, Math.round(parsed.score))) };
}

/**
 * Clasificador real: SDK de Anthropic + perfil desde data/profile.md.
 * El cliente se crea en el primer uso: sin API key, cada oferta falla con un
 * error claro y queda pending_classification en vez de abortar el scrape.
 */
export function createClassifier(): (job: NormalizedJob) => Promise<Classification> {
  let parse: ParseFn | null = null;
  let profile: string | null = null;
  return (job) => {
    if (parse === null) {
      const client = new Anthropic();
      parse = (request) => client.messages.parse(request as Parameters<typeof client.messages.parse>[0]);
      profile = readFileSync(config.profilePath, 'utf-8');
    }
    return classifyWith(parse, profile!, job);
  };
}
