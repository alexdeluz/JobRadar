/**
 * Filtro de ubicación compartido por las fuentes que publican para toda
 * LATAM (Get on Board, boards de ATS): se conservan las ofertas de Chile y las
 * que no declaran lugar; el resto no le sirve al usuario.
 */

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
