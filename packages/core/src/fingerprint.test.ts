import { describe, expect, it } from 'vitest';
import { fingerprint } from './fingerprint.js';

describe('fingerprint', () => {
  it('produce el mismo hash para la misma oferta publicada en dos portales con formato distinto', () => {
    const a = fingerprint('Desarrollador .NET Senior', 'Banco Falabella');
    const b = fingerprint('  desarrollador .net SENIOR ', 'BANCO FALABELLA');
    expect(a).toBe(b);
  });

  it('ignora tildes y signos de puntuación en la comparación', () => {
    const a = fingerprint('Analista Programación C#', 'Fintech-Chile S.A.');
    const b = fingerprint('analista programacion c#', 'fintech chile sa');
    expect(a).toBe(b);
  });

  it('produce hashes distintos para títulos distintos en la misma empresa', () => {
    const a = fingerprint('Desarrollador .NET', 'Acme');
    const b = fingerprint('Desarrollador Java', 'Acme');
    expect(a).not.toBe(b);
  });

  it('produce hashes distintos para la misma oferta en empresas distintas', () => {
    const a = fingerprint('Desarrollador .NET', 'Acme');
    const b = fingerprint('Desarrollador .NET', 'Globant');
    expect(a).not.toBe(b);
  });

  it('acepta empresa null sin colisionar con una empresa de texto vacío distinto de otra oferta', () => {
    const sinEmpresa = fingerprint('Desarrollador .NET', null);
    const conEmpresa = fingerprint('Desarrollador .NET', 'Acme');
    expect(sinEmpresa).not.toBe(conEmpresa);
    expect(fingerprint('Desarrollador .NET', null)).toBe(sinEmpresa);
  });

  it('devuelve un hash hex estable y corto de usar como clave', () => {
    const fp = fingerprint('Dev', 'Acme');
    expect(fp).toMatch(/^[0-9a-f]{16,64}$/);
  });
});
