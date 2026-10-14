# Matriz de Testes — Requisitos da Seção 16

> **Especificação de Cobertura e Qualidade**  
> **Referência:** Seção 16 de [.docs/REQUISITOS_MAPA_NASCENTES_DO_CARIRI.md](.docs/REQUISITOS_MAPA_NASCENTES_DO_CARIRI.md) e Seção 16 de [.docs/ARQUITETURA_RECOMENDADA_NASCENTES_DO_CARIRI.md](.docs/ARQUITETURA_RECOMENDADA_NASCENTES_DO_CARIRI.md).  
> **Rastreabilidade:** Task-9 (#53), US-5 (#52), Feature-2 (#45).

---

## 1. Visão Geral

Este documento formaliza o mapeamento dos **23 cenários mínimos de testes** estipulados na Seção 16 da especificação de requisitos do projeto **Nascentes do Cariri**.

A matriz estabelece para cada requisito:
1. Camada da aplicação (**Backend** ou **Frontend**).
2. Nível de teste (**Unitário**, **Integração** ou **E2E**).
3. Módulo funcional responsável.
4. Arquivo de teste correspondente.
5. Estado de cobertura na suíte automatizada.

---

## 2. Matriz dos 23 Cenários da Seção 16

| ID | Cenário Mínimo (Seção 16) | Camada | Nível | Módulo Funcional | Arquivo de Teste | Cobertura |
|:---|:---|:---|:---|:---|:---|:---|
| **CT-BE-01** | Login válido e inválido | Backend | Integração | Autenticação | `src/tests/integration/auth/login.test.ts` | Planejado |
| **CT-BE-02** | Bloqueio de rota administrativa sem autenticação | Backend | Integração | Autenticação / Guarda | `src/tests/integration/auth/admin-guard.test.ts` | Planejado |
| **CT-BE-03** | Arquivo vazio | Backend | Unitário | Importação TXT | `src/tests/unit/import/file-validator.test.ts` | Planejado |
| **CT-BE-04** | Extensão inválida (diferente de `.txt`) | Backend | Unitário | Sanitização e Segurança | `src/tests/unit/security/sanitizer.test.ts` | Ativo |
| **CT-BE-05** | Arquivo acima do limite (5 MB) | Backend | Unitário | Sanitização e Segurança | `src/tests/unit/security/sanitizer.test.ts` | Ativo |
| **CT-BE-06** | Cabeçalho ausente ou incorreto | Backend | Unitário | Importação TXT | `src/tests/unit/import/txt-parser.test.ts` | Planejado |
| **CT-BE-07** | Coordenada fora dos limites (Cariri) | Backend | Unitário | Domínio e Validação | `src/tests/unit/domain/nascente-validation.test.ts` | Em Implementação |
| **CT-BE-08** | Data inválida | Backend | Unitário | Domínio e Validação | `src/tests/unit/domain/nascente-validation.test.ts` | Em Implementação |
| **CT-BE-09** | Vazão negativa ou não numérica | Backend | Unitário | Domínio e Validação | `src/tests/unit/domain/nascente-validation.test.ts` | Em Implementação |
| **CT-BE-10** | Campo obrigatório vazio | Backend | Unitário | Domínio e Validação | `src/tests/unit/domain/nascente-validation.test.ts` | Em Implementação |
| **CT-BE-11** | Linha duplicada (Unique Constraint) | Backend | Integração | Persistência / Banco | `src/tests/integration/database/constraints.test.ts` | Ativo |
| **CT-BE-12** | Rollback em caso de falha | Backend | Integração | Persistência / Transação | `src/tests/integration/database/transactions.test.ts` | Em Implementação |
| **CT-BE-13** | Adição de novos registros à base após confirmação | Backend | Integração | Importação TXT | `src/tests/integration/import/import-commit.test.ts` | Planejado |
| **CT-BE-14** | Preservação dos registros de importações anteriores | Backend | Integração | Persistência / Integridade | `src/tests/integration/database/database.test.ts` | Ativo |
| **CT-BE-15** | Preservação dos arquivos TXT originais | Backend | Unitário | Storage e Sanitização | `src/tests/unit/security/sanitizer.test.ts` | Ativo |
| **CT-BE-16** | Resposta da API somente com registros ativos | Backend | Integração | API Pública | `src/tests/integration/api/nascentes.test.ts` | Planejado |
| **CT-FE-01** | Criação correta dos marcadores | Frontend | Unitário/E2E | Mapa Interativo | `src/tests/unit/mapa/markers.test.ts` | Planejado |
| **CT-FE-02** | Tooltip no mouseover | Frontend | Unitário/E2E | Mapa Interativo | `src/tests/unit/mapa/tooltip.test.ts` | Planejado |
| **CT-FE-03** | Popup no clique e toque | Frontend | Unitário/E2E | Mapa Interativo | `src/tests/unit/mapa/popup.test.ts` | Planejado |
| **CT-FE-04** | Filtros de busca e município | Frontend | Unitário/E2E | Mapa Interativo | `src/tests/unit/mapa/filters.test.ts` | Planejado |
| **CT-FE-05** | Estado sem dados (Empty state) | Frontend | Unitário | Mapa Interativo | `src/tests/unit/mapa/empty-state.test.ts` | Planejado |
| **CT-FE-06** | Estado de erro da API | Frontend | Unitário | Resiliência de Erros | `src/tests/unit/errors/api-error-handler.test.ts` | Ativo |
| **CT-FE-07** | Carregamento responsivo dentro do iframe | Frontend | Unitário/E2E | Layout e Framing | `src/tests/unit/mapa/viewport-responsive.test.ts` | Em Implementação |

---

## 3. Detalhamento dos Cenários e Regras de Cobertura

### 3.1. Sanitização, Segurança e Limites de Arquivo (`CT-BE-04`, `CT-BE-05`, `CT-BE-15`)
* **Arquivo:** `src/tests/unit/security/sanitizer.test.ts`
* **Regras Verificadas:**
  - Nomes de arquivo rejeitam extensões executáveis, caracteres de *path traversal* (`../`, `..\\`), bytes nulos e identificadores reservados do sistema operacional (ex: CON, PRN, AUX).
  - Normalização da extensão exclusivamente para `.txt`.
  - Geração de caminhos privados com timestamp e sufixo aleatório único para garantir a preservação de arquivos com o mesmo nome original sem risco de sobrescrita no storage.
  - Validação de limite máximo de upload em 5 MB (`MAX_UPLOAD_SIZE_BYTES`).

### 3.2. Regras de Domínio e Validações de Nascentes (`CT-BE-07`, `CT-BE-08`, `CT-BE-09`, `CT-BE-10`)
* **Arquivo:** `src/tests/unit/domain/nascente-validation.test.ts`
* **Regras Verificadas:**
  - Latitude: intervalo de validade $[-8.0, -6.5]$.
  - Longitude: intervalo de validade $[-40.5, -38.5]$.
  - Vazão Média: valor numérico $\ge 0$ (rejeita números negativos e `NaN`).
  - Data de Criação: formato cronológico válido no passado ou presente.
  - Campos obrigatórios: presença mandatória de `latitude`, `longitude`, `municipio` e `fonte`.

### 3.3. Integridade do Banco e Persistência (`CT-BE-11`, `CT-BE-12`, `CT-BE-14`)
* **Arquivos:**
  - `src/tests/integration/database/constraints.test.ts`
  - `src/tests/integration/database/transactions.test.ts`
  - `src/tests/integration/database/database.test.ts`
* **Regras Verificadas:**
  - Regra de duplicidade: Unique Constraint composta `[latitude, longitude, fonte]` rejeitando reinserções com erro `P2002`.
  - Integridade referencial: Restrição de exclusão (`onDelete: Restrict`) impedindo exclusão acidental de `Usuario` vinculado a `Importacao` e `Importacao` vinculada a `Nascente`.
  - Atomicidade transacional: Execuções via `prisma.$transaction` garantindo rollback integral quando ocorre erro intermediário no lote.

### 3.4. Resiliência de Erros e Responsividade em Iframe (`CT-FE-06`, `CT-FE-07`)
* **Arquivos:**
  - `src/tests/unit/errors/api-error-handler.test.ts`
  - `src/tests/unit/mapa/viewport-responsive.test.ts`
  - `src/tests/unit/mapa/layout.test.ts`
* **Regras Verificadas:**
  - Respostas da API formatadas sem vazamento de detalhes internos ou stack traces em ambiente de produção.
  - Renderização fluida da rota pública `/mapa` sob simulação de viewport desktop (1920x1080) e móvel (375x667).
  - Isolamento estrito de framing com cabeçalhos CSP autorizando exclusivamente o domínio institucional da UFCA.

---

## 4. Scripts Automatizados

```bash
# Suíte completa
npm test

# Modo interativo (watch)
npm run test:watch

# Testes unitários (sem dependência do MySQL)
npm run test:unit

# Testes de integração (requer MySQL local/Docker)
npm run test:integration
```
