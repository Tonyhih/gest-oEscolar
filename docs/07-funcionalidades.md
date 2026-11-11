# O que o MVP faz

**Projeto:** Sistema de Gestão Escolar (Angola, várias escolas)
**Data:** 2026-11-10
**Aplicação:** https://tonyhih.github.io/gest-oEscolar/ · **API:** https://gestao-escolar-api-8xji.onrender.com/api/v1

É uma plataforma web para **várias escolas angolanas**, já publicada e a funcionar, no computador e no telemóvel.

---

## 1. Sistema de ensino angolano

| Nível | Classes |
|---|---|
| Ensino Primário | Iniciação e 1.ª a 6.ª |
| I Ciclo do Ensino Secundário | 7.ª a 9.ª |
| II Ciclo, Ensino Geral | 10.ª a 12.ª |
| II Ciclo, Técnico-Profissional | 10.ª a 13.ª (a 13.ª é de estágio e TFC) |

Cada classe tem as suas regras de avaliação:
- escala de 0 a 10 no Primário e de 0 a 20 nos restantes níveis;
- classes de exame na 6.ª, na 9.ª e na 12.ª;
- avaliação descritiva na Iniciação.

Estas regras vêm por omissão, e o director pode ajustá-las.

---

## 2. Perfis e o que cada um faz

| Perfil | O que pode fazer |
|---|---|
| **Administrador da plataforma** | Regista escolas, activa ou desactiva escolas e cria a conta do director. Não vê dados de alunos. |
| **Director(a)** | Painel de indicadores e configuração da escola: ano lectivo, trimestres, classes, cursos, disciplinas, planos curriculares, dados da escola. Gere utilizadores, turmas e atribuições. Publica e corrige notas, gera pautas, emite documentos e consulta a auditoria. |
| **Secretaria** | Matrículas (ficha de aluno novo, importação de listas, confirmação no ano seguinte, mudança de turma, anulação), fichas dos alunos e encarregados, notas de exame, estágios, termos e certificados. |
| **Coordenação** | Cursos, disciplinas, planos curriculares, atribuição de professores, notas do estágio e do TFC. |
| **Professor(a)** | Vê as suas turmas, lança notas (MAC, NPP, NPT), exames e faltas, faz a avaliação descritiva na Iniciação e descarrega a mini-pauta. |
| **Encarregado(a) de educação** | No **portal**, vê os seus educandos: turma, director de turma, notas dos trimestres já publicados, notas finais e situação no fim do ano, e faltas. Não acede a mais nada. |
| **Aluno(a)** | No **portal**, vê as suas próprias notas publicadas, faltas e situação. |
| **Director(a) de turma** | O mesmo que o professor, e ainda pautas da turma, publicação do trimestre, resumo e justificação de faltas, fichas dos alunos da turma. |

---

## 3. Funcionalidades

### Matrículas e alunos
- **Ficha de matrícula num só passo,** com os dados do aluno, o encarregado e a turma. O n.º de processo é gerado automaticamente. Se a turma estiver cheia, nada fica gravado.
- **Importação de listas:** colar do Excel e matricular até 100 alunos de uma vez. Mostra uma pré-visualização com os erros de cada linha e o controlo das vagas. É tudo ou nada.
- **Confirmação de matrícula** no ano seguinte, **mudança de turma** e **anulação** com motivo. O histórico fica guardado.
- **Ficha do aluno** com filiação, B.I., naturalidade, encarregados e todas as matrículas.
- **Acesso ao portal:** a secretaria dá acesso ao encarregado e/ou ao aluno na ficha do aluno, com palavra-passe provisória.
- **Histórico escolar:** notas finais de classes feitas antes de a escola usar o sistema, ou noutra escola, para os certificados saírem completos.

### Notas e avaliação (os cálculos são feitos pelo sistema)
- **Média trimestral (MT)** = (MAC + NPP + NPT) / 3.
- **Média final da disciplina (MFD)** = média das 3 MT, arredondada só no fim (9,5 passa a 10).
- **Classes de exame:** CF = MFD × 40% + exame × 60%.
- **Transição nas classes normais:** até 2 negativas, cada uma superior a 7 (ou a 3,5 na escala 0–10), e nenhuma numa disciplina-chave.
- **Transição nas classes de exame:** todas as disciplinas com positiva.
- **13.ª classe:** o curso fica concluído com o estágio e o TFC aprovados (≥ 10).
- **Lançamento das notas:**
  - o lançamento só é possível com o trimestre aberto;
  - depois da publicação, só o director corrige, com justificação, e a correcção fica na auditoria;
  - aceita vírgula decimal e bloqueia notas fora da escala.

Os cálculos são feitos na base de dados com números exactos, o que evita o erro de arredondamento do JavaScript.

### Horários
- **Tempos lectivos** por turno (manhã, tarde e noite), com horas típicas propostas que o director ajusta.
- **Horário de cada turma** numa grelha de segunda a sexta (ou sábado). O professor vem da atribuição da disciplina.
- **Conflitos impedidos:** o mesmo professor em duas turmas ao mesmo tempo, ou a mesma sala ocupada duas vezes. A mensagem diz com que turma é o conflito.
- **"O meu horário"** para o professor, e o horário da turma no portal do encarregado e do aluno.

### Transferência entre escolas da plataforma
- A escola de origem emite a **guia de transferência** em PDF, com um código. Não é emitida se houver propinas em atraso.
- A escola de destino introduz o código, confere os dados e escolhe a turma. O aluno é criado com um novo número de processo, com os encarregados, o histórico escolar e as notas dos trimestres publicados.
- A matrícula na origem passa a "transferida". O destino pode recusar e a origem pode cancelar, sempre com motivo.

### Pagamentos e propinas
- **Preçário** do ano lectivo, feito pelo director: propinas mensais por classe (meses cobrados, dia de vencimento e multa por atraso) e emolumentos (declarações, certificados…).
- **Gerar propinas**: uma mensalidade para cada aluno matriculado; pode repetir-se depois de novas matrículas sem duplicar.
- **Receber pagamento**: a secretaria procura o aluno, escolhe as mensalidades e emolumentos, a forma de pagamento (numerário, transferência, Multicaixa, depósito) e o sistema emite o **recibo numerado em PDF**, com o valor por extenso e a multa se estiver em atraso.
- **Anular** um recibo ou uma cobrança (isenção) só o director, com motivo. Nada se apaga.
- **Dívidas** por turma e **resumo do mês** por forma de pagamento.
- No **portal**, o encarregado vê o que está por pagar e descarrega os recibos.

### Assiduidade
- Faltas por aula, numa lista de caixas. Uma falta desmarcada é **anulada**, nunca apagada.
- Justificação pelo director de turma, com motivo obrigatório, e resumo por trimestre.
- **Falta vermelha (disciplinar):** o professor marca-a por indisciplina, com a ocorrência. Não se justifica; só o director a anula, com motivo.

### Avisos no portal
O encarregado e o aluno recebem avisos no portal, com o número de avisos por ler:
- notas do trimestre publicadas;
- faltas injustificadas a chegar ao limite numa disciplina (por omissão 3; o director muda-o nos dados da escola);
- falta vermelha, com a descrição da ocorrência;
- propina em atraso;
- recibo emitido ou anulado.

### Pautas e painel
- Pautas trimestrais e final, com a situação de cada aluno e o motivo quando não transita, e exportação CSV que abre no Excel.
- **Painel do director** com alunos, turmas, professores, taxa de transição por classe e alunos por turno.

---

## 4. Documentos em PDF

| Documento | Modelo |
|---|---|
| **Mini-pauta** | Uma disciplina, uma turma, um trimestre: MAC, NPP, NPT, MT e faltas |
| **Pautas** trimestral e final | A4 paisagem, com assinaturas do director de turma e do director |
| **Termo de frequência e aproveitamento** | Modelo da escola: dois anos lado a lado, Ct/F por trimestre, CAP, CPE, CF, OBS |
| **Declaração de frequência** | Matrícula, classe, turma e turno no ano activo, com finalidade opcional |
| **Declaração com notas** | Médias dos trimestres publicados e, no fim do ano, notas finais por extenso e situação |
| **Guia de transferência** | Dados do aluno, notas do ano, código para a escola de destino |
| **Recibo de pagamento** | Numerado por escola e ano, com o valor por extenso; marca ANULADO se for anulado |
| **Certificados do Ensino Primário e do I Ciclo** | Modelos do MED, com o artigo 109.º da LBSEE 17/16 e as médias por extenso |

**Certificados:**
- são numerados (N.º 1/2026);
- "Verificar dados" mostra o que falta antes de emitir;
- há um **rascunho** sem número para conferir;
- a reimpressão é igual ao original, e os certificados **nunca se apagam**.

---

## 5. Segurança e privacidade

- **Separação entre escolas:** cada escola só vê os seus dados. Esta separação é garantida três vezes: pelo perfil, por cada recurso pedido e pela própria base de dados.
- **Contas e sessões:**
  - palavras-passe guardadas de forma irreversível (bcrypt);
  - palavra-passe provisória com troca obrigatória no primeiro acesso;
  - bloqueio após 5 tentativas falhadas;
  - **segundo factor para o director:** depois da palavra-passe, recebe por email um código de 6 algarismos, válido 10 minutos;
  - sessões que expiram.
- **Dados que nunca se apagam:** notas, matrículas, faltas e documentos. A **auditoria** regista quem alterou o quê e quando.
- **Lei n.º 22/11:**
  - o professor não vê a morada nem o documento dos alunos;
  - o administrador da plataforma só vê totais;
  - há uma política de privacidade e uma cópia de segurança semanal.

---

## 6. Em números

| | |
|---|---|
| Rotas na API | 117 |
| Ecrãs | 29 |
| Requisitos funcionais documentados | 73 |
| Migrações da base de dados | 11 |
| Testes automáticos da API | 192 |
| Testes automáticos do front-end | 19 |
| Fluxos testados num browser real | 41 |

Os testes correm sozinhos no GitHub Actions a cada alteração.

**Tecnologia:**
- **Front-end:** Vue 3 e Bootstrap, publicado no GitHub Pages.
- **API:** Node.js 24 e Express 5, no Render.
- **Base de dados:** PostgreSQL, no Neon.

---

## 7. O que ainda não faz

- **Pagamentos online** (Multicaixa Express, referências) e pagamentos parciais: os pagamentos registam-se na secretaria.
- **Certificado do II Ciclo**, que precisa do modelo oficial.
- **Envio de avisos por email ou SMS:** por agora, os avisos ficam no portal.
