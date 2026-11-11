// Formatação para Angola: vírgula decimal e datas dd/mm/aaaa (RNF10).

const numero1 = new Intl.NumberFormat('pt-AO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Nota com 1 casa decimal (MT), ou travessão se não houver. */
export const nota1 = (v) => (v === null || v === undefined ? '—' : numero1.format(v));

/** Nota inteira (nota final), ou travessão. */
export const notaInteira = (v) => (v === null || v === undefined ? '—' : String(v));

/** 'aaaa-mm-dd' ou Date → 'dd/mm/aaaa' */
export function data(v) {
  if (!v) return '—';
  const s = typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);
  const [a, m, d] = s.split('-');
  return `${d}/${m}/${a}`;
}

/** Data e hora local, ex.: 08/11/2026 14:05 */
export function dataHora(v) {
  if (!v) return '—';
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const TURNOS = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
export const SITUACOES = {
  transita: { texto: 'Transita', classe: 'text-bg-success' },
  nao_transita: { texto: 'Não transita', classe: 'text-bg-danger' },
  pendente: { texto: 'Pendente', classe: 'text-bg-secondary' },
  concluido: { texto: 'Concluído', classe: 'text-bg-success' },
};

/** Converte um texto do utilizador ("12,5") em número; '' → null. */
export function lerNota(texto) {
  if (texto === null || texto === undefined || String(texto).trim() === '') return null;
  const n = Number(String(texto).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

const moeda = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
/** Valor em Kwanzas: 10500 → '10 500,00 Kz' */
export const kz = (v) => `${moeda.format(Number(v ?? 0)).replace(/ | /g, ' ')} Kz`;
export const METODOS = { numerario: 'Numerário', transferencia: 'Transferência', multicaixa: 'Multicaixa Express', deposito: 'Depósito', outro: 'Outro' };
