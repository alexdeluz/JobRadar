import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// Carga .env de la raíz si existe (ANTHROPIC_API_KEY, overrides).
try {
  process.loadEnvFile(resolve(repoRoot, '.env'));
} catch {
  // sin .env: se usan las variables de entorno del sistema
}

export const config = {
  /** Base SQLite compartida por scraper y API. */
  dbPath: process.env['JOBRADAR_DB'] ?? resolve(repoRoot, 'data/jobradar.db'),
  /** Perfil resumido del usuario para el prompt de clasificación. */
  profilePath: resolve(repoRoot, 'data/profile.md'),
  cvPathEs: resolve(repoRoot, 'data/CV_Alejandro_ES.pdf'),
  cvPathEn: resolve(repoRoot, 'data/CV_Alejandro_EN.pdf'),
  api: {
    port: Number(process.env['JOBRADAR_PORT'] ?? 4310),
  },
  /** Fuerza la ventana de días de los portales paginados (p. ej. para recuperar un hueco). */
  windowDaysOverride: process.env['JOBRADAR_WINDOW_DAYS']
    ? Number(process.env['JOBRADAR_WINDOW_DAYS'])
    : null,
  getonbrd: {
    /** 20 ofertas por página; 15 páginas cubren el listado de programming. */
    maxPages: 15,
  },
  computrabajo: {
    /** Slugs de `/trabajo-de-<término>`: el título no siempre dice "desarrollador". */
    searches: ['desarrollador', 'programador', 'net', 'fullstack', 'react'],
    /** 20 ofertas por página; tope por búsqueda aunque siga habiendo recientes. */
    maxPagesPerSearch: 6,
  },
  linkedin: {
    /** Búsquedas específicas del perfil: LinkedIn matchea también contra la descripción. */
    searches: ['.NET', 'C#', 'fullstack', 'react node'],
    /** 10 ofertas por página, ya acotadas a Chile y a los últimos 2 días. */
    maxPagesPerSearch: 3,
    /** Tope de detalles por run, para no insistirle a LinkedIn. */
    maxDetails: 60,
  },
} as const;
