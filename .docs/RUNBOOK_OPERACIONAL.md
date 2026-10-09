# Runbook Operacional — Implantação, Rollback, Backup e Monitoramento
---

## 1. Visão Geral e Ambientes

A aplicação opera em modelo full-stack no **Next.js**, projetada primariamente para execução na **Vercel** com **MySQL 8 externo** e **Vercel Blob privado**, mantendo compatibilidade documentada com execução self-hosted via **Docker Compose + Nginx**.

### 1.1 Topologia de Produção Oficial

```text
[Visitante / UFCA Iframe]
           │ HTTPS
           ▼
[Vercel Edge Network / CDN]
           │
           ▼
[Next.js App Router (Serverless)] ──► [Vercel Blob Store Privado (Arquivos TXT)]
           │ Prisma (TCP 3306)
           ▼
[Serviço MySQL 8.4 Externo (com Connection Pooling)]
```

### 1.2 Segregação de Ambientes

| Ambiente | Plataforma | Banco de Dados | Vercel Blob | Finalidade |
| :--- | :--- | :--- | :--- | :--- |
| **Development** | Local / Docker Compose (`localhost:8080`) | MySQL local container (`3306`) | Mock local ou store isolado de dev | Desenvolvimento ativo e testes unitários/integrados. |
| **Preview** | Vercel Preview Deployments (gerado por Pull Request) | MySQL de staging/homologação dedicado | Store de staging isolado | Validação funcional de PRs. **Nunca conectar ao banco ou blob de produção.** |
| **Production** | Vercel Production (`main`) | MySQL 8.4 externo com pooling e TLS | Store de produção privado | Produção atendendo a `nascentesdocariri.bessapontes.com.br`. |

---

## 2. Variáveis de Ambiente e Gestão de Segredos

Todas as variáveis do servidor são estritamente validadas na inicialização via schema Zod.

### 2.1 Matriz de Configuração Obrigatória

| Variável | Escopo | Descrição / Exemplo Seguro |
| :--- | :---: | :--- |
| `NODE_ENV` | Servidor | `production`, `development` ou `test`. *(Nota: na Vercel, tanto Preview quanto Production executam com `production` para otimização de bundle).* |
| `VERCEL_ENV` | Servidor | `production`, `preview` ou `development`. *(Variável de sistema da Vercel para identificar o ambiente do deployment).* |
| `DATABASE_URL` | Servidor | `mysql://<app_user>:<senha_url_encoded>@<host_mysql>:3306/<database>?sslaccept=strict` |
| `APP_URL` | Servidor | `https://nascentesdocariri.bessapontes.com.br` |
| `AUTH_URL` | Servidor | `https://nascentesdocariri.bessapontes.com.br` |
| `AUTH_SECRET` | Servidor | Chave criptográfica com mínimo 32 bytes gerada via `openssl rand -base64 32`. |
| `BLOB_READ_WRITE_TOKEN` | Servidor | Token de leitura/escrita privada gerado pelo Vercel Blob Storage. |
| `MAX_UPLOAD_SIZE_BYTES` | Servidor | Teto de arquivo TXT: `5242880` (5 MB). |
| `NEXT_PUBLIC_TILE_URL` | Público | URL template do provedor de tiles OpenStreetMap (ver pendência 19.2.3). |
| `NEXT_PUBLIC_TILE_ATTRIBUTION` | Público | `&copy; OpenStreetMap contributors` |
| `NEXT_PUBLIC_TILE_MAX_ZOOM` | Público | `19` |
| `NEXT_PUBLIC_MAP_DEFAULT_LAT` | Público | Latitude inicial centralizada no Cariri (padrão: `-7.23456789`). |
| `NEXT_PUBLIC_MAP_DEFAULT_LNG` | Público | Longitude inicial centralizada no Cariri (padrão: `-39.12345678`). |
| `NEXT_PUBLIC_MAP_DEFAULT_ZOOM` | Público | Nível de zoom inicial (padrão: `10`). |


> **REGRA DE SEGURANÇA INVIOLÁVEL:**  
> Jamais aplique o prefixo `NEXT_PUBLIC_` em `DATABASE_URL`, `AUTH_SECRET` ou `BLOB_READ_WRITE_TOKEN`. Segredos de infraestrutura devem ser configurados exclusivamente nas variáveis secretas de ambiente da Vercel ou no `.env` do servidor host fora do controle de versão.

---

## 3. Procedimento de Deploy e Promoção de Versões

O ciclo de entrega contínua segue o fluxo Gitflow integrado à Vercel:

```text
Feature/Task Branch ──(PR)──► develop ──(Preview Deployment)──► Homologação ──(PR)──► main ──► Produção
```

### 3.1 Pré-requisitos de Publicação
Antes de autorizar o merge para `main`, o operador deve verificar se:
1. `npm run lint` passou com 0 erros.
2. `npx tsc --noEmit` passou com 0 erros em modo estrito (`strict: true`).
3. `npx vitest run` passou com 100% de sucesso em todas as suítes de teste.
4. `npm run build` gerou o artefato de produção sem advertências de empacotamento.

### 3.2 Execução de Migrações de Banco de Dados
O Prisma ORM gerencia migrações versionadas em `prisma/migrations/`.

1. **Em ambiente de Produção:**  
   Nunca utilize `prisma db push`. O comando oficial de aplicação é:
   ```bash
   npx prisma migrate deploy
   ```
2. **Momento da execução:**  
   As migrações devem ser executadas **imediatamente antes** da ativação do novo deployment da Vercel (via pipeline de release do GitHub Actions ou comando operacional autenticado).
3. **Provisionamento do Administrador Inicial (Seed):**  
   Em ambiente recém-implantado onde o banco esteja vazio, execute o seed seguro:
   ```bash
   npm run db:seed
   ```
   *Nota: O seed utiliza as variáveis `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `ADMIN_NAME` e não sobrescreve administradores já existentes.*

---

## 4. Procedimento de Rollback

Caso um deployment introduza falhas funcionais, erros 500 ou indisponibilidade, siga os procedimentos abaixo:

### 4.1 Rollback da Aplicação (Vercel)
A Vercel mantém deployments imutáveis anteriores prontos para restauração instantânea.

1. Acesse o **Dashboard da Vercel** $\rightarrow$ Projeto `nascentes-do-cariri` $\rightarrow$ Aba **Deployments**.
2. Localize o último deployment estável anterior que funcionava perfeitamente.
3. Clique no menu de contexto `...` e selecione **Instant Rollback** (ou **Promote to Production**).
4. O tráfego do domínio `nascentesdocariri.bessapontes.com.br` será redirecionado para a versão estável.

*Via Vercel CLI:*
```bash
vercel rollback [DEPLOYMENT_ID_ANTERIOR] --token=$VERCEL_TOKEN
```

### 4.2 Rollback de Migrações do Banco de Dados (MySQL)
O Prisma não possui rollback automático. Portanto:

1. Se a nova versão adicionou apenas colunas *nullable* ou novas tabelas independentes (aditivas), **não execute rollback no banco**; a versão antiga do código continuará funcionando normalmente com o schema expandido.
2. Se a migração quebrou compatibilidade e precisa ser revertida:
   - Identifique a migration com falha em `prisma/migrations/`.
   - Aplique o script SQL compensatório de reversão previamente validado pela equipe de DBA:
     ```bash
     mysql -h <host_mysql> -u <app_user> -p <database> < migrations/rollback_script.sql
     ```
   - Atualize a tabela de controle de migrações do Prisma:
     ```bash
     npx prisma migrate resolve --rolled-back <nome_da_migration>
     ```

---

## 5. Política de Backup Conjunto (MySQL + Vercel Blob)

### 5.1 O Princípio da Atomicidade Conjunta
Os dados do sistema possuem dependência bidirecional estrita:
- O **MySQL** armazena o histórico (`importacoes`), metadados de auditoria e o hash SHA-256.
- O **Vercel Blob** armazena os arquivos físicos `.txt` originais correspondentes a cada importação.

> **Regra de Continuidade:** Um backup isolado do MySQL sem os Blobs é incompleto; um backup dos Blobs sem o banco de dados é ilegível. Ambos devem ser respaldados de forma coordenada.

### 5.2 Parâmetros de Continuidade (SLA Operacional)
- **RPO (Recovery Point Objective):** Máximo de **24 horas** (perda tolerável limitada ao ciclo diário de backup).
- **RTO (Recovery Time Objective):** Máximo de **2 horas** para restabelecimento total da operação após desastre.
- **Retenção de Backups:** Backups diários retidos por **30 dias**; backups mensais retidos por **1 ano**.

### 5.3 Procedimento de Extração do Backup (Snapshot Diário)

1. **Backup Lógico do MySQL 8:**
   Execute o dump consistente com transação única (sem travar leituras no InnoDB):
   ```bash
   mysqldump -h <host_mysql> -u <app_user> -p \
     --single-transaction \
     --quick \
     --routines \
     --triggers \
     --default-character-set=utf8mb4 \
     nascentes_do_cariri | gzip > "backup_mysql_$(date +%Y%m%d_%H%M%S).sql.gz"
   ```

2. **Backup/Espelhamento dos Arquivos Vercel Blob:**
   Utilize script ou CLI da Vercel para sincronizar todos os blobs existentes no store privado para um bucket seguro de armazenamento a frio:
   ```bash
   # Exemplo conceitual de espelhamento dos blobs preservados
   npx @vercel/blob download --token=$BLOB_READ_WRITE_TOKEN --output-dir="./backup_blobs_$(date +%Y%m%d)/"
   ```

---

## 6. Procedimento de Ensaio de Restauração (Disaster Recovery)

Este procedimento deve ser ensaiado periodicamente em ambiente isolado (não produtivo) para validar a eficácia do backup.

### Roteiro de Restauração:

1. **Passo 1: Provisionar o Banco de Teste Limpo**
   ```bash
   mysql -h <host_teste> -u root -p -e "DROP DATABASE IF EXISTS nascentes_teste; CREATE DATABASE nascentes_teste CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
   ```

2. **Passo 2: Restaurar o Dump SQL**
   ```bash
   gunzip < backup_mysql_YYYYMMDD_HHMMSS.sql.gz | mysql -h <host_teste> -u <app_user> -p nascentes_teste
   ```

3. **Passo 3: Validar a Integridade das Migrações e Índices**
   ```bash
   DATABASE_URL="mysql://<user>:<pass>@<host_teste>:3306/nascentes_teste" npx prisma migrate status
   ```

4. **Passo 4: Reidratação do Storage de Arquivos (Restore dos Blobs)**
   Em caso de perda total ou recriação do store privado na nuvem, os arquivos físicos `.txt` do backup devem ser reenviados para o Vercel Blob antes de validar a consistência.
   - Cada arquivo do backup local deve ser carregado preservando estritamente:
     1. O **pathname original** cadastrado na coluna `caminho_privado_arquivo` (ex: `importacoes/1728475200000-abc1234-nascentes.txt`).
     2. O nível de visibilidade privado (`access: 'private'`).
     3. A desabilitação de sufixos aleatórios automáticos (`addRandomSuffix: false`), para garantir correspondência exata com o banco de dados.

   *Exemplo conceitual de script de reidratação:*
   ```bash
   # Reidratar todos os blobs preservados no backup físico para o novo store privado
   node scripts/rehydrate-blobs.mjs --dir="./backup_blobs_YYYYMMDD" --token=$BLOB_READ_WRITE_TOKEN
   ```

5. **Passo 5: Validação Cruzada de Consistência (Banco vs Storage)**
   Após a restauração do MySQL e a reidratação dos arquivos no Vercel Blob, execute a consulta de verificação no banco de teste:
   ```sql
   SELECT id, nome_arquivo, caminho_privado_arquivo, hash_arquivo, status 
   FROM importacoes 
   WHERE status = 'CONCLUIDA';
   ```
   Certifique-se de que 100% dos registros com status `CONCLUIDA`:
   - Possuem o arquivo físico acessível no Vercel Blob no caminho exato apontado por `caminho_privado_arquivo`.
   - O hash SHA-256 do arquivo reidratado coincide perfeitamente com o valor armazenado em `hash_arquivo`.

---

## 7. Monitoramento, Alertas e Gestão de Capacidade

A observabilidade da aplicação é composta por três camadas integradas:

### 7.1 Métricas de Aplicação e Uptime
- **Endpoint de Saúde (Liveness):**
  - URL: `https://nascentesdocariri.bessapontes.com.br/api/health`
  - Resposta Esperada: `200 OK` $\rightarrow$ `{"status":"ok"}`
  - Ferramenta recomendada: Monitor externo com checagem a cada 1 minuto (ex: Uptime Kuma, Better Uptime ou Vercel Checks).
  - Alerta de Incidente: Disparo caso o endpoint falhe por mais de 2 minutos consecutivos.

### 7.2 Métricas de Banco de Dados (MySQL)
- **Pool de Conexões:** Monitorar número de conexões ativas (`Threads_connected`). Como a Vercel opera com Serverless Functions, picos de requisições exigem Connection Pooling ou Prisma Accelerate para não esgotar o `max_connections` do MySQL.
- **Alertas de Banco:** Disparar notificação se Número de conexões ativas (`Threads_connected`) ultrapassar 80% do limite configurado.

### 7.3 Monitoramento de Storage e Cotas (Vercel Blob)
- Acompanhar no Vercel Dashboard o consumo de armazenamento e transferências do store privado.
- Configurar alerta preventivo quando o volume armazenado atingir 80% da cota contratada, garantindo tempo hábil para expansão antes que novas importações de TXT sejam rejeitadas.

### 7.4 Monitoramento e Troubleshooting de Iframe (CSP & Framing)
A incorporação da rota pública `/mapa` no portal institucional `https://nascentesdocariri.ufca.edu.br` é o núcleo da entrega pública do projeto.

- **Sintoma de Incidente:** A página `/mapa` carrega normalmente quando acessada diretamente pelo navegador, mas exibe tela em branco, erro de conexão ou quadro bloqueado quando visualizada no site institucional da UFCA.
- **Diagnóstico no Console do Navegador (DevTools - F12):**
  1. *Violação de CSP:* Verificar se há erro indicando rejeição de ancestral:
     ```text
     Refused to display 'https://nascentesdocariri.bessapontes.com.br/mapa' in a frame because an ancestor violates the following Content Security Policy directive: "frame-ancestors 'self' https://nascentesdocariri.ufca.edu.br".
     ```
  2. *Bloqueio de Mixed Content:* Verificar se o portal da UFCA (HTTPS) está requisitando o iframe via HTTP inseguro (`http://...`).
- **Roteiro de Resolução pelo Operador:**
  1. **Inspecionar Cabeçalhos:** Verificar a configuração em `src/config/security-headers.ts` e `next.config.ts`. Certifique-se de que a rota `/mapa` emite `Content-Security-Policy: frame-ancestors 'self' https://nascentesdocariri.ufca.edu.br`.
  2. **Verificar Variação de Domínio:** Se a página hospedeira na UFCA utilizar variação (ex: `https://www.nascentesdocariri.ufca.edu.br`), a nova origem deve ser incluída explicitamente na lista de ancestrais autorizados.
  3. **Conferir Protocolo HTTPS:** Confirmar que o código do iframe no WordPress/CMS da UFCA usa estritamente `src="https://..."`. O redirecionamento automático de HTTP para HTTPS (código 308) é bloqueado por navegadores modernos dentro de contextos de frame seguro.
  4. **Segregação Administrativa:** Confirmar que o usuário não está tentando incorporar rotas administrativas (ex: `/admin`), pois estas são intencionalmente blindadas com `frame-ancestors 'none'` e `X-Frame-Options: DENY` contra Clickjacking.

---

## 8. Registro e Gestão das Pendências da Seção 19.2 dos Requisitos

Em estrito alinhamento com a seção 19.2 do documento de requisitos do projeto, registram-se formalmente as seguintes pendências que aguardam decisões institucionais:

| ID | Descrição da Pendência (Seção 19.2) | Estado Atual | Plano Operacional de Mitigação |
| :---: | :--- | :---: | :--- |
| **19.2.1** | **Volume de Registros:** Quantos registros são esperados inicialmente e no horizonte de alguns anos? | **Pendente** | O sistema foi dimensionado defensivamente com paginação com teto rígido (`take <= 100`) e suporte a índices B-Tree em `(ativo, municipio)`. O backup atual assume crescimento de até 100.000 registros sem necessidade de particionamento. |
| **19.2.2** | **Limites Geográficos do Cariri:** Quais limites geográficos exatos serão usados para representar o Cariri Cearense no enquadramento padrão? | **Pendente** | Coordenadas provisórias fixadas em `src/config/env.ts` (`lat: -7.23456789`, `lng: -39.12345678`, `zoom: 10`). Os limites exatos (*bounding box*) serão refinados na Sprint 2 (Feature-3). |
| **19.2.3** | **Provedor de Tiles em Produção:** Qual serviço de tiles baseado em OpenStreetMap será usado em produção, considerando política de uso, capacidade e disponibilidade? | **Pendente** | O endpoint padrão do OpenStreetMap público (`tile.openstreetmap.org`) destina-se apenas a desenvolvimento. A instituição/projeto deve contratar ou selecionar um provedor com SLA (ex: Stadia Maps, Mapbox, ou servidor de tiles próprio) antes da publicação em larga escala. |
| **19.2.4** | **Metadados Futuros (Fotos e Acesso):** Será necessário publicar fotos, estado de conservação ou situação de acesso das nascentes em uma segunda versão? | **Pendente** | Fora do escopo do MVP. O modelo atual preserva o formato TXT unificado com os 7 campos obrigatórios especificados. |

---

## 9. Matriz de Responsáveis e Contatos Operacionais

| Papel | Responsabilidade Primária | Contato Institucional / Padrão |
| :--- | :--- | :--- |
| **Equipe de Operação / DevOps** | Deploy, Rollback, monitoramento de Vercel e DNS | Operador responsável pelo repositório |
| **Administrador de Banco (DBA)** | Migrações, integridade, rotina de dumps e recuperação | DBA responsável pela infraestrutura MySQL |
| **Administrador Geral do Sistema** | Gestão de importações, usuários e autorizações | `admin@nascentesdocariri.ufca.edu.br` |
| **Docente Orientador / Maintainer** | Aprovação de releases e decisões de arquitetura | `thiago.bessa@ufca.edu.br` |
