import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithThrottle } from '../src/scrapers/http.js';

// Objeto a mano: `new Response` rechaza el 999 no estándar que usa LinkedIn.
function response(status: number, body = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as Response;
}

describe('fetchWithThrottle', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sin reintentos configurados, un 429 falla de inmediato', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(429));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWithThrottle(0)('https://x.test/a')).rejects.toThrow(/HTTP 429/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reintenta con backoff ante 429/999 y devuelve el cuerpo cuando pasa', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(999))
      .mockResolvedValueOnce(response(200, 'ok'));
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchWithThrottle(0, { retries: 2, backoffMs: 1000 })('https://x.test/a');
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('se rinde al agotar los reintentos', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(response(429));
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchWithThrottle(0, { retries: 1, backoffMs: 1000 })('https://x.test/a');
    const assertion = expect(pending).rejects.toThrow(/HTTP 429/);
    await vi.runAllTimersAsync();

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no reintenta errores que no son de rate limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(404));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWithThrottle(0, { retries: 2 })('https://x.test/a')).rejects.toThrow(
      /HTTP 404/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
