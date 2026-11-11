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
| RF46 | Mini-pauta e pautas (trimestral e final) em PDF | PR, DT, DE, SE, CO | M | Cabeçalho oficial (República, Governo da Província, escola); assinaturas; negativas a negrito |
| RF47 | Termo de frequência e aproveitamento em PDF | SE, DE | M | Modelo da escola: dois anos lado a lado, Ct/F por trimestre, CAP, CPE, CF, OBS |
| RF49 | Histórico escolar: notas finais de classes anteriores ao sistema ou feitas noutra escola | SE, DE | M | Por classe, com ano lectivo e escola de origem; escala da classe; não substitui classes que estão no sistema; usado nos certificados; fica na auditoria |
| RF50 | Dar acesso ao portal ao encarregado de educação e ao aluno | SE, DE | M | Email e palavra-passe provisória (troca obrigatória); uma conta por encarregado e por aluno; fica na auditoria |
| RF51 | Portal: o encarregado vê os seus educandos, e o aluno vê-se a si próprio | EE, AL | M | Turma e director de turma; só as notas dos trimestres publicados; notas finais e situação com o 3.º trimestre publicado; faltas; nenhum acesso ao resto do sistema |
| RF52 | Tempos lectivos por turno | DE | D | Horas de início e fim de cada tempo; valores típicos propostos; sem sobreposições; não se retiram tempos com aulas |
| RF53 | Horário semanal da turma | DE, CO | D | Grelha dias × tempos; o professor vem da atribuição; recusa conflitos de professor e de sala com outras turmas (também na base de dados); as aulas seguem as mudanças de atribuição |
| RF54 | Horário do professor e da turma no portal | PR, EE, AL | D | "O meu horário" com todas as turmas do professor; o horário da turma no portal do encarregado e do aluno |
| RF55 | Declaração de frequência em PDF | SE, DE | M | Só com matrícula activa no ano activo; finalidade opcional; numeração seguida por tipo e ano; nunca se apaga; fica na auditoria |
| RF56 | Declaração com notas em PDF | SE, DE | D | Só com trimestres publicados; MT por trimestre e, com o 3.º publicado, notas finais por extenso e situação; não na Iniciação nem na 13.ª |
| RF48 | Certificado do Ensino Primário e do I Ciclo em PDF | SE, DE | M | Modelos do MED; numeração seguida por ano (N.º x/aaaa); só com notas e dados completos (ou rascunho sem número); reimpressão igual; nunca se apaga |

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
| RF37 | Ver o resumo de faltas por aluno e disciplina | DT, DE | M | Totais justificadas, injustificadas e vermelhas por trimestre |
| RF64 | Marcar falta vermelha (disciplinar) | PR | M | Só o professor da disciplina; com a descrição da ocorrência; substitui a falta de presença da aula; uma por aula (409); não se justifica; o registo das faltas da aula não a anula |
| RF65 | Anular falta vermelha | DE | M | Com motivo; fica na auditoria; nunca se apaga |

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

### M10. Pagamentos e propinas
| ID | Requisito | Ator | Prior. | Critérios de aceitação |
|---|---|---|---|---|
| RF57 | Preçário do ano lectivo | DE | M | Propinas mensais (por classe ou todas), com os meses cobrados, o dia de vencimento (1–28) e a multa por atraso em %; emolumentos e outras rubricas; valores em Kwanzas com 2 casas; mudar o valor não altera o que já foi cobrado; rubricas desactivam-se, não se apagam |
| RF58 | Gerar as propinas | DE | M | Uma mensalidade por aluno com matrícula activa e mês; repetir não duplica (também na base de dados); Setembro–Dezembro no 1.º ano civil, Janeiro–Agosto no 2.º |
| RF59 | Cobrar um emolumento a um aluno | SE, DE | M | Declarações, certificados, cartão…; as propinas não se cobram à mão |
| RF60 | Registar um pagamento e emitir o recibo | SE, DE | M | Uma ou mais cobranças pendentes do aluno, pagas por inteiro; numerário, transferência, Multicaixa, depósito; data não futura; multa se pago depois do vencimento; recibo n.º x/ano seguido por escola, em PDF, com o valor por extenso; pagar duas vezes → 409 |
| RF61 | Anular um pagamento ou uma cobrança | DE | M | Com motivo; o recibo fica marcado ANULADO e as cobranças voltam a pendentes; nada se apaga; fica na auditoria |
| RF62 | Dívidas e resumo do mês | SE, DE | M | Alunos com mensalidades vencidas, por turma e valor; recebido no mês por forma de pagamento; total em atraso e por pagar |
| RF63 | Propinas no portal | EE, AL | D | O que está por pagar e em atraso, com a multa prevista, e os recibos em PDF; só dos seus educandos |

### M11. Avisos no portal
| ID | Requisito | Ator | Prior. | Critérios de aceitação |
|---|---|---|---|---|
| RF66 | Avisos automáticos ao encarregado e ao aluno | EE, AL | M | Notas do trimestre publicadas; faltas injustificadas a chegar ao limite numa disciplina e trimestre; falta vermelha com a ocorrência; propina em atraso; recibo emitido ou anulado; nunca o mesmo aviso duas vezes; só dos seus educandos |
| RF67 | Marcar avisos como lidos | EE, AL | M | Um a um ou todos; cada conta tem o seu estado de leitura; contador de avisos por ler |
| RF68 | Limite de faltas para o aviso | DE | D | Número de faltas injustificadas (1–30, por omissão 3) nos dados da escola |

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
- Pagamentos online (Multicaixa Express, referências bancárias) e pagamentos parciais.
- Gestão detalhada do estágio (relatórios, avaliação pela entidade de acolhimento).
- Transferência de alunos entre escolas.
- Certificado do II Ciclo e da Educação de Adultos (falta o modelo oficial).
- Integração com o SIGE ou outros sistemas do MED.
- Envio de avisos por email ou SMS (os avisos ficam no portal).

---

## 6. Ainda por confirmar
- [ ] A conclusão da 13.ª exige o estágio e o TFC aprovados em separado, ou uma nota final que combine os dois?
