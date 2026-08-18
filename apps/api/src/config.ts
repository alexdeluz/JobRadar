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
  getonbrd: {
    /** 20 ofertas por página; 15 páginas cubren el listado de programming. */
    maxPages: 15,
  },
} as const;
