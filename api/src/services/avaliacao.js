/**
 * Regras de transição (RF29, RN13–RN17). Funções puras, sem acesso à base de dados.
 * As médias (MT, MFD, CF) são calculadas em numeric pela vista v_resultados_disciplina;
 * aqui só se decide com base nas notas finais, que já são inteiros.
 */

/**
 * @param {{ notaMinimaAprovacao: number, minimoNegativa: number, maxNegativas: number, classeDeExame: boolean }} classe
 * @param {{ notaFinal: number|null, chave: boolean }[]} resultados  um por disciplina do plano
 * @returns {{ situacao: 'transita'|'nao_transita'|'pendente', negativas: number, motivos: string[] }}
 */
export function decidirTransicao(classe, resultados) {
  if (resultados.length === 0 || resultados.some((r) => r.notaFinal === null || r.notaFinal === undefined)) {
    return { situacao: 'pendente', negativas: 0, motivos: ['Há disciplinas sem nota final.'] };
  }

  const negativas = resultados.filter((r) => r.notaFinal < classe.notaMinimaAprovacao);
  const motivos = [];

  if (classe.classeDeExame) {
    // RN17: nas classes de exame todas as disciplinas têm de ter positiva
    if (negativas.length > 0) motivos.push('Classe de exame: todas as disciplinas têm de ter positiva.');
  } else {
    if (negativas.length > classe.maxNegativas) {
      motivos.push(`Mais de ${classe.maxNegativas} negativas.`);
    }
    if (negativas.some((r) => r.notaFinal <= classe.minimoNegativa)) {
      motivos.push(`Negativa igual ou inferior a ${classe.minimoNegativa}.`);
    }
    if (negativas.some((r) => r.chave)) {
      motivos.push('Negativa numa disciplina-chave.');
    }
  }

  return { situacao: motivos.length ? 'nao_transita' : 'transita', negativas: negativas.length, motivos };
}
