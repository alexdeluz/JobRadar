const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Devuelve un fetch de HTML con user-agent de navegador y una pausa mínima
 * entre requests consecutivos, para scrapear con respeto desde IP residencial.
 */
export function fetchWithThrottle(delayMs: number): (url: string) => Promise<string> {
  let last = 0;
  return async (url: string) => {
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
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} en ${url}`);
    }
    return response.text();
  };
}
