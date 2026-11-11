# Fase 5: Front-end (Vue 3)

**Projeto:** Sistema de Gestão Escolar (Angola, várias escolas)
**Estado:** proposta para aprovação
**Data:** 2026-11-08
**Código:** [web/src](../web/src)

---

## 1. O que está feito

- **SPA em Vue 3, Vite, Vue Router, Pinia e Bootstrap 5.3**, com 22 ecrãs (mais 6 separadores na configuração) cobrindo todos os requisitos.
- **19 testes unitários** (Vitest): cliente HTTP, guardas de rota e formatação.
- **Teste no browser** (`web/e2e/fluxos.cjs`, Playwright) com **39 passos** reais: secretaria, professores, director de turma, director, coordenação, administrador da plataforma, encarregada de educação no portal e uma professora num telemóvel de 360 px. Todos passam, sem erros na consola (além dos 401 e 409 provocados de propósito).
- **Primeira página leve:** cada ecrã é carregado só quando é aberto.

### Ecrãs por perfil

| Perfil | Ecrãs |
|---|---|
| Administração da plataforma | Escolas (registar, activar/desactivar, criar a conta do director com palavra-passe provisória) |
| Director(a) | Painel, configuração (ano lectivo e trimestres, classes e regras de avaliação, cursos, disciplinas, planos curriculares, tempos lectivos, dados da escola e limite de faltas para o aviso), utilizadores, turmas e atribuições, horários, pautas, publicação, correcção de notas, faltas e anulação de faltas vermelhas, pagamentos (preçário, gerar propinas, anular recibos e cobranças), auditoria |
| Secretaria | Matrículas (ficha de aluno novo, importação de listas, lista do ano), alunos (ficha, encarregados, contas do portal, histórico escolar, termo, declarações, certificados), pagamentos (receber e emitir recibo, dívidas, resumo do mês), estágios, exames |
| Coordenação | Cursos, disciplinas, planos curriculares, atribuição de professores, horários, pautas, estágios e TFC (notas) |
| Professor(a) | As minhas turmas, o meu horário, lançamento de notas (MAC/NPP/NPT) e exames, faltas por aula e faltas vermelhas, avaliação descritiva na Iniciação, mini-pauta em PDF |
| Director(a) de turma | Além do professor: pautas, publicação do trimestre, resumo de faltas, justificação de faltas, fichas dos alunos da turma |
| Encarregado(a) e aluno(a) | Portal: avisos, notas publicadas, situação no fim do ano, horário, propinas e recibos, faltas (incluindo as vermelhas) |

---

## 2. Organização

```
web/src/
  api/cliente.js            único ponto de acesso à API (token, erros, sem rede → estado 0, CSV)
  stores/autenticacao.js    sessão em Pinia; token em sessionStorage; iniciar() antes de montar
  router/index.js           rotas com meta.perfis; hash history; vistas com import() dinâmico
  composables/usePedido.js  estados de carregamento, erro e dados; useAccao para gravar
  components/               EstadoPedido (carregamento/vazio/erro), MensagemAccao (erros de validação)
  util/formatar.js          vírgula decimal, dd/mm/aaaa, turnos e situações
  views/                    um ficheiro por ecrã; configuracao/ com os separadores
```

**Regras seguidas:**
- **Nenhum ecrã usa `fetch` directamente.** Tudo passa por `api/cliente.js`. Um 401 termina a sessão e volta ao login. Um `403 TROCAR_PALAVRA_PASSE` leva ao ecrã de troca obrigatória.
- **A guarda de rotas não é segurança.** Só evita mostrar ecrãs inúteis para o perfil. A API verifica sempre as permissões.
- **Todos os ecrãs com dados** mostram os quatro estados: a carregar, erro (com "Tentar de novo"), vazio e conteúdo.
- **As médias oficiais vêm sempre da API.** No lançamento de notas, a MT que aparece enquanto o professor escreve é só uma previsão. A MT oficial é calculada pela base de dados ao gravar (12,5 → 12,5 no teste).

---

## 3. Pormenores pensados para as escolas

- **Vírgula decimal:** o professor pode escrever "12,5". As células fora da escala da classe (0–10 ou 0–20) ficam a vermelho e o botão de gravar fica desactivado.
- **Telemóvel (RNF07):** a grelha de notas cabe em 360 px sem deslizar a página (verificado no teste do browser).
- **Faltas:** o professor marca quem faltou numa lista de caixas. Desmarcar anula a falta, sem a apagar.
- **Pautas:** disciplinas-chave assinaladas com `*`, negativas a vermelho, contagem de quem transita, motivo de não transitar ao passar o rato, impressão em A4 horizontal e exportação CSV que abre no Excel com acentos.
- **Palavras-passe provisórias:** são mostradas uma única vez, com aviso para as anotar.
- **Acessibilidade (WCAG 2.2):**
  - ligação "Saltar para o conteúdo";
  - foco visível a amarelo;
  - rótulos em todos os campos, incluindo cada célula da grelha ("MAC de Graça Lukeny");
  - verde #198754 com contraste 4,5:1 sobre branco;
  - tema escuro automático.

---

## 4. Alterações à API nesta fase

| Alteração | Motivo |
|---|---|
| `GET /alunos/:id` devolve as matrículas do aluno | A confirmação de matrícula precisa da matrícula anterior |
| A sessão (`/auth/eu`, login) inclui `professorId` | O ecrã da turma identifica as disciplinas do professor |
| A grelha de notas inclui a nota de exame já lançada | O ecrã de exames mostra os valores actuais |
| `npm run dev:memoria` na API | API com PostgreSQL em memória e o seed, sem instalar nada (demonstrações e desenvolvimento) |

Os 86 testes da API continuam a passar.

---

## 5. Correr localmente

```bash
# Terminal 1: API com dados de teste em memória
cd api && npm install && npm run dev:memoria

# Terminal 2: front-end
cd web && npm install && npm run dev        # http://localhost:5173
```

Utilizadores de teste (palavra-passe `Teste#2026`):

| Email | Perfil |
|---|---|
| admin@plataforma.test | Administração da plataforma |
| director@lda101.test | Director (escola de Luanda) |
| secretaria@lda101.test | Secretaria |
| lurdes@lda101.test | Professora (LP, HIS, GEO, EMC); directora da Iniciação A e da 6.ª A |
| adao@lda101.test | Professor (MAT, CN, FIS); director da 7.ª A e da 9.ª A |
| marta@hbo201.test | Professora do técnico-profissional (MAT, TIC, PROG) |

## 6. Publicação (GitHub Pages)

O workflow `.github/workflows/web.yml` testa e compila em cada push. A partir do `main`, também publica no GitHub Pages. Antes, é preciso:
1. Em **Settings → Pages**, escolher **GitHub Actions** como origem.
2. Só se o serviço no Render tiver outro nome: em **Settings → Secrets and variables → Actions → Variables**, criar `VITE_API_URL`. Por omissão, usa-se `https://gestao-escolar-api.onrender.com/api/v1` (Fase 6).

---

## 7. Por verificar
- [ ] Testar com utilizadores reais (um professor e a secretaria) e recolher sugestões.
- [x] Ecrãs desejáveis: estágio e TFC, painel do director.
