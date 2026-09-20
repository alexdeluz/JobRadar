const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 429 estándar y el 999 con que LinkedIn rechaza tráfico que considera automatizado. */
const RATE_LIMIT_STATUSES = new Set([429, 999]);

/**
 * Devuelve un fetch de HTML con user-agent de navegador y una pausa mínima
 * entre requests consecutivos, para scrapear con respeto desde IP residencial.
 * Con `retries`, un rate limit se reintenta con espera exponencial
 * (`backoffMs`, el doble en cada intento) en vez de fallar de inmediato.
 */
export function fetchWithThrottle(
  delayMs: number,
  options: { retries?: number; backoffMs?: number } = {},
): (url: string) => Promise<string> {
  const retries = options.retries ?? 0;
  const backoffMs = options.backoffMs ?? 30_000;
  let last = 0;
  return async (url: string) => {
    for (let attempt = 0; ; attempt++) {
      const wait = last + delayMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      const response = await fetch(url, {
        headers: {
          'user-agent': BROWSER_UA,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'es-CL,es;q=0.9',
        },
      });
      if (response.ok) return response.text();
      if (!RATE_LIMIT_STATUSES.has(response.status) || attempt >= retries) {
        throw new Error(`HTTP ${response.status} en ${url}`);
      }
      await sleep(backoffMs * 2 ** attempt);
    }
  };
}
