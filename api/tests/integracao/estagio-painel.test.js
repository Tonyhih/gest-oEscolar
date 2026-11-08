import { describe, it, expect, beforeAll } from 'vitest';
import { criarContexto, A, B, turmaDe, alunoPorNome } from './contexto.js';

let ctx, t13, zacarias, albertina, quintino;
beforeAll(async () => {
  ctx = await criarContexto();
  t13 = await turmaDe(ctx, 'HBO-201', '13');
  zacarias = await ctx.um(`SELECT e.id FROM estagios e JOIN matriculas m ON m.id = e.matricula_id JOIN alunos a ON a.id = m.aluno_id
                           WHERE a.nome = 'Zacarias Mbumba'`);
  albertina = await ctx.um(`SELECT e.id FROM estagios e JOIN matriculas m ON m.id = e.matricula_id JOIN alunos a ON a.id = m.aluno_id
                            WHERE a.nome = 'Albertina Sakaita'`);
  quintino = await alunoPorNome(ctx, 'Quintino Lussati'); // 10.ª classe
});

describe('Estágio e TFC (RF40–RF43)', () => {
  it('a coordenação lista os estágios do seu curso', async () => {
    const r = await ctx.como(B.coordenador).get('/estagios');
    expect(r.status).toBe(200);
    expect(r.body.map((e) => [e.aluno.nome, e.cursoConcluido])).toEqual([['Albertina Sakaita', false], ['Zacarias Mbumba', true]]);
    expect(r.body[1].tfc).toMatchObject({ tema: 'Sistema de inventário para uma escola', nota: 14 });
  });

  it('só há estágio na 13.ª classe, e um por matrícula', async () => {
    const r = await ctx.como(B.secretaria).post('/estagios').send({ matricula: quintino.matricula, entidade: 'Empresa X', inicio: '2026-10-01' });
    expect(r.status).toBe(422);
    const z = await alunoPorNome(ctx, 'Zacarias Mbumba');
    expect((await ctx.como(B.secretaria).post('/estagios').send({ matricula: z.matricula, entidade: 'Outra', inicio: '2026-10-01' })).status).toBe(409);
  });

  it('a secretaria regista o estágio de um aluno novo da 13.ª', async () => {
    const aluno = await ctx.como(B.secretaria).post('/alunos').send({ nome: 'Bernardo Novo', dataNascimento: '2007-03-03', sexo: 'M' });
    const m = await ctx.como(B.secretaria).post('/matriculas').send({ aluno: aluno.body.id, turma: t13 });
    expect(m.status).toBe(201);
    const fimAntes = await ctx.como(B.secretaria).post('/estagios')
      .send({ matricula: m.body.id, entidade: 'Empresa Fictícia, Lda.', inicio: '2026-10-01', fim: '2026-09-01' });
    expect(fimAntes.status).toBe(422);
    const r = await ctx.como(B.secretaria).post('/estagios').send({ matricula: m.body.id, entidade: 'Empresa Fictícia, Lda.', inicio: '2026-10-01' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ estado: 'a_decorrer', nota: null, cursoConcluido: false, inicio: '2026-10-01' });
  });

  it('a nota do estágio é da coordenação; a secretaria não a lança', async () => {
    expect((await ctx.como(B.secretaria).patch(`/estagios/${albertina.id}`).send({ nota: 12 })).status).toBe(403);
    const r = await ctx.como(B.coordenador).patch(`/estagios/${albertina.id}`).send({ nota: 9, estado: 'concluido', fim: '2027-03-30' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ nota: 9, estado: 'concluido', fim: '2027-03-30' });
  });

  it('RF43: a nota do TFC exige a data da defesa; o curso só fica concluído com os dois ≥ 10', async () => {
    const semData = await ctx.como(B.coordenador).patch(`/estagios/${albertina.id}/tfc`).send({ tema: 'Rede escolar', nota: 15 });
    expect(semData.status).toBe(422);
    // O pedido recusado não grava nada (nem o tema)
    expect((await ctx.como(B.coordenador).get('/estagios')).body.find((e) => e.id === albertina.id).tfc.tema).toBeNull();
    const r = await ctx.como(B.coordenador).patch(`/estagios/${albertina.id}/tfc`).send({ tema: 'Rede escolar', dataDefesa: '2027-06-21', nota: 15 });
    expect(r.body).toMatchObject({ nota: 9, cursoConcluido: false, tfc: { nota: 15, dataDefesa: '2027-06-21', tema: 'Rede escolar' } });
    const ok = await ctx.como(B.coordenador).patch(`/estagios/${albertina.id}`).send({ nota: 11 });
    expect(ok.body.cursoConcluido).toBe(true);
    expect((await ctx.como(B.secretaria).patch(`/estagios/${albertina.id}/tfc`).send({ nota: 12 })).status).toBe(403);
  });

  it('outra escola não vê nem altera estes estágios', async () => {
    expect((await ctx.como(A.director).get('/estagios')).body).toEqual([]);
    expect((await ctx.como(A.director).patch(`/estagios/${zacarias.id}`).send({ nota: 20 })).status).toBe(404);
  });
});

describe('Painel do director (RF38)', () => {
  it('mostra os totais e a transição por classe, com as mesmas regras da pauta', async () => {
    const r = await ctx.como(A.director).get('/painel');
    expect(r.status).toBe(200);
    expect(r.body.anoLectivo.designacao).toBe('2026/2027');
    expect(r.body.totais).toMatchObject({ alunos: 15, turmas: 4, professores: 2 });
    const porClasse = Object.fromEntries(r.body.aprovacaoPorClasse.map((c) => [c.classe, c]));
    expect(porClasse['7.ª classe']).toMatchObject({ total: 5, transitam: 3, naoTransitam: 2, pendentes: 0, percentagem: 60 });
    expect(porClasse['9.ª classe']).toMatchObject({ total: 4, transitam: 2, naoTransitam: 1, pendentes: 1, percentagem: 66.7 });
    expect(porClasse).not.toHaveProperty('Iniciação'); // a Iniciação não tem transição por notas
    expect(r.body.alunosPorClasse).toContainEqual({ classe: '7.ª classe', turno: 'tarde', total: 5 });
    expect(JSON.stringify(r.body)).not.toContain('Graça'); // só números agregados
  });

  it('na 13.ª classe conta o curso concluído (estágio e TFC)', async () => {
    const r = await ctx.como(B.director).get('/painel');
    const c13 = r.body.aprovacaoPorClasse.find((c) => c.classe.startsWith('13.ª'));
    expect(c13).toMatchObject({ transitam: 2, pendentes: 1 }); // Zacarias e Albertina concluíram; o aluno novo está pendente
  });

  it('só o director vê o painel', async () => {
    expect((await ctx.como(A.adao).get('/painel')).status).toBe(403);
    expect((await ctx.como(A.secretaria).get('/painel')).status).toBe(403);
  });
});
