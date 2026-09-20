# Job Radar

Radar personal de ofertas laborales para portales chilenos: scrapea, deduplica, clasifica contra mi perfil con un LLM y me deja postular en un clic con carta de presentación generada.

**Stack**: TypeScript estricto en monorepo pnpm — Node 22+ (Fastify, better-sqlite3, cheerio, SDK de Anthropic) + React 19/Vite. Tests con Vitest y fixtures reales de cada portal.

## Cómo funciona

```
fuentes ─▶ normalize ─▶ dedup ─▶ reglas keywords ─▶ Claude Haiku ─▶ SQLite ─▶ dashboard
```

- **Fuentes**: [Get on Board](https://www.getonbrd.com/api-doc.html) (API JSON oficial), Chiletrabajos y Computrabajo (HTML server-rendered con cheerio, throttle y user-agent de navegador; el detalle se baja solo para ofertas que pasan el pre-filtro) , Trabajando.cl (sitemap de ofertas + JSON-LD del detalle) y los job boards de empresas vía ATS (Greenhouse/Lever/Ashby). LinkedIn entra como fuente de solo lectura.
- **LinkedIn, solo lectura**: se usa el buscador público (`jobs-guest`), **sin login**, así la cuenta personal nunca corre riesgo. Unas pocas búsquedas específicas del perfil (`config.linkedin.searches`), acotadas a Chile y a los últimos 2 días, con throttle de 4 s, backoff ante 429/999 y tope de detalles por run. No hay pre-filtro por título porque LinkedIn matchea contra la descripción. En el dashboard estas ofertas no tienen "Preparar postulación" sino "Ver en LinkedIn"; y si la oferta ya vino por otro portal, LinkedIn queda solo como link extra. Es HTML sin contrato: si cambia o bloquea, el error queda aislado en el run de esa fuente.
- **Ventana de días según el último barrido**: Chiletrabajos, Computrabajo y Trabajando miran hacia atrás lo que haya pasado desde su último barrido sano (más un día de holgura, entre 2 y 14), así un barrido tras una semana sin correr no pierde lo que ya salió de las primeras páginas. `JOBRADAR_WINDOW_DAYS=12 pnpm scrape` fuerza la ventana para recuperar un hueco a mano.
- **Chiletrabajos**: pagina por offset en la ruta (`/informatica/30`, `/60`…); el sitio ignora `?page=` y devuelve siempre la primera página.
- **Computrabajo**: varias búsquedas (`config.computrabajo.searches`, porque el título no siempre dice "desarrollador") y cada una se pagina mientras la página traiga ofertas publicadas desde el último barrido sano de la fuente (más un día de holgura, entre 2 y 14). 
- **Trabajando vía sitemap**: `sitemap-ofertas.xml` trae las ~11k ofertas vigentes en una sola request, con `lastmod` por oferta y el título dentro del slug. Eso permite filtrar por ventana de días y aplicar el pre-filtro de keywords **sin tocar la red**; solo las que pasan ambos filtros bajan su detalle (~6 por barrido diario, ~20 s).
- **ATS por empresa**: una request por board devuelve las ofertas **con la descripción completa**, así que no hay detalle que bajar ni throttle que cuidar. Es la fuente de mejor calidad (empresas que no publican en los portales) y de menor volumen: la lista de `ats-companies.ts` se cura a mano y el cuello de botella es descubrir slugs, no el scraper. Un board caído se omite con aviso; solo si fallan todos la fuente da error.
- **Dedup en dos niveles**: `(source, source_id)` para re-scrapes y un _fingerprint_ de título+empresa normalizados para la misma oferta publicada en varios portales (queda una sola entrada con links extra).
- **Clasificación híbrida**: un filtro determinista por keywords descarta lo obviamente irrelevante gratis; Claude Haiku clasifica el resto en `dotnet` (mi stack fuerte) o `js_transition` (roles JS/TS accesibles en transición), con score 0-100, razones y red flags.
- **Semi-auto apply**: "Preparar postulación" genera una carta adaptada a la oferta desde `data/profile.md`, marca la oferta y abre el formulario del portal — la envío yo. Nada postula solo.
- **Aislamiento de fallas**: si un portal cambia su HTML o bloquea, ese run queda registrado con error y el resto continúa; el dashboard tiene una vista de runs para detectarlo.

## Uso

```bash
pnpm install
echo "ANTHROPIC_API_KEY=sk-..." > .env   # opcional: sin key, las ofertas quedan pendientes de clasificar
pnpm scrape        # barrido manual de todas las fuentes
pnpm dev           # API en :4310 + dashboard en :5173
pnpm test          # suite completa
```

Programar el barrido diario en Windows (9:30 + al iniciar sesión, con catch-up si el PC estaba apagado):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1
```

La API también hace catch-up sola: al arrancar y cada hora scrapea si el último barrido tiene más de 12 horas.

## Estructura

```
packages/core   dominio puro: tipos, fingerprint de dedup, reglas de keywords (sin I/O)
apps/api        Fastify + SQLite: scrapers, pipeline, clasificador LLM, REST API
apps/web        React + Vite: bandejas por categoría, señal de radar por score, runs
data/           CVs, profile.md (perfil para el LLM) y jobradar.db (gitignored)
```

Los parsers se testean contra fixtures HTML/JSON reales guardadas en `apps/api/test/fixtures/` — la suite nunca golpea la red.

> **Al guardar una fixture HTML, sacá los `<script>` que el parser no use.** Una página real trae el JS de configuración del portal, y ahí viajan claves de terceros (Google Maps, reCAPTCHA, analytics) que no tienen por qué terminar en este repo: GitHub las detecta y abre una alerta de secreto. Para las fixtures de detalle alcanza con conservar el bloque `application/ld+json`.

## Decisiones

- **Corre local, no en la nube**: Computrabajo bloquea IPs de datacenter (verificado); desde IP residencial con throttle bajo funciona. Las ofertas viven días o semanas, así que un barrido diario no pierde nada.
- **Pre-filtro solo donde ahorra red**: Chiletrabajos, Computrabajo y Trabajando filtran por título antes de bajar el detalle, porque ahí cada oferta cuesta una request. Chiletrabajos y Trabajando usan un filtro amplio (`TITLE_PREFILTER_KEYWORDS`: suma "desarrollador", "programador", "software"…) porque muchos títulos no nombran el stack; en Computrabajo se midió y el amplio deja pasar todo (75 → 173 detalles), así que usa el estricto y compensa con búsquedas por stack. Get on Board y ATS entregan todo y dejan que el pipeline aplique las reglas, que además registra el veredicto y mantiene visible lo descartado.
- **Fase 2**: Remotive/Himalayas/WeWorkRemotely (remoto LATAM), más empresas en `ats-companies.ts`, Laborum (requiere headless), prefill de formularios con Playwright.
- **Descartados**: Indeed y LinkedIn con sesión (anti-bot agresivo; de LinkedIn solo se usa el buscador público, ver arriba), BNE (ClaveÚnica), El Mercurio (poco volumen tech), Empleos Públicos (su `robots.txt` es `Disallow: /` salvo `/pub/`, y justo el endpoint del listado queda fuera; además de 278 convocatorias abiertas solo 2 son del área Informática y ninguna de desarrollo).
