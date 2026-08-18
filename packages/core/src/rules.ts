import type { RulesVerdict } from './types.js';

/**
 * Keywords técnicos que habilitan una oferta para pasar al LLM.
 * El matching es sobre texto normalizado (minúsculas, sin tildes) y con
 * límites de palabra, para que ".net" no matchee dentro de "internet".
 */
export const TECH_KEYWORDS: readonly string[] = [
  '.net',
  'c#',
  'csharp',
  'dotnet',
  'asp.net',
  'sql server',
  'entity framework',
  'blazor',
  'typescript',
  'javascript',
  'node',
  'nodejs',
  'react',
  'next.js',
  'fullstack',
  'full stack',
  'backend',
  'front end',
  'frontend',
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function escapeRegExp(keyword: string): string {
  return keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matching con límites: el keyword no puede estar pegado a letras/dígitos
 * a ninguno de los dos lados ("internet" no contiene ".net" válido porque
 * "inter" lo precede sin separador).
 */
function containsKeyword(text: string, keyword: string): boolean {
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}($|[^a-z0-9])`);
  return pattern.test(text);
}

/**
 * Filtro determinista previo al LLM: pasa toda oferta que mencione al menos
 * un keyword técnico del perfil; lo demás se descarta sin gastar tokens.
 */
export function applyRules(
  job: { title: string; description: string },
  keywords: readonly string[] = TECH_KEYWORDS,
): RulesVerdict {
  const text = normalize(`${job.title}\n${job.description}`);
  const matched = keywords.filter((keyword) => containsKeyword(text, keyword));
  return { passed: matched.length > 0, matched };
}
