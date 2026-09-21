import type { AtsCompany } from './ats.js';

/**
 * Empresas cuyo job board se consulta directamente. Verificadas una por una:
 * de ~28 candidatas chilenas probadas contra los tres proveedores, estas son
 * las que respondieron con ofertas.
 *
 * Para agregar una: mirá la URL de su página de empleos y sacá el slug.
 *   jobs.lever.co/<slug>            → provider 'lever'
 *   jobs.ashbyhq.com/<slug>         → provider 'ashby'
 *   boards.greenhouse.io/<slug>     → provider 'greenhouse'
 *
 * Un slug que deje de responder no voltea el barrido: se omite ese board y
 * queda el aviso en el log del run.
 */
export const ATS_COMPANIES: readonly AtsCompany[] = [
  // Chilenas
  // Toku también tiene board en Lever, pero el vigente es el de Ashby.
  { provider: 'ashby', slug: 'toku', company: 'Toku' },
  { provider: 'lever', slug: 'xepelin', company: 'Xepelin' },
  { provider: 'lever', slug: 'fintual', company: 'Fintual' },
  { provider: 'lever', slug: '2brains', company: '2Brains' },
  // Con equipo en Chile
  // Checkr publica su hub de Santiago en un board aparte, con slug "chile".
  { provider: 'greenhouse', slug: 'chile', company: 'Checkr' },
  { provider: 'greenhouse', slug: 'sezzle', company: 'Sezzle' },
  { provider: 'greenhouse', slug: 'speechify', company: 'Speechify' },
  { provider: 'lever', slug: 'coderio', company: 'Coderio' },
  { provider: 'ashby', slug: 'canals', company: 'Canals' },
  // Consultoras que contratan remoto en LATAM (Lever distingue mayúsculas en el slug)
  { provider: 'lever', slug: 'bluelightconsulting', company: 'Bluelight Consulting' },
  { provider: 'lever', slug: 'Ubiminds', company: 'Ubiminds' },
  { provider: 'greenhouse', slug: 'praxent', company: 'Praxent' },
  { provider: 'greenhouse', slug: 'arionkoder', company: 'Arionkoder' },
  { provider: 'ashby', slug: 'g2i', company: 'G2i' },
];
