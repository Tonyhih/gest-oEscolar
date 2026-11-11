import { describe, it, expect } from 'vitest';
import { inteiroPorExtenso, kwanzasPorExtenso, kwanzas } from '../../src/util/extenso.js';

describe('Valores por extenso (recibos)', () => {
  it('números inteiros', () => {
    expect([1, 15, 21, 100, 101, 115, 200, 999].map(inteiroPorExtenso)).toEqual([
      'um', 'quinze', 'vinte e um', 'cem', 'cento e um', 'cento e quinze', 'duzentos', 'novecentos e noventa e nove']);
    expect(inteiroPorExtenso(1000)).toBe('mil');
    expect(inteiroPorExtenso(1100)).toBe('mil e cem');
    expect(inteiroPorExtenso(1250)).toBe('mil duzentos e cinquenta');
    expect(inteiroPorExtenso(2005)).toBe('dois mil e cinco');
    expect(inteiroPorExtenso(10500)).toBe('dez mil e quinhentos');
    expect(inteiroPorExtenso(25000)).toBe('vinte e cinco mil');
    expect(inteiroPorExtenso(1500000)).toBe('um milhão e quinhentos mil');
    expect(inteiroPorExtenso(2345678)).toBe('dois milhões trezentos e quarenta e cinco mil seiscentos e setenta e oito');
  });
  it('kwanzas e cêntimos', () => {
    expect(kwanzasPorExtenso(1)).toBe('um kwanza');
    expect(kwanzasPorExtenso(10500)).toBe('dez mil e quinhentos kwanzas');
    expect(kwanzasPorExtenso(1000000)).toBe('um milhão de kwanzas');
    expect(kwanzasPorExtenso(150.5)).toBe('cento e cinquenta kwanzas e cinquenta cêntimos');
    expect(kwanzasPorExtenso(0.01)).toBe('um cêntimo');
  });
  it('formato numérico', () => {
    expect(kwanzas(10500)).toBe('10 500,00 Kz');
    expect(kwanzas(1234567.5)).toBe('1 234 567,50 Kz');
  });
});
