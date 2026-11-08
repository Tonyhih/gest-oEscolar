import { describe, it, expect } from 'vitest';
import { lerData, lerLista, exemploDeTeste } from '@/util/importacao.js';

describe('lerData', () => {
  it('aceita dd/mm/aaaa, d-m-aaaa e aaaa-mm-dd', () => {
    expect(lerData('15/06/2012')).toBe('2012-06-15');
    expect(lerData('5-6-2012')).toBe('2012-06-05');
    expect(lerData('2012-06-15')).toBe('2012-06-15');
  });
  it('recusa datas impossíveis', () => {
    expect(lerData('31/02/2012')).toBeNull();
    expect(lerData('ontem')).toBeNull();
  });
});

describe('lerLista', () => {
  it('lê ponto e vírgula, tabulações (Excel) e vírgulas, e ignora o cabeçalho', () => {
    const l = lerLista('Nome;Nascimento;Sexo\nAna Paulo; 01/02/2013; F\nBruno Kiala\t02/03/2013\tMasculino\nCarla Ngola, 2013-04-05, f');
    expect(l.map((x) => [x.nome, x.dataNascimento, x.sexo, x.erros.length])).toEqual([
      ['Ana Paulo', '2013-02-01', 'F', 0],
      ['Bruno Kiala', '2013-03-02', 'M', 0],
      ['Carla Ngola', '2013-04-05', 'F', 0],
    ]);
  });
  it('indica os erros de cada linha', () => {
    const [l] = lerLista('Zé; 31/02/2013; X; Mãe');
    expect(l.erros).toEqual(['nome em falta', 'data de nascimento inválida (use dd/mm/aaaa)', 'sexo inválido (M ou F)',
      'encarregado: indique o nome e um telefone válido']);
  });
  it('o exemplo de teste tem 10 alunos válidos, com encarregado', () => {
    const l = lerLista(exemploDeTeste());
    expect(l).toHaveLength(10);
    expect(l.every((x) => x.erros.length === 0 && x.encarregadoNome && x.nome.endsWith('(teste)'))).toBe(true);
  });
});
