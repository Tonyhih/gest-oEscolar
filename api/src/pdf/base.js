// Peças comuns aos documentos em PDF (pdfkit, fontes Times, A4).
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';

const INSIGNIA = fileURLToPath(new URL('../../assets/insignia.png', import.meta.url));

export const A4 = { largura: 595.28, altura: 841.89 };

/** Novo documento A4 (retrato ou paisagem) com os metadados. */
export function novoDocumento({ titulo, paisagem = false, margem = 40 }) {
  return new PDFDocument({
    size: 'A4', layout: paisagem ? 'landscape' : 'portrait', margin: margem, bufferPages: true,
    info: { Title: titulo, Author: 'Sistema de Gestão Escolar', Creator: 'Sistema de Gestão Escolar' },
  });
}

/** Junta o PDF num Buffer. */
export function paraBuffer(doc) {
  return new Promise((resolve, reject) => {
    const partes = [];
    doc.on('data', (p) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    doc.end();
  });
}

/**
 * Cabeçalho oficial: insígnia centrada e linhas de texto centradas.
 * @param {Array<{ texto: string, tamanho?: number, negrito?: boolean }>} linhas
 */
export function cabecalho(doc, linhas, { insignia = true, tamanhoInsignia = 46 } = {}) {
  const largura = doc.page.width;
  let y = doc.page.margins.top;
  if (insignia) {
    doc.image(INSIGNIA, (largura - tamanhoInsignia * 1.15) / 2, y, { width: tamanhoInsignia * 1.15 });
    y += tamanhoInsignia + 4;
  }
  for (const l of linhas) {
    doc.font(l.negrito ? 'Times-Bold' : 'Times-Roman').fontSize(l.tamanho ?? 11);
    doc.text(l.texto, doc.page.margins.left, y, { width: largura - doc.page.margins.left - doc.page.margins.right, align: 'center' });
    y = doc.y + (l.espaco ?? 1);
  }
  doc.y = y + 6;
  return doc.y;
}

/**
 * Tabela simples com grelha.
 * @param {object} o
 * @param {Array<{ titulo: string, largura: number, alinhar?: 'left'|'center'|'right' }>} o.colunas
 * @param {Array<Array<string|number|null>>} o.linhas
 * @param {Array<Array<{ texto: string, colunas: number }>>} [o.cabecalhoExtra] linha de cabeçalho agrupada, por cima
 */
export function tabela(doc, { x, y, colunas, linhas, alturaLinha = 15, tamanho = 9, cabecalhoExtra, destacar }) {
  const total = colunas.reduce((s, c) => s + c.largura, 0);
  let cy = y;
  const celula = (texto, cx, largura, { negrito = false, alinhar = 'center', fundo } = {}) => {
    if (fundo) doc.save().rect(cx, cy, largura, alturaLinha).fill(fundo).restore();
    doc.rect(cx, cy, largura, alturaLinha).lineWidth(0.6).stroke('#000');
    doc.font(negrito ? 'Times-Bold' : 'Times-Roman').fontSize(tamanho).fillColor('#000');
    doc.text(texto ?? '', cx + 3, cy + (alturaLinha - tamanho) / 2 - 0.5,
      { width: largura - 6, align: alinhar, lineBreak: false, ellipsis: true, height: alturaLinha });
  };
  for (const grupo of cabecalhoExtra ?? []) {
    let cx = x;
    let i = 0;
    for (const g of grupo) {
      const largura = colunas.slice(i, i + g.colunas).reduce((s, c) => s + c.largura, 0);
      celula(g.texto, cx, largura, { negrito: true, fundo: '#f0f0f0' });
      cx += largura;
      i += g.colunas;
    }
    cy += alturaLinha;
  }
  let cx = x;
  for (const c of colunas) { celula(c.titulo, cx, c.largura, { negrito: true, fundo: '#f0f0f0' }); cx += c.largura; }
  cy += alturaLinha;
  linhas.forEach((linha, li) => {
    if (cy + alturaLinha > doc.page.height - doc.page.margins.bottom - 60) { doc.addPage(); cy = doc.page.margins.top; }
    cx = x;
    colunas.forEach((c, ci) => {
      celula(linha[ci] === null || linha[ci] === undefined ? '' : String(linha[ci]), cx, c.largura,
        { alinhar: c.alinhar ?? 'center', negrito: destacar?.(li, ci) });
      cx += c.largura;
    });
    cy += alturaLinha;
  });
  doc.x = doc.page.margins.left; // o texto seguinte volta à margem esquerda
  doc.y = cy + 8;
  return { largura: total, fim: cy };
}

/** Linhas de assinatura lado a lado: [{ titulo, nome }] */
export function assinaturas(doc, lista, { y = doc.y + 20, larguraLinha = 170 } = {}) {
  const util = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const passo = util / lista.length;
  lista.forEach((a, i) => {
    const cx = doc.page.margins.left + passo * i + (passo - larguraLinha) / 2;
    doc.font('Times-Roman').fontSize(10).text(a.titulo, cx, y, { width: larguraLinha, align: 'center' });
    doc.moveTo(cx, y + 34).lineTo(cx + larguraLinha, y + 34).lineWidth(0.6).stroke();
    if (a.nome) doc.fontSize(9).text(a.nome, cx, y + 38, { width: larguraLinha, align: 'center' });
  });
  doc.y = y + 56;
}

/** Rodapé discreto com a data de emissão, em todas as páginas. */
export function rodape(doc, texto) {
  const intervalo = doc.bufferedPageRange();
  for (let i = intervalo.start; i < intervalo.start + intervalo.count; i += 1) {
    doc.switchToPage(i);
    // Escrever abaixo da margem faria o pdfkit abrir uma página nova: anulamos a margem só para o rodapé
    const margem = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - margem + 12;
    doc.font('Times-Italic').fontSize(7).fillColor('#555')
      .text(texto, doc.page.margins.left, y, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center', lineBreak: false });
    doc.fillColor('#000');
    doc.page.margins.bottom = margem;
  }
}

/** Marca de água diagonal (rascunhos). */
export function marcaDagua(doc, texto) {
  doc.save();
  doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.font('Times-Bold').fontSize(70).fillColor('#d00', 0.12)
    .text(texto, 0, doc.page.height / 2 - 40, { width: doc.page.width, align: 'center' });
  doc.restore();
  doc.fillColor('#000', 1);
}
