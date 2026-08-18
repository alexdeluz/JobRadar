import { describe, expect, it } from 'vitest';
import { formatSalary, signalLevel, timeAgo } from './format.js';

describe('formatSalary', () => {
  it('formatea rango completo con moneda', () => {
    expect(formatSalary(2500, 3200, 'USD')).toBe('2.500–3.200 USD');
  });
  it('formatea solo mínimo como "desde"', () => {
    expect(formatSalary(2500, null, 'USD')).toBe('desde 2.500 USD');
  });
  it('formatea solo máximo como "hasta"', () => {
    expect(formatSalary(null, 3200, 'USD')).toBe('hasta 3.200 USD');
  });
  it('devuelve null sin datos de salario', () => {
    expect(formatSalary(null, null, null)).toBeNull();
  });
});

describe('signalLevel', () => {
  it('convierte score 0-100 a nivel de señal 1-5', () => {
    expect(signalLevel(0)).toBe(1);
    expect(signalLevel(19)).toBe(1);
    expect(signalLevel(20)).toBe(2);
    expect(signalLevel(55)).toBe(3);
    expect(signalLevel(79)).toBe(4);
    expect(signalLevel(80)).toBe(5);
    expect(signalLevel(100)).toBe(5);
  });
  it('score null es señal 0 (sin clasificar)', () => {
    expect(signalLevel(null)).toBe(0);
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-08-18T12:00:00Z');
  it('describe horas y días relativos en español', () => {
    expect(timeAgo('2026-08-18T09:00:00Z', now)).toBe('hace 3 h');
    expect(timeAgo('2026-08-15T12:00:00Z', now)).toBe('hace 3 días');
    expect(timeAgo('2026-08-18T11:59:30Z', now)).toBe('recién');
  });
  it('devuelve null sin fecha', () => {
    expect(timeAgo(null, now)).toBeNull();
  });
});
