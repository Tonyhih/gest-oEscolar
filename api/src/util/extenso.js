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
