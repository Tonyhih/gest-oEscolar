# Fase 4: Back-end (API)

**Projeto:** Sistema de Gestão Escolar (Angola, várias escolas)
**Estado:** proposta para aprovação
**Data:** 2026-11-08
**Código:** [api/src](../api/src) · Contrato: [openapi.yaml](openapi.yaml)

---

## 1. O que está feito

- **68 rotas em `/api/v1`**, que cobrem todos os requisitos do MVP: os obrigatórios (M) e também os desejáveis (D), ou seja, estágio, TFC e painel.
- **86 testes automáticos:**
  - 8 unitários;
  - 23 da base de dados;
  - 55 de integração com Supertest, que fazem pedidos HTTP reais à API sobre um PostgreSQL em memória.
- **Node.js 24 e Express 5:** as excepções em funções `async` vão directamente para o tratamento central de erros, sem `try/catch` em cada rota.

| Módulo | Rotas | Requisitos |
|---|---|---|
| Sistema e autenticação | `/saude`, `/auth/login`, `/auth/eu`, `/auth/palavra-passe` | RF05, RF06 |
| Plataforma | `/plataforma/escolas`, `…/:id`, `…/:id/director` | RF01–RF04 |
| Utilizadores | `/utilizadores`, `…/:id`, `…/:id/repor-palavra-passe` | RF07–RF09 |
| Estrutura | `/anos-lectivos`, `/catalogo/classes`, `/classes`, `/cursos`, `/disciplinas`, `/planos-curriculares` | RF10–RF14 |
| Pessoas | `/alunos`, `/alunos/:id/encarregados`, `/encarregados`, `/professores` | RF15–RF18 |
| Turmas e matrículas | `/turmas`, `/turmas/:id/atribuicoes`, `/matriculas`, `/matriculas/confirmacoes`, `…/mudar-turma`, `…/anular` | RF19–RF23 |
| Avaliação | notas, exame, avaliações descritivas, publicar, correcções, pautas (JSON e CSV) | RF24–RF34 |
| Assiduidade | faltas em lote, listagem, justificação, resumo | RF35–RF37 |
| Auditoria | `/auditoria` | RF39 |
| Estágio e TFC (13.ª) | `/estagios`, `/estagios/:id`, `/estagios/:id/tfc` | RF40–RF43 |
| Painel do director | `/painel` | RF38 |

**Estágio e TFC:** só na 13.ª classe e um por matrícula. A nota do estágio e o TFC são da coordenação (a secretaria regista o estágio). A nota da defesa exige a data da defesa.

**Painel:** só números agregados, sem nomes de alunos. Usa as mesmas regras de transição da pauta final.

---

## 2. Como cada pedido é tratado

```
helmet → cors → express.json (100 kb) → req.bd
  → rota: exigirAutenticacao → exigirPerfil(...) → validar(Zod) → controlador → serviço → PostgreSQL
  → tratarErros (formato único { mensagem, codigo, detalhes? })
```

- **`exigirAutenticacao`:** verifica o JWT e lê o utilizador **da base de dados** em cada pedido. Daí vêm o perfil, a escola, o estado da conta e da escola, a ficha de professor e as turmas que dirige. Se a conta tiver uma troca de palavra-passe pendente, só `/auth/eu` e `/auth/palavra-passe` funcionam (`403 TROCAR_PALAVRA_PASSE`).
- **`exigirPerfil`:** primeira barreira, por perfil.
- **Serviços:** segunda barreira, por recurso. Por exemplo: é o professor desta disciplina nesta turma? É o director desta turma? O recurso pertence à escola do utilizador? Se não pertencer, a resposta é **404**.
- **Base de dados:** terceira barreira. As chaves estrangeiras compostas `(escola_id, …)` impedem misturar escolas.

---

## 3. Segurança (OWASP Top 10 2021)

| Risco | Medida no código | Teste |
|---|---|---|
| A01 Controlo de acessos | Perfil + verificação por recurso + isolamento por escola; 404 para outra escola | `isolamento-permissoes.test.js` (14) |
| A02 Falhas criptográficas | bcrypt custo 12; JWT HS256 com segredo ≥ 32 caracteres; TLS no Neon e no Render | `autenticacao.test.js` |
| A03 Injecção | SQL sempre parametrizado (`$1, $2…`); nomes de colunas só a partir de esquemas Zod e de uma expressão regular | "injecção SQL na pesquisa é tratada como texto" |
| A04 Desenho inseguro | Atribuição em massa impossível (Zod descarta campos); o director não cria outro director; `escolaId` do cliente é ignorado | "Atribuição em massa" (2) |
| A05 Configuração | helmet, `X-Powered-By` desligado, CORS com lista branca, limite de 100 kb, variáveis validadas no arranque | `seguranca.test.js` (5) |
| A07 Autenticação | Mensagem genérica; hash fictício quando o email não existe; 5 tentativas falhadas por 15 min; algoritmo fixo, `issuer` e `audience`; `alg: none` recusado | `autenticacao.test.js` (13) |
| A09 Registo | Auditoria só de inserção, com antes, depois e justificação; exportações de pautas registadas | "correcção fica na auditoria", "regista a exportação" |

**Lei n.º 22/11 (protecção de dados):** um professor (director de turma) só vê os alunos das turmas que dirige, e não recebe a morada, o documento, o telefone nem a naturalidade do aluno. O administrador da plataforma só vê totais agregados.

---

## 4. Decisões tomadas nesta fase

| Decisão | Motivo |
|---|---|
| Os controladores estão num só ficheiro (`controllers/index.js`), com um adaptador `acao()` | São adaptadores de uma linha (pedido → serviço → resposta); as regras estão nos serviços |
| O SQL está nos serviços, sem uma camada de repositórios | As consultas são específicas de cada caso; mais uma camada só duplicava código |
| Migração **002**: falta "anulada" | Ao desmarcar uma falta lançada por engano, ela não se apaga (RNF04): passa a "anulada" e deixa de contar |
| Um utilizador criado com o perfil professor recebe logo a ficha em `professores` | Evita um segundo passo à direcção |
| A pauta final devolve também `motivos` | O director de turma vê porque é que um aluno não transita |
| CSV com `;` e BOM UTF-8 | Abre directamente no Excel em português, com acentos |

**Erros encontrados pelos testes e corrigidos:**
1. A restrição original das faltas não aceitava o novo estado "anulada". Foi corrigida na migração 002.
2. Num `CHECK`, `NULL` conta como verdadeiro (o erro já descrito em 03-dados.md).

---

## 5. Testes

```
✓ tests/unit/avaliacao.test.js                 8   regras de transição
✓ tests/bd/restricoes.test.js                 18   restrições do esquema
✓ tests/bd/resultados.test.js                  5   vista de resultados
✓ tests/integracao/autenticacao.test.js       13   login, JWT, limite, primeiro acesso, atribuição em massa
✓ tests/integracao/isolamento-permissoes.test.js 14 escolas, perfis, director de turma, coordenador
✓ tests/integracao/avaliacao.test.js          14   notas, escala, trimestre, publicação, correcção, exame, pautas, CSV
✓ tests/integracao/matriculas-faltas.test.js   9   duplicadas, capacidade, anular, mudar de turma, faltas
✓ tests/integracao/seguranca.test.js           5   helmet, CORS, erros, UUID, injecção
Tests  86 passed (86)
```

Cada ficheiro de integração cria a sua própria base de dados com o seed. Os testes não dependem uns dos outros e correm no GitHub Actions sem um servidor PostgreSQL.

---

## 6. Correr localmente

```bash
cd api
cp .env.example .env    # DATABASE_URL e JWT_SECRET (≥ 32 caracteres)
npm install
npm run migrar          # aplica 001 e 002
npm run seed            # 2 escolas fictícias; palavra-passe Teste#2026
npm run dev             # http://localhost:3000/api/v1
```

Exemplo com `curl`:

```bash
TOKEN=$(curl -s localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"director@lda101.test","palavraPasse":"Teste#2026"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s localhost:3000/api/v1/turmas -H "Authorization: Bearer $TOKEN"
```

---

## 7. Por verificar
- [ ] Correr `npm run migrar`, `npm run seed` e `npm run dev` contra um PostgreSQL real (local ou Neon). Os testes usam o PGlite, que é PostgreSQL 16, mas ainda não houve uma execução contra um servidor real.
- [x] Rotas desejáveis: estágio e TFC (RF40–RF43) e painel (RF38), com 9 testes de integração.
