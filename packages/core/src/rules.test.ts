import { describe, expect, it } from 'vitest';
import { applyRules } from './rules.js';

function job(title: string, description = '') {
  return { title, description };
}

describe('applyRules', () => {
  it('deja pasar una oferta .NET detectada en el título', () => {
    const verdict = applyRules(job('Desarrollador .NET Senior'));
    expect(verdict.passed).toBe(true);
    expect(verdict.matched).toContain('.net');
  });

  it('deja pasar una oferta cuyo stack solo aparece en la descripción', () => {
    const verdict = applyRules(
      job('Ingeniero de Software', 'Requisitos: React, Node.js y TypeScript'),
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.matched).toEqual(expect.arrayContaining(['react', 'node']));
  });

  it('descarta ofertas sin ningún keyword técnico', () => {
    const verdict = applyRules(
      job(
        'Vendedor Terreno',
        'Buscamos vendedor para retail con experiencia en atención al cliente',
      ),
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.matched).toEqual([]);
  });

  it('matchea sin distinguir mayúsculas ni tildes', () => {
    const verdict = applyRules(job('PROGRAMADOR C# / SQL SERVER'));
    expect(verdict.passed).toBe(true);
    expect(verdict.matched).toEqual(expect.arrayContaining(['c#', 'sql server']));
  });

  it('no confunde ".net" con la palabra "internet"', () => {
    const verdict = applyRules(job('Community Manager', 'Gestión de campañas en internet y redes'));
    expect(verdict.passed).toBe(false);
  });

  it('no reporta el mismo keyword dos veces aunque aparezca repetido', () => {
    const verdict = applyRules(
      job('Desarrollador C#', 'Dominio de C# avanzado. C# es excluyente.'),
    );
    expect(verdict.matched.filter((k) => k === 'c#')).toHaveLength(1);
  });
});
