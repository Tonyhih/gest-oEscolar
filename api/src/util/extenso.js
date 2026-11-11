// Números por extenso para as classificações (0 a 20, com uma casa decimal), em português de Angola.

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove', 'vinte'];

/** 12 → "doze"; 9.5 → "nove vírgula cinco"; null → "" */
export function porExtenso(valor) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return '';
  const v = Math.round(Number(valor) * 10) / 10;
  if (v < 0 || v > 20) throw new Error(`Valor fora de 0–20: ${valor}`);
  const inteiro = Math.trunc(v);
  const decimal = Math.round((v - inteiro) * 10);
  return decimal ? `${UNIDADES[inteiro]} vírgula ${UNIDADES[decimal]}` : UNIDADES[inteiro];
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro',
  'Outubro', 'Novembro', 'Dezembro'];

/** '2026-11-08' → { dia: '8', mes: 'Novembro', ano: '2026' } */
export function partesData(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return { dia: String(Number(d)), mes: MESES[Number(m) - 1], ano: a };
}

/** '2013-04-04' → '04/04/2013' */
export const dataCurta = (iso) => {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

/** Número com vírgula decimal: 9.5 → "9,5"; 12 → "12" */
export const nota = (v, casas = 1) => {
  if (v === null || v === undefined) return '';
  const n = Math.round(Number(v) * 10 ** casas) / 10 ** casas;
  return String(n).replace('.', ',');
};

// ======================================================================
// Valores em Kwanzas por extenso (recibos): 10500 → "dez mil e quinhentos kwanzas"
// ======================================================================

const UNID = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
  'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** 0 < n < 1000 */
function centenas(n) {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes = [];
  if (c) partes.push(CEM[c]);
  if (r) partes.push(r < 20 ? UNID[r] : DEZ[Math.floor(r / 10)] + (r % 10 ? ` e ${UNID[r % 10]}` : ''));
  return partes.join(' e ');
}

/** Inteiro por extenso (até 999 999 999). */
export function inteiroPorExtenso(n) {
  if (n === 0) return 'zero';
  const grupos = [
    [Math.floor(n / 1e6), (g) => (g === 1 ? 'um milhão' : `${centenas(g)} milhões`)],
    [Math.floor((n % 1e6) / 1000), (g) => (g === 1 ? 'mil' : `${centenas(g)} mil`)],
    [n % 1000, (g) => centenas(g)],
  ].filter(([g]) => g > 0);
  // Regra do "e": antes do último grupo, se for inferior a 100 ou um número redondo de centenas
  return grupos.map(([g, f], i) => {
    const texto = f(g);
    if (i === 0) return texto;
    const ultimo = i === grupos.length - 1;
    return (ultimo && (g < 100 || g % 100 === 0) ? ' e ' : ' ') + texto;
  }).join('');
}

/** 10500.5 → "dez mil e quinhentos kwanzas e cinquenta cêntimos" */
export function kwanzasPorExtenso(valor) {
  const total = Math.round(Number(valor) * 100);
  const kz = Math.floor(total / 100);
  const ct = total % 100;
  const partes = [];
  if (kz || !ct) {
    const palavra = kz === 1 ? 'kwanza' : 'kwanzas';
    partes.push(`${inteiroPorExtenso(kz)}${kz >= 1e6 && kz % 1e6 === 0 ? ' de' : ''} ${palavra}`);
  }
  if (ct) partes.push(`${inteiroPorExtenso(ct)} ${ct === 1 ? 'cêntimo' : 'cêntimos'}`);
  return partes.join(' e ');
}

/** 10500 → "10 500,00 Kz" */
export const kwanzas = (valor) => `${Number(valor).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }).replace(/ | /g, ' ')} Kz`;
