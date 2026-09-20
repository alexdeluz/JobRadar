import { describe, expect, it } from 'vitest';
import { catchUpWindowDays, needsScrape } from '../src/pipeline/schedule.js';

const now = new Date('2026-08-18T12:00:00Z');

describe('needsScrape', () => {
  it('sin barridos previos, corresponde scrapear', () => {
    expect(needsScrape(null, now)).toBe(true);
  });

  it('con un barrido de hace menos de 12 horas, no corresponde', () => {
    expect(needsScrape('2026-08-18T01:00:00Z', now)).toBe(false);
  });

  it('con el último barrido hace más de 12 horas, corresponde (catch-up)', () => {
    expect(needsScrape('2026-08-17T23:00:00Z', now)).toBe(true);
  });
});

describe('catchUpWindowDays', () => {
  it('sin barridos previos, usa una semana', () => {
    expect(catchUpWindowDays(null, now)).toBe(7);
  });

  it('cubre los días sin barrer más uno de holgura', () => {
    expect(catchUpWindowDays('2026-08-13T12:00:00Z', now)).toBe(6);
    expect(catchUpWindowDays('2026-08-14T20:00:00Z', now)).toBe(5);
  });

  it('nunca baja de 2 días ni pasa de 14', () => {
    expect(catchUpWindowDays('2026-08-18T11:00:00Z', now)).toBe(2);
    expect(catchUpWindowDays('2026-06-01T00:00:00Z', now)).toBe(14);
  });
});
