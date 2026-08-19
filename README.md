# Nascentes do Cariri

Aplicação web full-stack para publicar e administrar o mapa interativo das nascentes do Cariri. O produto será incorporado ao site institucional da UFCA e terá uma área administrativa para importar arquivos TXT de forma validada, cumulativa e auditável.

### Aplicação full-stack Next.js + React + TypeScript + MySQL, preparada para Vercel e execução alternativa com Nginx + Docker

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![Next.js](https://img.shields.io/badge/Next.js-16.3.1-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.8-149eca?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22-5fa04e?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.4-4479a1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Nginx](https://img.shields.io/badge/Nginx-1.28-009639?logo=nginx&logoColor=white)](https://nginx.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ed?logo=docker&logoColor=white)](https://www.docker.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel&logoColor=white)](https://vercel.com/)
[![Version](https://img.shields.io/badge/Version-0.1.0-lightgrey)](https://semver.org/)

As regras de negócio estão em [`.docs/REQUISITOS_MAPA_NASCENTES_DO_CARIRI.md`](.docs/REQUISITOS_MAPA_NASCENTES_DO_CARIRI.md) e a decisão técnica em [`.docs/ARQUITETURA_RECOMENDADA_NASCENTES_DO_CARIRI.md`](.docs/ARQUITETURA_RECOMENDADA_NASCENTES_DO_CARIRI.md).

## Estado atual

Este repositório contém a fundação executável da aplicação e da infraestrutura:

- Next.js 16 com App Router, React e TypeScript estrito;
- build Docker multi-stage com saída standalone e usuário sem privilégios;
- MySQL 8.4 com `utf8mb4`, healthcheck e volume persistente;
- Nginx como proxy reverso, limite de upload e cabeçalhos de segurança;
- configuração HTTP para desenvolvimento e overlay opcional para TLS;
- páginas provisórias `/` e `/mapa`;
- endpoint de saúde `/api/health`.

O mapa Leaflet, Prisma, Auth.js, Vercel Blob e os fluxos administrativos ainda serão implementados nas próximas fases. As páginas atuais são apenas marcadores da infraestrutura e não representam o MVP concluído.

## Arquitetura de execução

```text
Navegador
   |
   v
Nginx :80/:443
   |
   v
Next.js :3000 -----> Vercel Blob privado (externo)
   |
   v
MySQL :3306
```

Somente o Nginx publica portas no host. O Next.js não é exposto diretamente, e o MySQL permanece em uma rede Docker interna. A aplicação participa também da rede de frontend para alcançar o Vercel Blob e outros serviços HTTPS autorizados.

O volume `mysql_data` preserva o banco entre recriações dos containers. Os arquivos TXT não devem ser armazenados nesse volume nem no filesystem do container: a arquitetura exige um store privado do Vercel Blob.

## Pré-requisitos

- Docker Engine ou Docker Desktop;
- Docker Compose v2;
- Node.js 22.12 ou superior apenas para desenvolvimento fora do Docker;
- uma conta/store privado no Vercel Blob quando o fluxo de importação for habilitado.

## Inicialização rápida com Docker

Crie o arquivo local de configuração:

```bash
cp .env.example .env
```

Gere um segredo de autenticação e coloque o resultado em `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

Antes de iniciar, altere no `.env`:

- `MYSQL_PASSWORD` e `MYSQL_ROOT_PASSWORD`;
- a senha contida em `DATABASE_URL`;
- `AUTH_SECRET`;
- `BLOB_READ_WRITE_TOKEN`, quando a importação for implementada.

Se a senha do banco contiver caracteres reservados de URL, aplique percent-encoding na parte correspondente de `DATABASE_URL`.

Suba a stack:

```bash
docker compose up -d --build --wait
```

Acesse:

- aplicação: <http://localhost:8080>;
- rota incorporável: <http://localhost:8080/mapa>;
- saúde da aplicação: <http://localhost:8080/api/health>;
- saúde do proxy: <http://localhost:8080/nginx-health>.

Consulte o estado e os logs:

```bash
docker compose ps
docker compose logs -f app nginx mysql
```

Pare os containers sem apagar o banco:

```bash
docker compose down
```

> `docker compose down --volumes` apaga definitivamente o volume do MySQL. Não use esse comando em ambientes que contenham dados importantes.

## Desenvolvimento fora do Docker

Instale as dependências e execute as verificações:

```bash
npm ci
npm run lint
npm run typecheck
npm run build
```

Para trabalhar com hot reload:

```bash
npm run dev
```

O comando inicia o Next.js em <http://localhost:3000>. Quando o Prisma for adicionado, o processo local precisará de uma `DATABASE_URL` que alcance um MySQL acessível pelo host. O MySQL do Compose não publica a porta por padrão para evitar exposição acidental.

## Variáveis de ambiente

| Variável | Exposição | Finalidade |
| --- | --- | --- |
| `DATABASE_URL` | servidor | Conexão do Prisma com o MySQL |
| `MYSQL_DATABASE` | servidor | Banco criado pelo container MySQL |
| `MYSQL_USER` | servidor | Usuário exclusivo da aplicação |
| `MYSQL_PASSWORD` | servidor | Senha do usuário da aplicação |
| `MYSQL_ROOT_PASSWORD` | servidor | Administração inicial do MySQL |
| `APP_URL` | servidor | URL canônica da aplicação |
| `AUTH_URL` | servidor | URL usada pelo Auth.js |
| `AUTH_SECRET` | servidor | Assinatura/criptografia da autenticação |
| `BLOB_READ_WRITE_TOKEN` | servidor | Escrita no store privado do Vercel Blob |
| `MAX_UPLOAD_SIZE_BYTES` | servidor | Limite de arquivo aplicado pela aplicação |
| `NEXT_PUBLIC_TILE_URL` | pública | Template da URL do serviço de tiles |
| `NEXT_PUBLIC_TILE_ATTRIBUTION` | pública | Atribuição obrigatória do mapa-base |
| `NEXT_PUBLIC_TILE_MAX_ZOOM` | pública | Zoom máximo oferecido pelo provedor |
| `SERVER_NAME` | Nginx | Domínio aceito pelo virtual host |
| `HTTP_PORT` / `HTTPS_PORT` | host | Portas publicadas pelo Compose |
| `HTTPS_REDIRECT_PORT` | Nginx | Sufixo da porta no redirecionamento; vazio quando HTTPS usa 443 |

Variáveis `NEXT_PUBLIC_*` são incorporadas ao bundle durante o build da imagem. Ao alterá-las, execute novamente `docker compose up -d --build`.

O endpoint público padrão do OpenStreetMap presente no exemplo serve apenas como configuração inicial de desenvolvimento. Antes da produção, deve ser escolhido um serviço de tiles com política, capacidade e disponibilidade compatíveis com o tráfego esperado.

## HTTPS direto no Nginx

O arquivo principal usa HTTP para desenvolvimento local. Para o Nginx terminar TLS, disponibilize um certificado e uma chave privada fora do repositório e ajuste no `.env`:

```dotenv
SERVER_NAME=nascentesdocariri.bessapontes.com.br
APP_URL=https://nascentesdocariri.bessapontes.com.br
AUTH_URL=https://nascentesdocariri.bessapontes.com.br
HTTP_PORT=80
HTTPS_PORT=443
HTTPS_REDIRECT_PORT=
TLS_CERTIFICATE_FILE=/caminho/seguro/fullchain.pem
TLS_PRIVATE_KEY_FILE=/caminho/seguro/privkey.pem
```

Inicie com o overlay TLS:

```bash
docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d --build --wait
```

Essa configuração redireciona HTTP para HTTPS, aceita TLS 1.2/1.3 e envia HSTS. A emissão e a renovação do certificado devem ser realizadas pelo mecanismo operacional escolhido, por exemplo Certbot no host ou um load balancer gerenciado.

## Incorporação por iframe

Apenas `/mapa` recebe a política:

```text
Content-Security-Policy: frame-ancestors 'self' https://nascentesdocariri.ufca.edu.br
```

As demais rotas recebem `frame-ancestors 'none'` e `X-Frame-Options: DENY` no Nginx. As rotas administrativas também possuem proteção no `next.config.ts`, útil quando a aplicação for implantada diretamente na Vercel sem esse proxy.

Exemplo institucional:

```html
<iframe
  src="https://nascentesdocariri.bessapontes.com.br/mapa"
  title="Mapa interativo das Nascentes do Cariri"
  width="100%"
  height="700"
  loading="lazy"
  style="border: 0; width: 100%; min-height: 600px;">
</iframe>
```

## Banco de dados, migrações e backup

O container cria um banco com usuário exclusivo da aplicação. Timestamps técnicos devem ser persistidos em UTC; datas civis, como `data_criacao`, devem permanecer como `DATE`. Coordenadas e vazão devem usar `DECIMAL`, nunca `FLOAT`.

Quando o Prisma e o primeiro schema forem adicionados:

- migrations devem ser versionadas em `prisma/migrations`;
- produção deve usar `prisma migrate deploy` de forma controlada;
- `prisma db push` não deve ser usado como mecanismo normal de implantação;
- a confirmação da importação deve ocorrer em transação.

Exemplo de backup lógico do banco:

```bash
docker compose exec -T mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
  > backup-nascentes.sql
```

O backup do MySQL deve ser coordenado com a retenção do Vercel Blob, pois o banco guarda as referências dos arquivos originais. Um backup isolado do banco não garante a recuperação completa das importações.

Procedimentos de restauração devem ser testados primeiro em ambiente separado. Nunca restaure diretamente sobre produção sem backup, janela de manutenção e plano de rollback.

## Produção: Docker ou Vercel

A arquitetura recomendada em `.docs` aponta a Vercel como hospedagem principal, com domínio/TLS gerenciados, MySQL externo e Vercel Blob privado. O arquivo `.spec/agent_NEXTJS.md` descreve Docker, Nginx e HTTPS, e esta estrutura atende essa modalidade self-hosted solicitada.

Escolha apenas uma borda pública por ambiente:

- **Vercel:** implante o projeto Next.js sem o Nginx do Compose, configure as mesmas variáveis na plataforma e use MySQL externo;
- **self-hosted:** use o Compose com Nginx e MySQL, mantendo o Vercel Blob como serviço externo privado.

Em ambos os casos são obrigatórios ambientes separados, backups, política de retenção dos blobs, logs sem segredos, migrações controladas e teste de restauração.

## Estrutura principal

```text
.
├── .docs/                         # requisitos e arquitetura
├── .spec/                         # orientações técnicas dos especialistas
├── docker/nginx/                  # imagem e configuração do proxy
│   ├── conf.d/
│   ├── snippets/
│   ├── templates-http/
│   └── templates-tls/
├── public/                        # ativos públicos futuros
├── src/app/                       # aplicação Next.js App Router
├── Dockerfile                     # imagem standalone da aplicação
├── docker-compose.yml             # stack HTTP
├── docker-compose.tls.yml         # overlay HTTPS
├── next.config.ts
├── package.json
└── tsconfig.json
```

## Próximas fases

1. Adicionar Prisma, schema, migrations e seed seguro do administrador.
2. Implementar Auth.js e autorização das rotas administrativas.
3. Integrar Vercel Blob privado e o fluxo auditável de importação.
4. Implementar parser TXT, Zod, duplicidade e transações.
5. Criar o mapa com Leaflet 1.9.4, filtros, clustering e acessibilidade.
6. Adicionar testes unitários, de integração e end-to-end.

## Licença

Consulte [LICENSE](LICENSE).
