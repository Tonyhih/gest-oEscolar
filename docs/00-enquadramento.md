# Fase 0: Enquadramento

**Projeto:** Sistema de Gestão Escolar (realidade angolana)
**Estado:** aprovado
**Data:** 2026-11-08

> As regras marcadas com ⚠️ são suposições baseadas na Lei de Bases do Sistema de Educação e Ensino (Lei n.º 17/16, alterada pela Lei n.º 32/20) e na prática habitual das escolas angolanas. Têm de ser confirmadas com o professor orientador ou com o regulamento de avaliação em vigor no MED.

---

## 1. Estrutura de ensino suportada

| Nível | Ciclo / Ramo | Classes | Observações |
|---|---|---|---|
| Ensino Primário | — | Iniciação, 1.ª a 6.ª | Iniciação sem notas numéricas ⚠️ |
| Ensino Secundário | I Ciclo | 7.ª a 9.ª | Ensino geral |
| Ensino Secundário | II Ciclo, Ensino Geral | 10.ª a 12.ª | Por área: Ciências Físicas e Biológicas, Ciências Económicas e Jurídicas, Ciências Humanas ⚠️ |
| Ensino Secundário | II Ciclo, Técnico-Profissional | 10.ª a 13.ª | Por curso técnico (ex.: Informática, Contabilidade, Enfermagem); a 13.ª classe é só de estágio ✅ |

### Como isto entra no modelo de dados
O sistema não fixa as classes no código. Estes valores são **dados de configuração** que a administração pode alterar sem mexer no programa:

```
NivelEnsino   (Primário, Secundário)
  └─ Ciclo    (Primário, I Ciclo, II Ciclo)
       └─ Ramo      (Geral, Técnico-Profissional)        ← só no II Ciclo
            └─ Curso/Área (ex.: CFB, CEJ, Informática)    ← só no II Ciclo
                 └─ Classe (Iniciação, 1.ª … 13.ª)
                      └─ Turma (ex.: 10.ª A – Informática – Manhã – 2026/2027)
```

Cada **classe** define as disciplinas do plano curricular, a escala de notas, se é **classe de exame** e se tem estágio. Assim a 12.ª do ensino geral é a última do seu ramo e a 13.ª só existe no técnico-profissional.

---

## 2. Regras de avaliação (propostas)

| Aspeto | Primário | I e II Ciclos |
|---|---|---|
| Escala | 0–10, aprovação com ≥ 5 ✅ | 0–20, aprovação com ≥ 10 ✅ |
| Períodos | 3 trimestres | 3 trimestres |
| Iniciação | Avaliação qualitativa (descritiva) ⚠️ | — |
| Classes de exame | 6.ª ✅ | 9.ª e 12.ª ✅, também a 12.ª do técnico-profissional (a 13.ª não tem exame, é só estágio) |

### Cálculo da nota por trimestre ⚠️
- **MAC**: média das avaliações contínuas (trabalhos, participação, testes curtos).
- **NPP**: nota da prova do professor.
- **NPT**: nota da prova trimestral.
- **MT** (média trimestral) = (MAC + NPP + NPT) / 3.

### Nota final ✅
- **Classes normais:** **MFD** (média final da disciplina) = média aritmética das três MT.
- **Classes de exame (6.ª, 9.ª e 12.ª):** **CF** (classificação final) = MFD × 40% + nota da prova de exame × 60%.
- **Arredondamento ✅:** só a nota final de cada disciplina (MFD, ou CF nas classes de exame) é arredondada à unidade. As MT ficam com as casas decimais. Exemplo: MFD 9,5 → 10 (aprovado).
- Nas classes de exame, a CF é calculada com a MFD ainda sem arredondar, e só a CF é arredondada ✅.

### Transição de classe ✅
O aluno **transita** se tiver, no máximo, **duas negativas**, e se cumprir as duas condições seguintes:
- Cada negativa é **superior a 7** (escala 0–20) ou **superior a 3,5** (escala 0–10). Como a nota final é inteira, isto significa pelo menos 8 ou pelo menos 4.
- Nenhuma negativa é numa **disciplina-chave** (nuclear) do curso ou da classe. As disciplinas-chave são marcadas no plano curricular de cada classe e curso.

Exemplos (0–20): negativas 9 e 8 em disciplinas não nucleares → transita. Uma negativa de 7 → não transita. Negativa 9 em Matemática, se for nuclear → não transita. Três negativas → não transita.

**Classes de exame (6.ª, 9.ª e 12.ª) ✅:** esta regra **não** se aplica. O aluno só transita, ou conclui o ciclo, com **todas** as disciplinas com positiva (CF ≥ 5 na escala 0–10, CF ≥ 10 na escala 0–20).

Exemplo (escala 0–20): MT = 12, 13 e 11 → MFD = 12; exame = 9 → CF = 12 × 0,4 + 9 × 0,6 = 10,2 → **10 (aprovado)**.

**Decisão técnica:** as fórmulas ficam num serviço configurável (`services/avaliacao.js`) com testes unitários. Se a regra oficial for diferente, muda-se a configuração e não o resto do sistema.

---

## 3. Perfis

| Perfil | Pode |
|---|---|
| Administrador(a) da plataforma | Registar escolas e o respectivo director; não vê notas nem dados de alunos |
| Director(a) da escola | Configurar o ano lectivo, as classes, os cursos e os utilizadores **da sua escola**; ver relatórios |
| Secretaria | Matrículas e confirmações, processo do aluno, emissão de declarações, pagamentos |
| Coordenador(a) de curso / classe | Planos curriculares, distribuição de professores |
| Director(a) de turma | Ver a pauta da sua turma, justificar faltas, contactar encarregados |
| Professor(a) | Lançar notas e faltas apenas nas suas turmas e disciplinas |
| Encarregado(a) de educação | Consultar notas, faltas e pagamentos dos seus educandos |
| Aluno(a) | Consultar horário, notas e pagamentos (no II Ciclo e técnico) |

---

## 4. Adaptações à realidade angolana

- **Moeda:** Kwanza (AOA), com propinas, emolumentos (declarações, certificados) e multas por atraso.
- **Pagamentos:** registo manual pela secretaria (numerário, transferência, Multicaixa Express, referência bancária). Sem integração com bancos no MVP.
- **Identificação:** número de processo interno; Bilhete de Identidade ou Cédula Pessoal (opcional para menores).
- **Matrícula e confirmação:** matrícula na entrada e **confirmação de matrícula** em cada ano lectivo.
- **Turnos:** manhã, tarde e noite, por turma.
- **Documentos:** pautas trimestrais e finais, boletim do aluno, declaração de frequência e de notas, em PDF.
- **Proteção de dados:** Lei n.º 22/11 (Proteção de Dados Pessoais) em vez do RGPD, com acesso restrito aos dados de menores, minimização e registo de auditoria ⚠️.
- **Ligação à internet:** páginas leves, pouco consumo de dados e funcionamento aceitável em telemóvel.

---

## 5. Âmbito do MVP (proposta)

### Incluído na primeira entrega
0. Várias escolas na mesma plataforma, com os dados de cada escola isolados.
1. Autenticação, perfis e ano lectivo (trimestres).
2. Configuração da estrutura: níveis, ciclos, ramos, cursos, classes e disciplinas.
3. Alunos, encarregados, professores e turmas.
4. Matrículas e confirmações de matrícula.
5. Lançamento de notas (MAC, NPP, NPT), cálculo automático da MT e da MFD e pautas, com auditoria.
6. Faltas por disciplina e justificação pelo director de turma.

### Acrescentado depois da primeira entrega
7. Estágio e TFC da 13.ª classe, painel do director e auditoria.
8. Documentos em PDF: mini-pautas, pautas, termos, certificados do Primário e do I Ciclo, declarações e recibos.
9. Histórico escolar (notas de anos anteriores, para os certificados).
10. Portal do encarregado de educação e do aluno, com avisos.
11. Horários com detecção de conflitos de professor e de sala.
12. Pagamentos: preçário, propinas mensais, emolumentos, recibos e dívidas.
13. Faltas vermelhas (disciplinares).

### Fica para fases seguintes
- Certificado do II Ciclo (falta o modelo oficial do MED).
- Envio de avisos por email ou SMS (precisa de um fornecedor pago).
- Gestão detalhada do estágio da 13.ª classe (relatórios, avaliação pela entidade de acolhimento).

### Exclusões
- Integração com o SIGE ou outros sistemas do MED.
- Pagamentos online reais e pagamentos parciais.
- Aplicação móvel nativa (o sistema é uma página web responsiva).

---

## 6. Stack e alojamento

| Camada | Tecnologia | Alojamento |
|---|---|---|
| Front-end | Vue 3, Vite, Vue Router, Pinia, Bootstrap | GitHub Pages |
| API | Node.js 24, Express 5, Zod, JWT | Render (plano gratuito) |
| Base de dados | PostgreSQL 16, SQL com o driver `pg` | Neon (plano gratuito) ⚠️ confirmar as condições actuais |
| Testes | Vitest, Supertest | GitHub Actions |

**Compromisso conhecido:** no plano gratuito do Render a API fica suspensa ao fim de algum tempo sem pedidos, e o primeiro pedido seguinte demora. Para um projeto académico é aceitável e fica documentado.

---

## 7. Registo de decisões

| Data | Decisão | Motivo |
|---|---|---|
| 2026-11-08 | Seguir o sistema de ensino angolano (Iniciação a 13.ª classe) | Pedido do autor do projeto |
| 2026-11-08 | Estrutura de ensino e escalas guardadas como configuração | As regras podem mudar ou ser corrigidas sem alterar o código |
| 2026-11-08 | Lei n.º 22/11 como referência de proteção de dados | Legislação angolana aplicável |
| 2026-11-08 | Trabalho individual, prazo de 60 dias | Resposta do autor |
| 2026-11-08 | A plataforma serve várias escolas | Resposta do autor |
| 2026-11-08 | Sem módulo de pagamentos no MVP | Resposta do autor (revista a 2026-11-11) |
| 2026-11-08 | Fórmula MT = (MAC + NPP + NPT) / 3 e MFD = média das MT confirmadas | Resposta do autor |
| 2026-11-08 | Classes de exame: CF = MFD × 40% + exame × 60% | Resposta do autor |
| 2026-11-08 | Primário: escala 0–10, aprovação com ≥ 5 | Resposta do autor |
| 2026-11-08 | A 13.ª classe é só de estágio (sem exame nem disciplinas) | Resposta do autor |
| 2026-11-08 | Transição: até 2 negativas, > 7 (0–20) ou > 3,5 (0–10), fora das disciplinas-chave | Resposta do autor |
| 2026-11-08 | Arredondamento só na nota final de cada disciplina | Resposta do autor |
| 2026-11-08 | Classes de exame: transição só com 100% das disciplinas com positiva | Resposta do autor |
| 2026-11-08 | No técnico-profissional, a 12.ª é classe de exame e a 13.ª é de estágio | Resposta do autor |
| 2026-11-08 | A 13.ª tem estágio com nota 0–20 (aprovação ≥ 10) e defesa de um Trabalho de Fim de Curso (TFC) | Resposta do autor |
| 2026-11-08 | Requisitos (Fase 1) dados como aprovados | Todas as dúvidas de avaliação respondidas |
| 2026-11-08 | Arquitectura (Fase 2) aprovada | Resposta do autor |
| 2026-11-08 | Base de dados: PostgreSQL em vez de MongoDB | O professor pediu a base de dados mais adequada; o domínio é muito relacional (ver 03-dados.md) |
| 2026-11-10 | Notas de anos anteriores lançadas como histórico escolar | Alunos vindos de outras escolas precisam do certificado |
| 2026-11-10 | Portal do encarregado e do aluno, só com o que foi publicado | Pedido do autor |
| 2026-11-11 | Pagamentos registados na secretaria: propinas por mês, emolumentos, multa por atraso, recibo numerado; sem pagamentos parciais nem online | Pedido do autor |
| 2026-11-11 | Avisos só no portal (sem email nem SMS) | Resposta do autor: evita custos e contas externas |
| 2026-11-11 | Faltas vermelhas (disciplinares): não se justificam; só o director anula | Pedido do autor |
| 2026-11-11 | Certificado do II Ciclo adiado | Falta o modelo oficial do MED |

---

## 8. Várias escolas (multi-escola)

- Nova entidade **Escola**: nome, código, província, município, natureza (pública, privada, comparticipada), níveis e cursos que oferece, estado (activa ou inactiva).
- Todas as tabelas de uma escola têm `escola_id`, e as chaves estrangeiras incluem-no. Assim a **própria base de dados** impede ligar um registo da Escola A a um da Escola B.
- O número de processo é único **dentro de cada escola**. O email é único **em toda a plataforma**, porque o login é só por email.
- A escola de cada pedido vem sempre do utilizador autenticado, lida da base de dados, e **nunca** do corpo ou da URL enviados pelo cliente.
- Testes obrigatórios: um utilizador da Escola A recebe 404 ao pedir um aluno da Escola B.
- A transferência de alunos entre escolas fica para uma fase seguinte.

## 9. Plano para os 60 dias (trabalho individual)

| Semana | Fase | Resultado |
|---|---|---|
| 1 | Fases 1 e 2: requisitos, arquitetura e contrato da API | Requisitos aprovados, OpenAPI inicial |
| 2 | Fase 3: esquema PostgreSQL e dados de teste | Migração SQL, restrições, vista de resultados e seed com 2 escolas fictícias |
| 3–5 | Fase 4: back-end | API com testes (regras de avaliação, isolamento entre escolas, permissões) |
| 6–7 | Fase 5: front-end | Ecrãs por perfil, pautas, lançamento de notas e faltas |
| 8 | Fase 6: publicação e relatório | Sistema publicado, checklist final, relatório |
| Dias 57–60 | Margem | Correcções e preparação da defesa |

## 10. Ainda por confirmar
- [ ] Na 13.ª classe, a conclusão do curso exige aprovação no estágio **e** no TFC, cada um com ≥ 10? Ou há uma nota final que combina os dois? (proposta: os dois separados, cada um com ≥ 10)
