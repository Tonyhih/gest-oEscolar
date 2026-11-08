# Fase 6: Publicação e operação

**Projeto:** Sistema de Gestão Escolar (Angola, várias escolas)
**Estado:** pronto a publicar (faltam os passos nas contas do autor)
**Data:** 2026-11-08

```mermaid
flowchart LR
    U[Utilizadores] -->|HTTPS| GP[GitHub Pages<br/>tonyhih.github.io/gest-oescolar]
    GP -->|HTTPS + JWT| R[Render<br/>gestao-escolar-api<br/>Frankfurt]
    R -->|TLS| N[(Neon PostgreSQL<br/>Frankfurt)]
    GH[GitHub Actions] -->|testes + publicação| GP
    GH -->|autoDeploy do main| R
```

> ⚠️ As condições dos planos gratuitos (Neon, Render e GitHub Pages) mudam com frequência. Confirme-as nos sites antes da defesa. Os valores aqui são os conhecidos à data deste documento.

---

## 1. O que foi preparado no repositório

| Ficheiro | Para quê |
|---|---|
| `render.yaml` | Blueprint do Render: serviço `gestao-escolar-api`, Node 24, região Frankfurt, verificação em `/api/v1/saude`, `JWT_SECRET` gerado pelo Render |
| `api/package.json` → `migrar:producao`, `start` | No arranque, o Render aplica as migrações novas (idempotente) e inicia a API |
| `api/scripts/criar-admin.js` | Cria o primeiro administrador da plataforma em produção (não há seed em produção) |
| `api/scripts/copia-seguranca.sh` | Cópia de segurança semanal com `pg_dump`, verificação e remoção das cópias com mais de 90 dias |
| `.github/workflows/web.yml` | Testa e publica o front-end no GitHub Pages a partir do `main` |
| `.github/dependabot.yml` | Revisão mensal das dependências (npm e GitHub Actions) |
| `web/src/views/PrivacidadeView.vue` | Política de privacidade (Lei n.º 22/11), visível sem sessão |

### Verificações feitas antes de publicar
- **Dependências:** `npm audit` encontrou vulnerabilidades críticas no `tar` (através do `bcrypt` 5) e altas no `zod` 3. Foram actualizados para o `bcrypt` 6 e o `zod` 4. Agora há **0 vulnerabilidades** em produção, na API e no front-end, e os 87 testes da API passam.
- **Driver `pg` real:** as migrações, o seed e o `servidor.js` correram com o driver `pg` através do protocolo PostgreSQL (servidor `pglite-socket`):
  - as duas migrações aplicaram-se, e uma segunda execução não refez nada;
  - a pauta deu as situações esperadas;
  - as datas chegaram sem desvio de fuso horário;
  - o CORS autorizou `https://tonyhih.github.io`.
- **Ainda não foi testado:** a ligação TLS ao Neon. Testa-se no passo 1.

---

## 2. Passo a passo (faça por esta ordem)

### Passo 1: Base de dados no Neon
1. Crie uma conta em neon.tech e um projecto `gestao-escolar`:
   - **PostgreSQL 16 ou superior**;
   - região **AWS Europe (Frankfurt)**, a mesma do Render, para a API e a base de dados ficarem perto uma da outra.
2. Crie a base de dados `gestao_escolar`.
3. Em **Connect**, copie a cadeia de ligação **directa** (sem `-pooler`). Deve terminar em `?sslmode=require`.
4. No seu computador, teste a ligação e crie o administrador:
   ```bash
   cd api && npm install
   export DATABASE_URL='postgresql://…neon.tech/gestao_escolar?sslmode=require' NODE_ENV=production
   npm run migrar:producao                     # cria as tabelas (o Render volta a correr isto; não faz mal)
   ADMIN_NOME='O Seu Nome' ADMIN_EMAIL='o.seu.email@…' npm run criar-admin
   ```
   **Anote a palavra-passe provisória:** é mostrada uma única vez.
   **Não corra `npm run seed` em produção:** o script recusa-se a correr com `NODE_ENV=production`.

### Passo 2: Juntar os ramos ao `main`
O Render e o GitHub Pages publicam a partir do `main`. Abra um pull request de `fase-6-publicacao` para `main`. Este ramo contém as Fases 4, 5 e 6. Depois de os testes passarem, faça o merge.

### Passo 3: API no Render
1. Crie uma conta em render.com e ligue-a ao GitHub.
2. Faça **New → Blueprint** e escolha o repositório `gest-oescolar`. O Render lê o `render.yaml`.
3. Preencha as duas variáveis que pede:
   - `DATABASE_URL`: a cadeia do Neon do passo 1.
   - `CORS_ORIGENS`: `https://tonyhih.github.io`. Só a origem, **sem** `/gest-oescolar` e sem barra final.
4. Espere pelo primeiro deploy e abra `https://gestao-escolar-api.onrender.com/api/v1/saude`. O nome pode ter um sufixo; veja-o no painel. A resposta tem de ser `{"estado":"ok"}`.

### Passo 4: Front-end no GitHub Pages
1. No GitHub, abra **Settings → Pages → Source** e escolha **GitHub Actions**.
2. Abra **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   - nome `VITE_API_URL`;
   - valor `https://gestao-escolar-api.onrender.com/api/v1` (com o nome real do passo 3).
3. Abra **Actions → Front-end (testes e GitHub Pages) → Run workflow**, no ramo `main`.
4. Abra `https://tonyhih.github.io/gest-oescolar/`.

### Passo 5: Primeiro uso
1. Entre com o email do administrador e a palavra-passe provisória, e troque a palavra-passe.
2. Em **Escolas**, registe a escola e crie a conta do director. Entregue-lhe a palavra-passe provisória.
3. O director entra, troca a palavra-passe e configura a escola, por esta ordem:
   1. ano lectivo e trimestres;
   2. classes;
   3. cursos e disciplinas;
   4. planos curriculares;
   5. utilizadores;
   6. turmas e atribuições.
4. A secretaria regista os alunos e faz as matrículas. Os professores lançam as notas.

---

## 3. Verificação depois de publicar

| # | Verificação | Como | Esperado |
|---|---|---|---|
| 1 | API viva | Abrir `/api/v1/saude` | `{"estado":"ok"}` |
| 2 | HTTPS | Abrir os dois endereços com `http://` | Redirecciona para `https://` |
| 3 | Login errado | Entrar com uma palavra-passe errada | "Email ou palavra-passe incorrectos." |
| 4 | Limite de tentativas | 6 tentativas erradas seguidas | À 6.ª: "Demasiadas tentativas" (429) |
| 5 | CORS | Na consola de outro site: `fetch('https://…onrender.com/api/v1/saude')` | Bloqueado pelo browser |
| 6 | Troca obrigatória | Primeiro acesso com uma palavra-passe provisória | Vai directo para "Alterar palavra-passe" |
| 7 | Recarregar a página | F5 em `…/gest-oescolar/#/turmas` | Abre a mesma página (sem 404) |
| 8 | Telemóvel | Abrir no telemóvel e lançar notas | A grelha cabe no ecrã |
| 9 | Arranque a frio | Abrir depois de 15 min sem uso | Primeiro pedido lento (até ~1 min), depois normal |
| 10 | Segredos | Procurar `DATABASE_URL` e `JWT_SECRET` no GitHub | Não aparecem em nenhum ficheiro |

---

## 4. Operação

### Cópias de segurança (RNF11)
- **Todas as semanas**, no seu computador:
  ```bash
  DATABASE_URL='…' ./api/scripts/copia-seguranca.sh
  ```
  As cópias ficam em `~/copias-gestao-escolar`, com permissões só para o seu utilizador. Têm dados de menores: guarde-as num disco cifrado, **nunca no GitHub**.
- **Todos os meses**, faça um teste de reposição: crie uma base de dados de testes no Neon (um *branch*) e corra o comando indicado no fim do script. Confirme que a pauta de uma turma é igual à de produção.
- O Neon também guarda um histórico curto para recuperação a um momento anterior. Confirme o período no plano gratuito ⚠️.

### Registos e erros
- **Render → Logs:** os erros 500 aparecem com o detalhe completo. O utilizador só vê "Erro interno.".
- **Auditoria** (ecrã do director): quem alterou notas, matrículas e faltas, e quando.

### Actualizações
- **Dependabot:** abre pull requests mensais. Junte-os só se os testes do GitHub Actions passarem.
- **Alterações à base de dados:** sempre como uma nova migração (`migrations/003_….sql`), nunca editando uma migração já aplicada. O Render aplica-a no arranque seguinte.

### Incidentes
| Situação | O que fazer |
|---|---|
| O `JWT_SECRET` foi exposto | Render → Environment → gerar um novo valor → redeploy. Todas as sessões terminam |
| A palavra-passe da base de dados foi exposta | Neon → Roles → repor a palavra-passe → actualizar `DATABASE_URL` no Render |
| Uma conta foi usada indevidamente | O director desactiva o utilizador, consulta a auditoria e corrige as notas com justificação |
| A API não responde | Verificar `/saude` e os logs do Render; o plano gratuito pode estar suspenso por excesso de horas |

### Pedidos sobre dados pessoais (Lei n.º 22/11)
| Pedido | Procedimento |
|---|---|
| **Acesso** | A secretaria abre a ficha do aluno, imprime-a com a pauta e entrega-a ao encarregado ou ao aluno maior de idade |
| **Rectificação** | A secretaria corrige os dados pessoais na ficha. As notas são corrigidas pelo director, com justificação |
| **Eliminação** | O aluno passa a "inactivo". Matrículas, notas e pautas **não se apagam**, porque fazem parte do arquivo escolar. Os dados pessoais não essenciais (morada, telefone, documento) podem ser apagados na ficha |

⚠️ O prazo de conservação do arquivo escolar e o procedimento junto da APD (Agência de Protecção de Dados) têm de ser validados por um jurista ou pela escola. O texto da política de privacidade é uma proposta.

---

## 5. Limitações conhecidas (decisões documentadas)

| Limitação | Impacto | Mitigação |
|---|---|---|
| O Render gratuito suspende a API após 15 min sem pedidos ⚠️ | O primeiro pedido demora até ~1 min | Aceitável num projecto académico; num uso real, passar ao plano pago |
| O Render gratuito tem um limite mensal de horas ⚠️ | Um só serviço cabe no limite | Não criar mais serviços na mesma conta |
| Não há envio de email | As palavras-passe provisórias são entregues em mão | Fora do âmbito do MVP |
| O GitHub Pages não permite definir cabeçalhos HTTP | Sem CSP no front-end | A API tem o helmet; o Vue escapa o HTML; o token fica em `sessionStorage` |
| Estágio, TFC (RF40–43) e painel (RF38) sem ecrãs | Registados pela base de dados e mostrados na pauta da 13.ª | Próxima iteração |

---

## 6. Checklist global do projecto

- [x] **Fase 0:** âmbito do MVP definido (Angola, várias escolas, 60 dias, sem pagamentos)
- [x] **Fase 1:** 43 requisitos funcionais, 11 não funcionais, 18 regras de negócio com exemplos
- [x] **Fase 2:** arquitectura e contrato OpenAPI 3.1 validado
- [x] **Fase 3:** PostgreSQL com isolamento entre escolas, restrições e cálculo exacto das notas
- [x] **Fase 4:** API com 63 rotas e 87 testes (unitários, base de dados, integração)
- [x] **Fase 5:** front-end com 15 ecrãs, 13 testes unitários e 16 fluxos testados no browser
- [x] **Fase 6:** ficheiros de publicação, dependências sem vulnerabilidades, política de privacidade, cópias de segurança, guia de operação
- [ ] **Publicação real:** passos 1 a 5 acima (nas contas do autor)
- [ ] **Validações externas:** regras de avaliação com o professor; prazos de conservação e política de privacidade com um jurista

---

## 7. Registo de decisões (Fases 4 a 6)

| Data | Decisão | Motivo |
|---|---|---|
| 2026-11-08 | Faltas desmarcadas passam a "anulada" (migração 002) | Os dados académicos nunca se apagam (RNF04) |
| 2026-11-08 | SQL nos serviços, sem camada de repositórios | As consultas são específicas; menos código repetido |
| 2026-11-08 | `npm run dev:memoria` com PGlite | Demonstrações e desenvolvimento sem instalar o PostgreSQL |
| 2026-11-08 | `bcrypt` 6 e `zod` 4 | Vulnerabilidades críticas e altas nas versões anteriores |
| 2026-11-08 | Neon e Render na região de Frankfurt | Mais perto de Angola entre as regiões gratuitas, e ambos na mesma região |
| 2026-11-08 | Migrações aplicadas no arranque do Render | O plano gratuito não tem comando de pré-deploy; as migrações são idempotentes |
| 2026-11-08 | Primeiro administrador criado por script local | Em produção não há seed; a palavra-passe provisória obriga a troca |
| 2026-11-08 | Cópias de segurança locais, fora do GitHub | Contêm dados de menores |
