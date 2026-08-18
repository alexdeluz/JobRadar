import { createHash } from 'node:crypto';

/**
 * Normaliza texto para comparación tolerante entre portales: minúsculas,
 * sin tildes y sin separadores ("Fintech-Chile S.A." ≡ "fintech chile sa").
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9#+]/g, '');
}

/**
 * Hash estable de título+empresa para detectar la misma oferta
 * publicada en más de un portal.
 */
export function fingerprint(title: string, company: string | null): string {
  const key = `${normalize(title)}|${company === null ? '<null>' : normalize(company)}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}
