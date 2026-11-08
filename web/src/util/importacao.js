// Lê a lista de alunos colada pela secretaria (do Excel, de um CSV ou escrita à mão).
// Uma linha por aluno: Nome; Data de nascimento; Sexo; Encarregado; Telefone do encarregado
// Separadores aceites: ponto e vírgula, tabulação (cópia do Excel) ou vírgula.

function separador(linha) {
  if (linha.includes(';')) return ';';
  if (linha.includes('\t')) return '\t';
  return ',';
}

/** 'dd/mm/aaaa', 'd-m-aaaa' ou 'aaaa-mm-dd' → 'aaaa-mm-dd' (ou null se for inválida). */
export function lerData(texto) {
  const t = String(texto ?? '').trim();
  let a, m, d;
  let r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) [, a, m, d] = r;
  else if ((r = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [, d, m, a] = r;
  else return null;
  const data = new Date(Date.UTC(+a, +m - 1, +d));
  if (data.getUTCFullYear() !== +a || data.getUTCMonth() !== +m - 1 || data.getUTCDate() !== +d) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function lerSexo(texto) {
  const t = String(texto ?? '').trim().toUpperCase();
  if (['M', 'MASCULINO', 'H', 'HOMEM'].includes(t)) return 'M';
  if (['F', 'FEMININO', 'MULHER'].includes(t)) return 'F';
  return null;
}

/**
 * @returns {{ linha: number, nome: string, dataNascimento: string|null, sexo: string|null,
 *             encarregadoNome?: string, encarregadoTelefone?: string, erros: string[] }[]}
 */
export function lerLista(texto) {
  return String(texto ?? '')
    .split(/\r?\n/)
    .map((l, i) => ({ texto: l.trim(), linha: i + 1 }))
    .filter((l) => l.texto && !/^nome\b/i.test(l.texto)) // ignora linhas vazias e o cabeçalho
    .map(({ texto: l, linha }) => {
      const [nome = '', nasc = '', sexo = '', ee = '', tel = ''] = l.split(separador(l)).map((c) => c.trim());
      const r = { linha, nome, dataNascimento: lerData(nasc), sexo: lerSexo(sexo), erros: [] };
      if (nome.length < 3) r.erros.push('nome em falta');
      if (!r.dataNascimento) r.erros.push('data de nascimento inválida (use dd/mm/aaaa)');
      if (!r.sexo) r.erros.push('sexo inválido (M ou F)');
      if (ee || tel) {
        if (ee.length < 3 || tel.replace(/\D/g, '').length < 9) r.erros.push('encarregado: indique o nome e um telefone válido');
        else Object.assign(r, { encarregadoNome: ee, encarregadoTelefone: tel });
      }
      return r;
    });
}

/** Lista de exemplo com 10 alunos fictícios, para testes. */
export function exemploDeTeste(ano = 2013) {
  const nomes = [
    ['Adelino Chipenda', 'M'], ['Beatriz Kalandula', 'F'], ['Celso Ndumba', 'M'], ['Dalva Tchissola', 'F'],
    ['Edson Kapinga', 'M'], ['Filomena Sapalo', 'F'], ['Gaspar Muteka', 'M'], ['Helena Lussati', 'F'],
    ['Ivo Cassoma', 'M'], ['Joana Ngola', 'F'],
  ];
  return nomes.map(([nome, sexo], i) => {
    const apelido = nome.split(' ')[1];
    const dia = String(3 + i * 2).padStart(2, '0');
    const mes = String(1 + i).padStart(2, '0');
    return `${nome} (teste); ${dia}/${mes}/${ano}; ${sexo}; ${sexo === 'M' ? 'Maria' : 'José'} ${apelido}; +244 923 000 ${String(100 + i)}`;
  }).join('\n');
}
