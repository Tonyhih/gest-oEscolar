import { describe, it, expect } from 'vitest';
import { decidirTransicao } from '../../src/services/avaliacao.js';

const normal20 = { notaMinimaAprovacao: 10, minimoNegativa: 7, maxNegativas: 2, classeDeExame: false };
const normal10 = { notaMinimaAprovacao: 5, minimoNegativa: 3.5, maxNegativas: 2, classeDeExame: false };
const exame20 = { ...normal20, classeDeExame: true };
const r = (notaFinal, chave = false) => ({ notaFinal, chave });

describe('decidirTransicao – classes normais', () => {
  it('RN13: duas negativas (9 e 8) fora das disciplinas-chave → transita', () => {
    expect(decidirTransicao(normal20, [r(12), r(9), r(8), r(14, true)]).situacao).toBe('transita');
  });
  it('RN13: uma negativa de 7 → não transita', () => {
    expect(decidirTransicao(normal20, [r(12), r(7)]).situacao).toBe('nao_transita');
  });
  it('RN13: três negativas → não transita', () => {
    expect(decidirTransicao(normal20, [r(9), r(9), r(9), r(12)]).situacao).toBe('nao_transita');
  });
  it('RN14: escala 0–10, negativas de 4 → transita; de 3 → não transita', () => {
    expect(decidirTransicao(normal10, [r(4), r(4), r(6)]).situacao).toBe('transita');
    expect(decidirTransicao(normal10, [r(3), r(6)]).situacao).toBe('nao_transita');
  });
  it('RN15: negativa numa disciplina-chave → não transita', () => {
    const d = decidirTransicao(normal20, [r(9, true), r(12)]);
    expect(d.situacao).toBe('nao_transita');
    expect(d.motivos).toContain('Negativa numa disciplina-chave.');
  });
  it('nota final em falta → pendente', () => {
    expect(decidirTransicao(normal20, [r(12), r(null)]).situacao).toBe('pendente');
  });
});

describe('decidirTransicao – classes de exame', () => {
  it('RN17: todas positivas → transita', () => {
    expect(decidirTransicao(exame20, [r(10), r(11), r(15, true)]).situacao).toBe('transita');
  });
  it('RN17: uma única negativa de 9, não-chave → não transita', () => {
    expect(decidirTransicao(exame20, [r(9), r(12), r(12)]).situacao).toBe('nao_transita');
  });
});
