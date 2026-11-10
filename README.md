# Sistema de Gestão Escolar (Angola)

Projecto final de Desenvolvimento Web Avançado. É uma plataforma web para **várias escolas**, segundo o sistema de ensino angolano:

| Nível | Classes |
|---|---|
| Ensino Primário | Iniciação e 1.ª a 6.ª |
| I Ciclo do Ensino Secundário | 7.ª a 9.ª |
| II Ciclo, Ensino Geral | 10.ª a 12.ª |
| II Ciclo, Técnico-Profissional | 10.ª a 13.ª (a 13.ª é de estágio e TFC) |

## Stack

| Camada | Tecnologia | Alojamento |
|---|---|---|
| Front-end | Vue 3, Vite, Vue Router, Pinia, Bootstrap | GitHub Pages |
| API | Node.js 24, Express 5, Zod, JWT | Render |
| Base de dados | PostgreSQL 16 | Neon |

## Documentação

| Fase | Documento | Estado |
|---|---|---|
| 0. Enquadramento | [docs/00-enquadramento.md](docs/00-enquadramento.md) | Aprovado |
| 1. Requisitos | [docs/01-requisitos.md](docs/01-requisitos.md) | Aprovado |
| 2. Arquitectura e contrato | [docs/02-arquitetura.md](docs/02-arquitetura.md) · [docs/openapi.yaml](docs/openapi.yaml) | Aprovado |
| 3. Dados (PostgreSQL) | [docs/03-dados.md](docs/03-dados.md) | Aprovado |
| 4. Back-end | [docs/04-backend.md](docs/04-backend.md) | Aprovado |
| 5. Front-end | [docs/05-frontend.md](docs/05-frontend.md) | Aprovado |
| 6. Publicação | [docs/06-publicacao.md](docs/06-publicacao.md) | Publicado |
| Resumo do MVP | [docs/07-funcionalidades.md](docs/07-funcionalidades.md) | Actualizado |

## Experimentar já (sem instalar o PostgreSQL)

```bash
cd api && npm install && npm run dev:memoria     # terminal 1: API com dados fictícios
cd web && npm install && npm run dev             # terminal 2: http://localhost:5173
```

Entre com `director@lda101.test`, `secretaria@lda101.test`, `adao@lda101.test` ou `lurdes@lda101.test` (palavra-passe `Teste#2026`).

## Começar (API com PostgreSQL)

```bash
cd api
npm install
cp .env.example .env     # preencher DATABASE_URL
npm run migrar           # cria as tabelas
npm run seed             # dados fictícios de teste (só em desenvolvimento)
npm run dev              # API em http://localhost:3000/api/v1
npm test                 # 96 testes (não precisam de servidor PostgreSQL)
```

## Regras de avaliação

- **MT** = (MAC + NPP + NPT) / 3.
- **MFD** = média das 3 MT.
- **Classes de exame** (6.ª, 9.ª e 12.ª): CF = MFD × 40% + exame × 60%.
- **Arredondamento:** só na nota final de cada disciplina (9,5 → 10).
- **Transição (classes normais):** até 2 negativas, cada uma superior a 7 (escala 0–20) ou a 3,5 (escala 0–10), e nenhuma numa disciplina-chave.
- **Transição (classes de exame):** todas as disciplinas com positiva.
- **13.ª classe:** estágio e TFC, cada um com nota ≥ 10.

Os dados de teste são fictícios.

## Publicação

API no Render, base de dados no Neon e front-end no GitHub Pages. O passo a passo está em [docs/06-publicacao.md](docs/06-publicacao.md).
