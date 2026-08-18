import { describe, expect, it } from 'vitest';
import { needsScrape } from '../src/pipeline/schedule.js';

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
