// Desenho de cada documento. Recebem dados já preparados (src/services/documentos.js) e devolvem um Buffer PDF.
import { assinaturas, cabecalho, marcaDagua, novoDocumento, paraBuffer, rodape, tabela } from './base.js';
import { dataCurta, nota, partesData, porExtenso } from '../util/extenso.js';

const SITUACOES = { transita: 'Transita', nao_transita: 'Não transita', pendente: 'Pendente', concluido: 'Concluído' };
const emitidoEm = (d) => `Emitido pelo Sistema de Gestão Escolar em ${dataCurta(d.hoje)}.`;

/** Cabeçalho das escolas: República, Governo da Província e nome da escola (como no termo). */
const cabecalhoEscola = (doc, escola) => cabecalho(doc, [
  { texto: 'REPÚBLICA DE ANGOLA', negrito: true, tamanho: 10 },
  { texto: `GOVERNO DA PROVÍNCIA ${escola.provincia ? `DE ${escola.provincia.toUpperCase()}` : ''}`.trim(), negrito: true, tamanho: 10 },
  { texto: escola.nome.toUpperCase(), negrito: true, tamanho: 10 },
], { tamanhoInsignia: 34 });

function linhaInfo(doc, pares, y) {
  const util = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const passo = util / pares.length;
  pares.forEach(([rotulo, valor], i) => {
    doc.font('Times-Bold').fontSize(10).text(`${rotulo}: `, doc.page.margins.left + passo * i, y, { continued: true });
    doc.font('Times-Roman').text(valor || '—');
  });
  doc.y = y + 16;
}

// ======================================================================
// Mini-pauta: uma disciplina, uma turma, um trimestre
// ======================================================================
export function miniPauta(d) {
  const doc = novoDocumento({ titulo: `Mini-pauta ${d.disciplina.sigla} ${d.turma} ${d.trimestre}.º trimestre` });
  cabecalhoEscola(doc, d.escola);
  doc.font('Times-Bold').fontSize(13).text(`MINI-PAUTA DO ${d.trimestre}.º TRIMESTRE`, { align: 'center' });
  doc.moveDown(0.4);
  linhaInfo(doc, [['Ano lectivo', d.anoLectivo], ['Turma', d.turma], ['Turno', d.turno]], doc.y);
  linhaInfo(doc, [['Disciplina', d.disciplina.nome], ['Professor(a)', d.professor]], doc.y);
  tabela(doc, {
    x: doc.page.margins.left, y: doc.y + 4,
    colunas: [
      { titulo: 'N.º', largura: 28 }, { titulo: 'Nome do aluno', largura: 215, alinhar: 'left' },
      { titulo: 'MAC', largura: 42 }, { titulo: 'NPP', largura: 42 }, { titulo: 'NPT', largura: 42 },
      { titulo: 'MT', largura: 42 }, { titulo: 'Faltas', largura: 42 }, { titulo: 'Obs.', largura: 62 },
    ],
    linhas: d.linhas.map((l, i) => [i + 1, l.nome, nota(l.mac), nota(l.npp), nota(l.npt), nota(l.mt), l.faltas || '',
      l.mt === null ? '' : l.mt < d.notaMinima ? 'Negativa' : '']),
    destacar: (li, ci) => ci === 5 && d.linhas[li].mt !== null && d.linhas[li].mt < d.notaMinima,
  });
  doc.font('Times-Roman').fontSize(8)
    .text(`MAC – média das avaliações contínuas · NPP – nota da prova do professor · NPT – nota da prova trimestral · MT = (MAC + NPP + NPT) / 3 · escala 0–${d.escala}`);
  assinaturas(doc, [{ titulo: 'O(A) Professor(a)', nome: d.professor }, { titulo: 'O(A) Director(a) de Turma', nome: d.directorTurma }]);
  rodape(doc, emitidoEm(d));
  return paraBuffer(doc);
}

// ======================================================================
// Pauta trimestral ou final da turma
// ======================================================================
export function pauta(d) {
  const doc = novoDocumento({ titulo: `Pauta ${d.final ? 'final' : `${d.trimestre}.º trimestre`} ${d.turma}`, paisagem: true, margem: 30 });
  cabecalhoEscola(doc, d.escola);
  doc.font('Times-Bold').fontSize(13).text(d.final ? 'PAUTA FINAL' : `PAUTA DO ${d.trimestre}.º TRIMESTRE`, { align: 'center' });
  doc.moveDown(0.3);
  linhaInfo(doc, [['Ano lectivo', d.anoLectivo], ['Turma', d.turma], ['Turno', d.turno], ['Alunos', String(d.linhas.length)]], doc.y);

  const util = doc.page.width - 60;
  const fixas = 24 + 180 + 34 + (d.final ? 72 : 0);
  const larguraDisc = Math.max(30, Math.min(52, (util - fixas) / Math.max(d.disciplinas.length, 1)));
  tabela(doc, {
    x: 30, y: doc.y + 2, tamanho: 8.5,
    colunas: [
      { titulo: 'N.º', largura: 24 }, { titulo: 'Nome do aluno', largura: 180, alinhar: 'left' },
      ...d.disciplinas.map((s) => ({ titulo: s.chave ? `${s.sigla}*` : s.sigla, largura: larguraDisc })),
      { titulo: 'Neg.', largura: 34 }, ...(d.final ? [{ titulo: 'Situação', largura: 72 }] : []),
    ],
    linhas: d.linhas.map((l, i) => [i + 1, l.nome, ...d.disciplinas.map((s) => (d.final ? nota(l.notas[s.sigla], 0) : nota(l.notas[s.sigla]))),
      l.negativas, ...(d.final ? [SITUACOES[l.situacao] ?? ''] : [])]),
    destacar: (li, ci) => {
      const s = d.disciplinas[ci - 2];
      const v = s && d.linhas[li].notas[s.sigla];
      return v !== null && v !== undefined && v < d.notaMinima;
    },
  });
  const nota1 = d.disciplinas.some((s) => s.chave) ? '* Disciplina-chave. ' : '';
  const regra = d.final
    ? (d.classeDeExame ? 'Classe de exame: CF = MFD × 40% + exame × 60%; transita só com todas as disciplinas positivas.'
      : 'Nota final = média das três MT, arredondada à unidade.')
    : 'MT = (MAC + NPP + NPT) / 3.';
  doc.font('Times-Roman').fontSize(8).text(`${nota1}${regra} As negativas estão a negrito.`, 30);
  if (d.final) {
    const c = d.linhas.reduce((a, l) => ({ ...a, [l.situacao]: (a[l.situacao] ?? 0) + 1 }), {});
    doc.text(`Transitam: ${(c.transita ?? 0) + (c.concluido ?? 0)} · Não transitam: ${c.nao_transita ?? 0} · Pendentes: ${c.pendente ?? 0}`, 30);
  }
  assinaturas(doc, [{ titulo: 'O(A) Director(a) de Turma', nome: d.directorTurma }, { titulo: 'O(A) Director(a) da Escola', nome: d.escola.director }]);
  rodape(doc, emitidoEm(d));
  return paraBuffer(doc);
}

// ======================================================================
// Termo de frequência e aproveitamento (modelo da escola, A4 paisagem, dois anos lado a lado)
// ======================================================================
export function termo(d) {
  const doc = novoDocumento({ titulo: `Termo de frequência e aproveitamento ${d.aluno.nome}`, paisagem: true, margem: 28 });
  cabecalhoEscola(doc, d.escola);
  const esq = 28;
  const larg = doc.page.width - 56;
  let y = doc.y;
  doc.font('Times-Roman').fontSize(10).text('DIRECTOR(A) DA ESCOLA', esq + 20, y);
  doc.text(`PROCESSO N.º ${d.aluno.numeroProcesso}`, esq, y, { width: larg - 20, align: 'right' });
  doc.text(d.escola.director ?? '', esq + 20, y + 16);

  // Caixa da fotografia
  const foto = { x: esq + larg - 80, y: y + 18, w: 72, h: 86 };
  doc.rect(foto.x, foto.y, foto.w, foto.h).lineWidth(0.6).stroke();
  doc.fontSize(7).fillColor('#777').text('Fotografia', foto.x, foto.y + foto.h / 2 - 4, { width: foto.w, align: 'center' }).fillColor('#000');

  y += 40;
  const a = d.aluno;
  const linhas = [
    ['Nome', a.nome],
    ['Filiação', [a.nomePai, a.nomeMae].filter(Boolean).join(' e de ') || ''],
    ['Nascido(a) aos', `${dataCurta(a.dataNascimento)}   Município: ${a.municipioNaturalidade ?? ''}   Província: ${a.provinciaNaturalidade ?? ''}`],
    ['Encarregado de Educação', `${d.encarregado?.nome ?? ''}   Morada: ${a.morada ?? ''}   Telefone: ${d.encarregado?.telefone ?? a.telefone ?? ''}`],
  ];
  for (const [r, v] of linhas) {
    doc.font('Times-Bold').fontSize(10).text(`${r}: `, esq, y, { continued: true, width: larg - 100 });
    doc.font('Times-Roman').text(v);
    y += 15;
  }
  y = Math.max(y, foto.y + foto.h) + 6;
  doc.font('Times-Bold').fontSize(13).text('TERMO DE FREQUÊNCIA E APROVEITAMENTO', esq, y, { width: larg, align: 'center' });
  y += 22;

  const metade = (larg - 20) / 2;
  d.anos.forEach((ano, i) => {
    const x = esq + i * (metade + 20);
    doc.font('Times-Roman').fontSize(9.5)
      .text(`ANO LECTIVO ${ano?.anoLectivo ?? '20____/____'}`, x, y)
      .text(`CLASSE ${ano?.classe ?? '____'}   TURMA ${ano?.turma ?? '____'}   N.º ${ano?.numero ?? '____'}`, x, y + 13);
    doc.font('Times-Bold').fontSize(10).text('CLASSIFICAÇÃO', x, y + 28, { width: metade, align: 'center' });
    const disciplinas = ano?.disciplinas ?? d.disciplinasVazias;
    const r = tabela(doc, {
      x, y: y + 42, tamanho: 7.5, alturaLinha: 13,
      colunas: [
        { titulo: 'Disciplinas', largura: 92, alinhar: 'left' },
        { titulo: 'Ct 1', largura: 24 }, { titulo: 'F', largura: 16 }, { titulo: 'Ct 2', largura: 24 }, { titulo: 'F', largura: 16 },
        { titulo: 'Ct 3', largura: 24 }, { titulo: 'F', largura: 16 }, { titulo: 'CAP', largura: 26 }, { titulo: 'CPE', largura: 26 },
        { titulo: 'CF', largura: 24 }, { titulo: 'OBS', largura: metade - 288 },
      ],
      linhas: disciplinas.map((s) => [s.nome, nota(s.ct[0]), s.f[0] || '', nota(s.ct[1]), s.f[1] || '', nota(s.ct[2]), s.f[2] || '',
        nota(s.cap), nota(s.cpe), nota(s.cf, 0), s.obs ?? '']),
    });
    if (ano?.situacao) doc.font('Times-Bold').fontSize(9).text(`Resultado: ${SITUACOES[ano.situacao]}`, x, r.fim + 4);
    doc.font('Times-Roman').fontSize(9.5).text('O DIRECTOR DE TURMA', x, r.fim + 20, { width: metade, align: 'center' });
    doc.moveTo(x + metade / 2 - 85, r.fim + 50).lineTo(x + metade / 2 + 85, r.fim + 50).lineWidth(0.6).stroke();
    if (ano?.directorTurma) doc.fontSize(8.5).text(ano.directorTurma, x, r.fim + 53, { width: metade, align: 'center' });
  });
  doc.font('Times-Roman').fontSize(7).text('Ct – classificação trimestral · F – faltas · CAP – classificação anual · CPE – classificação da prova de exame · CF – classificação final',
    esq, doc.page.height - 48, { width: larg, align: 'center' });
  rodape(doc, emitidoEm(d));
  return paraBuffer(doc);
}

// ======================================================================
// Certificado (modelos do MED: Ensino Primário e I Ciclo do Ensino Secundário)
// ======================================================================
const LACUNA = '____________________';
const ou = (v, lacuna = LACUNA) => (v === null || v === undefined || v === '' ? lacuna : v);

export function certificado(d) {
  const doc = novoDocumento({ titulo: `Certificado ${d.numeroTexto} ${d.aluno.nome}`, margem: 50 });
  if (d.rascunho) marcaDagua(doc, 'RASCUNHO');
  cabecalho(doc, [
    { texto: 'REPÚBLICA DE ANGOLA', tamanho: 14 },
    { texto: 'MINISTÉRIO DA EDUCAÇÃO', tamanho: 14, espaco: 4 },
    { texto: d.ciclo === 'primario' ? 'ENSINO PRIMÁRIO' : 'I Ciclo do Ensino Secundário', negrito: true, tamanho: 13, espaco: 8 },
    { texto: 'CERTIFICADO', negrito: true, tamanho: 18 },
  ], { tamanhoInsignia: 50 });

  // Caixa do número
  const larg = doc.page.width - 100;
  const caixa = { x: 50 + larg - 170, y: doc.y - 4, w: 170, h: 20 };
  doc.rect(caixa.x, caixa.y, caixa.w, caixa.h).lineWidth(1.2).stroke();
  doc.font('Times-Bold').fontSize(11).text(`N.º ${d.numeroTexto}`, caixa.x + 6, caixa.y + 5, { width: caixa.w - 12 });
  doc.y = caixa.y + caixa.h + 10;

  const a = d.aluno;
  const e = d.escola;
  // Se o nome já diz o tipo de escola ("Complexo Escolar…", "Escola…"), não o repetimos
  const temTipo = /^(col[eé]gio|complexo|escola|instituto|liceu)/i.test(e.nome);
  const feminino = /^escola/i.test(e.nome);
  const tipoEscola = temTipo ? (feminino ? 'da' : 'do')
    : (d.ciclo === 'primario' ? 'da Escola Primária/Complexo Escolar' : 'do Colégio/Complexo Escolar');
  const criada = (temTipo ? feminino : d.ciclo === 'primario') ? 'criada' : 'criado';
  const nomeCiclo = d.ciclo === 'primario' ? 'ENSINO PRIMÁRIO' : 'I CICLO DO ENSINO SECUNDÁRIO GERAL';
  const alinea = d.ciclo === 'primario' ? 'b)' : 'c)';
  const texto = [
    `${ou(e.director)}, Director(a) ${tipoEscola} ${e.nome}, ${criada} sob o Decreto Executivo n.º ${ou(e.decretoCriacao, '______/______')}, `,
    `certifica que ${a.nome}, filho(a) de ${ou(a.nomePai)} e de ${ou(a.nomeMae)}, nascido(a) aos ${dataCurta(a.dataNascimento)}, `,
    `natural de ${ou(a.naturalidade)}, Município de ${ou(a.municipioNaturalidade)}, Província de ${ou(a.provinciaNaturalidade)}, `,
    `portador(a) do B.I./Passaporte n.º ${ou(a.documentoNumero)}, passado pelo arquivo de Identificação de ${ou(a.documentoEmissaoLocal)} `,
    `aos ${a.documentoEmissaoData ? dataCurta(a.documentoEmissaoData) : '____/____/______'}, concluiu no ano lectivo ${ou(d.anoConclusao, '________')} o `,
  ].join('');
  doc.font('Times-Roman').fontSize(11.5).text(texto, 50, doc.y, { width: larg, align: 'justify', continued: true, lineGap: 2.5 })
    .font('Times-Bold').text(nomeCiclo, { continued: true })
    .font('Times-Roman').text(`, conforme o disposto na alínea ${alinea} do artigo 109.º da LBSEE n.º 17/16, de 7 de Outubro, com a Média Final de `, { continued: true })
    .font('Times-Bold').text(`${ou(d.mediaGeral, '___')} (${porExtenso(d.mediaGeral) || '__________'}) `, { continued: true })
    .font('Times-Roman').text('valores, obtida nas seguintes classificações por ciclos de aprendizagem:');

  doc.moveDown(0.6);
  const colsClasse = d.classes.map((c) => ({
    titulo: d.ciclo === 'primario' ? `${c.codigo}.ª Classe` : `${c.codigo}.ª`, largura: d.ciclo === 'primario' ? 58 : 44 }));
  const larguraNome = d.ciclo === 'primario' ? 170 : 180;
  const larguraMedia = larg - larguraNome - colsClasse.reduce((s, c) => s + c.largura, 0);
  const r = tabela(doc, {
    x: 50, y: doc.y, tamanho: 10.5, alturaLinha: 17,
    cabecalhoExtra: d.ciclo === 'primario'
      ? [[{ texto: '', colunas: 1 }, { texto: 'I Ciclo', colunas: 1 }, { texto: 'II Ciclo', colunas: 1 }, { texto: 'III Ciclo', colunas: 1 }, { texto: '', colunas: 1 }]]
      : undefined,
    colunas: [{ titulo: 'Disciplinas', largura: larguraNome, alinhar: 'left' }, ...colsClasse,
      { titulo: 'Média Final (Extenso)', largura: larguraMedia }],
    linhas: [
      ...d.disciplinas.map((s) => [s.nome, ...s.notas.map((v) => nota(v, 0)),
        s.media === null ? '(                    )' : `${s.media} (${porExtenso(s.media)})`]),
      ['MÉDIA GERAL', ...d.classes.map(() => ''), d.mediaGeral === null ? '(                    )' : `${d.mediaGeral} (${porExtenso(d.mediaGeral)})`],
    ],
    destacar: (li) => li === d.disciplinas.length,
  });

  doc.y = r.fim + 14;
  doc.font('Times-Roman').fontSize(11.5).text(
    `Para efeitos legais lhe é passado o presente CERTIFICADO, conforme consta do processo individual n.º ${a.numeroProcesso} `
    + `e do livro de registo n.º ${ou(d.livroRegisto, '__________')}, assinado por mim e autenticado com carimbo a óleo/selo branco `
    + 'em uso neste estabelecimento de ensino.', 50, doc.y, { align: 'justify', width: larg, lineGap: 2.5 });
  doc.moveDown(0.8);
  if (e.privada) doc.text(`${e.nome}`, { width: larg });
  const p = partesData(d.dataEmissao);
  doc.text(`${ou(e.municipio, '__________')}, aos ${p.dia} de ${p.mes} de ${p.ano}.`, { width: larg });
  assinaturas(doc, [{ titulo: 'Conferido por', nome: d.conferidoPor }, { titulo: 'O(A) Director(a)', nome: e.director }],
    { y: doc.y + 16, larguraLinha: 180 });
  rodape(doc, `${d.rascunho ? 'RASCUNHO sem valor legal. ' : ''}Documento n.º ${d.numeroTexto} emitido pelo Sistema de Gestão Escolar em ${dataCurta(d.dataEmissao)}. `
    + 'Válido só com a assinatura do(a) Director(a) e o carimbo a óleo/selo branco da escola.');
  return paraBuffer(doc);
}
