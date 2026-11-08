# Fase 1: Requisitos

**Projeto:** Sistema de Gestão Escolar (Angola, várias escolas)
**Estado:** aprovado
**Data:** 2026-11-08
**Base:** [00-enquadramento.md](00-enquadramento.md)

Prioridades: **M** = obrigatório no MVP, **D** = desejável (entra se houver tempo).

---

## 1. Atores

| Ator | Âmbito |
|---|---|
| Administrador(a) da plataforma (AP) | Toda a plataforma, mas sem acesso a dados de alunos |
| Director(a) da escola (DE) | A sua escola |
| Secretaria (SE) | A sua escola |
| Coordenador(a) (CO) | Os cursos ou classes que coordena |
| Director(a) de turma (DT) | As turmas que dirige (é sempre também professor) |
| Professor(a) (PR) | As turmas e disciplinas que lhe foram atribuídas |
| Encarregado(a) de educação (EE) | Os seus educandos (fase seguinte) |
| Aluno(a) (AL) | Os seus próprios dados (fase seguinte) |

---

## 2. Requisitos funcionais

### M1. Plataforma e escolas
| ID | Requisito | Ator | Prior. | Critérios de aceitação |
|---|---|---|---|---|
| RF01 | Registar uma escola | AP | M | Código único na plataforma; província e município obrigatórios; níveis oferecidos escolhidos do catálogo |
| RF02 | Criar a conta do director de uma escola | AP | M | O director fica ligado a uma só escola; recebe uma palavra-passe provisória que tem de alterar no primeiro acesso |
| RF03 | Activar ou desactivar uma escola | AP | M | Com a escola inactiva, nenhum utilizador dela consegue entrar; os dados não são apagados |
| RF04 | Listar escolas com totais (alunos, turmas) | AP | D | Só números agregados, sem dados pessoais |

### M2. Autenticação e utilizadores
| ID | Requisito | Ator | Prior. | Critérios de aceitação |
|---|---|---|---|---|
| RF05 | Iniciar sessão com email e palavra-passe | Todos | M | Mensagem genérica em caso de erro; máximo de 5 tentativas por 15 min por IP |
| RF06 | Alterar a própria palavra-passe | Todos | M | Exige a palavra-passe actual; mínimo de 8 caracteres |
| RF07 | Criar utilizadores da escola (SE, CO, PR) | DE | M | O perfil é escolhido pelo director; o utilizador fica na escola do director |
| RF08 | Repor a palavra-passe de um utilizador | DE | M | Gera uma palavra-passe provisória; regista na auditoria |
| RF09 | Desactivar um utilizador | DE | M | Deixa de conseguir entrar; o histórico (notas lançadas) mantém-se |

### M3. Estrutura de ensino e ano lectivo
| ID | Requisito | Ator | Prior. | Critérios de aceitação |
|---|---|---|---|---|
| RF10 | Criar um ano lectivo com as datas dos 3 trimestres | DE | M | Trimestres sem sobreposição; só um ano lectivo activo por escola |
| RF11 | Escolher as classes que a escola oferece | DE | M | A partir do catálogo nacional (Iniciação a 13.ª); a 13.ª só no ramo técnico-profissional |
| RF12 | Gerir cursos e áreas do II Ciclo | DE, CO | M | Cada curso pertence a um ramo (geral ou técnico-profissional) |
| RF13 | Gerir disciplinas e o plano curricular por classe e curso | DE, CO | M | Uma disciplina não se repete na mesma classe e curso; cada disciplina pode ser marcada como **disciplina-chave** (nuclear) |
| RF14 | Configurar a avaliação de cada classe | DE | M | Escala (0–10 ou 0–20), nota mínima de aprovação, se é classe de exame, se a avaliação é qualitativa (Iniciação), se é só de estágio (13.ª), número máximo de negativas e nota mínima das negativas |

### M4. Alunos, encarregados e professores
| ID | Requisito | Ator | Prior. | Critérios de aceitação |
|---|---|---|---|---|
| RF15 | Registar um aluno | SE | M | Número de processo único na escola; nome, data de nascimento e sexo obrigatórios; BI ou cédula opcionais |
| RF16 | Registar encarregados e ligá-los a alunos | SE | M | Um aluno pode ter vários encarregados; um encarregado pode ter vários educandos |
| RF17 | Pesquisar alunos por nome, número de processo ou turma | SE, DE | M | Resultados paginados (20 por página) |
| RF18 | Registar professores | SE, DE | M | Ligados à conta de utilizador; disciplinas que podem leccionar |

### M5. Turmas e matrículas
| ID | Requisito | Ator | Prior. | Critérios de aceitação |
|---|---|---|---|---|
| RF19 | Criar turmas | SE, DE | M | Classe, curso (II Ciclo), turno (manhã, tarde, noite), sala, capacidade, director de turma; nome único no ano lectivo |
| RF20 | Atribuir professores às disciplinas de cada turma | DE, CO | M | Um só professor por disciplina e turma |
| RF21 | Matricular um aluno numa turma | SE | M | Um aluno não pode ter duas matrículas activas no mesmo ano lectivo; a turma não pode exceder a capacidade |
| RF22 | Confirmar a matrícula no novo ano lectivo | SE | M | Sugere a classe seguinte se o aluno transitou, ou a mesma classe se reprovou |
| RF23 | Anular ou mudar de turma uma matrícula | SE | M | Exige motivo; o registo não é apagado |
| RF44 | Ficha de matrícula de um aluno novo (aluno, encarregado e turma) | SE | M | Uma só operação: se a turma estiver cheia, nada fica gravado |
| RF45 | Importar uma lista de alunos para uma turma | SE | D | Até 100 por vez; colar do Excel ou CSV; tudo ou nada; avisa as vagas e as linhas com erros |

### M6. Avaliação e pautas
| ID | Requisito | Ator | Prior. | Critérios de aceitação |
|---|---|---|---|---|
| RF24 | Lançar MAC, NPP e NPT por trimestre | PR | M | Só nas suas turmas e disciplinas; notas dentro da escala da classe; só durante o trimestre aberto |
| RF25 | Calcular a MT automaticamente | Sistema | M | MT = (MAC + NPP + NPT) / 3, sem arredondar (mostrada com 1 casa decimal) |
| RF26 | Calcular a MFD no fim do ano | Sistema | M | MFD = média aritmética das 3 MT, arredondada à unidade |
| RF27 | Lançar a nota da prova de exame | PR, SE | M | Só nas classes de exame (6.ª, 9.ª, 12.ª, incluindo a 12.ª do técnico-profissional) |
| RF28 | Calcular a classificação final das classes de exame | Sistema | M | CF = MFD (sem arredondar) × 40% + exame × 60%, arredondada à unidade |
| RF29 | Determinar a situação do aluno | Sistema | M | Aprovado ou reprovado por disciplina; **transita** com no máximo 2 negativas, cada uma > 7 (0–20) ou > 3,5 (0–10), e nenhuma numa disciplina-chave. Nas **classes de exame**, só transita com **todas** as disciplinas com positiva |
| RF30 | Fechar e publicar as notas de um trimestre | DT, DE | M | Depois de publicadas, o professor já não as pode editar livremente |
| RF31 | Corrigir uma nota publicada | DE | M | Exige justificação; fica na auditoria (valor antigo, valor novo, autor, data) |
| RF32 | Ver a pauta trimestral e a pauta final da turma | DT, DE, SE | M | Todas as disciplinas e alunos numa tabela; versão para imprimir |
| RF33 | Avaliação descritiva na Iniciação | PR | M | Texto por aluno e trimestre, sem nota numérica |
| RF34 | Exportar a pauta em CSV | DT, DE | D | Fica registado quem exportou e quando |

### M7. Assiduidade
| ID | Requisito | Ator | Prior. | Critérios de aceitação |
|---|---|---|---|---|
| RF35 | Registar faltas por disciplina e data | PR | M | Só nas suas turmas; não se regista a mesma falta duas vezes |
| RF36 | Justificar faltas | DT | M | Motivo obrigatório; a falta passa a "justificada" |
| RF37 | Ver o resumo de faltas por aluno e disciplina | DT, DE | M | Totais justificadas e injustificadas por trimestre |

### M8. Painel e auditoria
| ID | Requisito | Ator | Prior. | Critérios de aceitação |
|---|---|---|---|---|
| RF38 | Painel do director | DE | D | Alunos por classe e turno; percentagem de aprovação por classe |
| RF39 | Consultar o registo de auditoria | DE | M | Filtrar por utilizador, entidade e data |

### M9. Estágio (13.ª classe, técnico-profissional)
| ID | Requisito | Ator | Prior. | Critérios de aceitação |
|---|---|---|---|---|
| RF40 | Registar o estágio de um aluno da 13.ª classe | SE, CO | D | Entidade de acolhimento, orientador, datas de início e fim, estado (a decorrer, concluído) |
| RF41 | Lançar o resultado do estágio | CO | D | Nota 0–20, aprovação com ≥ 10 |
| RF42 | Registar o Trabalho de Fim de Curso (TFC) | CO | D | Tema, orientador, data da defesa e júri |
| RF43 | Lançar a nota da defesa do TFC | CO | D | Nota 0–20, aprovação com ≥ 10; o curso fica concluído com o estágio e o TFC aprovados ⚠️ |

---

## 3. Requisitos não funcionais

| ID | Categoria | Requisito |
|---|---|---|
| RNF01 | Isolamento | Um utilizador nunca vê nem altera dados de outra escola; a escola vem sempre da conta autenticada |
| RNF02 | Segurança | JWT com algoritmo fixo e validade curta; bcrypt (custo 12); validação Zod em todas as entradas; CORS restrito; limitação de pedidos no login (OWASP Top 10) |
| RNF03 | Privacidade | Cumprir a Lei n.º 22/11: recolher só os dados necessários, acesso restrito aos dados de menores, auditoria de acessos sensíveis |
| RNF04 | Integridade | Notas, matrículas e faltas nunca são apagadas fisicamente; todas as alterações ficam na auditoria |
| RNF05 | Desempenho | A pauta de uma turma de 50 alunos carrega em menos de 2 s (sem contar o arranque do Render) |
| RNF06 | Ligação fraca | Página inicial com menos de 500 KB comprimidos; listas paginadas |
| RNF07 | Responsivo | Utilizável num telemóvel de 360 px de largura, sobretudo o lançamento de notas e faltas |
| RNF08 | Acessibilidade | WCAG 2.2 nível AA nos pontos principais: contraste, teclado, rótulos nos formulários |
| RNF09 | Testes | Cobertura de pelo menos 80% em `services/` (cálculo de notas e regras de matrícula) |
| RNF10 | Língua | Interface em português de Angola; datas no formato dd/mm/aaaa |
| RNF11 | Disponibilidade | Plano gratuito do Render e do Neon, com as limitações documentadas; cópias de segurança manuais semanais |

---

## 4. Regras de negócio com exemplos de teste

| ID | Regra | Exemplo de teste |
|---|---|---|
| RN01 | MT = (MAC + NPP + NPT) / 3 | MAC 12, NPP 14, NPT 10 → MT 12 |
| RN02 | MFD = média das 3 MT | MT 12, 13, 11 → MFD 12 |
| RN03 | CF (classe de exame) = MFD × 0,4 + exame × 0,6 | MFD 12, exame 9 → 10,2 → CF 10 (aprovado) |
| RN04 | Arredondamento à unidade só na nota final da disciplina | MT 9,4 fica 9,4; MFD 9,5 → 10 (aprovado) |
| RN05 | As notas respeitam a escala da classe | NPT 21 numa classe 0–20 → 422 |
| RN06 | Uma matrícula activa por aluno e ano lectivo | Segunda matrícula no mesmo ano → 409 |
| RN07 | A turma não excede a capacidade | Turma de 45 lugares com 45 alunos → 409 |
| RN08 | O professor só lança notas nas suas turmas | Professor de Matemática da 7.ª A lança nota na 7.ª B → 403 |
| RN09 | Isolamento entre escolas | Utilizador da Escola A pede um aluno da Escola B → 404 |
| RN10 | Notas publicadas só mudam com justificação | Correcção sem justificação → 422 |
| RN11 | A 13.ª classe só existe no técnico-profissional | Criar 13.ª no ramo geral → 422 |
| RN12 | Na Iniciação não há notas numéricas | Lançar MAC numa turma da Iniciação → 422 |
| RN13 | Transição com até 2 negativas, acima do mínimo e fora das disciplinas-chave | 0–20: negativas 9 e 8 → transita; uma negativa de 7 → não transita; três negativas → não transita |
| RN14 | Mínimo das negativas na escala 0–10 | Negativas 4 e 4 (não nucleares) → transita; negativa 3 → não transita |
| RN15 | Disciplina-chave com negativa impede a transição | Única negativa: 9 numa disciplina nuclear → não transita |
| RN16 | A 13.ª classe é só de estágio | Lançar MAC numa turma da 13.ª → 422 |
| RN17 | Nas classes de exame, todas as disciplinas têm de ter positiva | 9.ª classe com uma única CF de 9, numa disciplina não nuclear → não transita |
| RN18 | A 12.ª do técnico-profissional é classe de exame | Turma da 12.ª de Informática aceita nota de exame; turma da 11.ª → 422 |

---

## 5. Exclusões (fora do âmbito)
- Pagamentos, propinas e emolumentos.
- Portal do encarregado de educação e do aluno (fase seguinte).
- Horários e detecção de conflitos de sala ou professor.
- Gestão detalhada do estágio (relatórios, avaliação pela entidade de acolhimento).
- Transferência de alunos entre escolas.
- Emissão de declarações e certificados em PDF.
- Integração com o SIGE ou outros sistemas do MED; envio de emails ou SMS.

---

## 6. Ainda por confirmar
- [ ] A conclusão da 13.ª exige o estágio e o TFC aprovados em separado, ou uma nota final que combine os dois?
