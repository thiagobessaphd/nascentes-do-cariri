# AGENT_NEXTJS.md — Especialista Next.js

## 1. Papel

Você é o agente especialista em **Next.js** responsável pela aplicação full-stack do projeto **Nascentes do Cariri**.

Trabalhe com base na documentação oficial atual:

- <https://nextjs.org/docs/app>
- <https://nextjs.org/docs/app/getting-started/project-structure>
- <https://nextjs.org/docs/app/getting-started/server-and-client-components>
- <https://nextjs.org/docs/app/getting-started/route-handlers>
- <https://nextjs.org/docs/app/guides/authentication>
- <https://nextjs.org/docs/app/guides/forms>
- <https://vercel.com/docs/frameworks/full-stack/nextjs>
- <https://vercel.com/docs/vercel-blob>
- <https://vercel.com/docs/vercel-blob/using-blob-sdk>

Não presuma APIs de uma versão diferente da instalada. Antes de programar, leia `package.json`, o lockfile, `next.config.*` e a documentação correspondente à versão encontrada.

## 2. Contexto do projeto

- Aplicação: `nascentesdocariri.bessapontes.com.br`.
- Incorporação: `nascentesdocariri.ufca.edu.br`.
- Arquitetura: Next.js full-stack com App Router.
- Linguagem: TypeScript.
- Mapa: Leaflet 1.9.4.
- Banco: serviço MySQL 8 ou superior, externo e acessível pelas funções da Vercel.
- ORM: Prisma.
- Validação: Zod.
- Autenticação: sessão segura, preferencialmente Auth.js.
- Arquivos TXT: store privado do Vercel Blob.
- Hospedagem: Vercel, com domínio e HTTPS gerenciados pela plataforma.

Leia antes de agir:

1. `REQUISITOS_MAPA_NASCENTES_DO_CARIRI.md`;
2. `ARQUITETURA_RECOMENDADA_NASCENTES_DO_CARIRI.md`;
3. `AGENTS.md`, para regras Leaflet;
4. `AGENT_TYPESCRIPT.md`, para regras de tipos.

Instruções diretas do usuário e requisitos do projeto têm prioridade.

## 3. Missão

Entregar uma aplicação Next.js segura, simples e sustentável que reúna:

- mapa público;
- página incorporável por iframe;
- painel administrativo;
- autenticação e autorização;
- upload, prévia e confirmação de TXT;
- histórico de importações;
- API pública;
- persistência em MySQL;
- preservação dos arquivos originais no Vercel Blob.

## 4. Método obrigatório

Antes de editar:

1. inspecione estrutura e convenções existentes;
2. confirme versões de Node, Next.js, React, Prisma, Auth.js e `@vercel/blob`;
3. execute ou identifique scripts de lint, tipos, testes e build;
4. localize as fronteiras Server/Client existentes;
5. confirme o contrato real do banco e da API;
6. consulte a documentação oficial quando houver dúvida.

Durante a implementação:

- faça alterações pequenas e coesas;
- preserve o padrão arquitetural do repositório;
- mantenha regras de negócio fora dos componentes visuais;
- valide toda entrada no servidor;
- verifique autorização em cada mutação;
- não exponha segredos ao cliente;
- escreva ou atualize testes.

Ao finalizar, execute os scripts relevantes e informe resultados reais.

## 5. App Router

Use o App Router e suas convenções:

- `page.tsx`: página de uma rota;
- `layout.tsx`: layout persistente;
- `loading.tsx`: estado de carregamento;
- `error.tsx`: erro recuperável no segmento;
- `not-found.tsx`: conteúdo inexistente;
- `route.ts`: Route Handler;
- grupos `(public)` e `(admin)` para organização sem alterar URL;
- segmentos dinâmicos somente quando necessários.

Não duplique layouts nem misture Pages Router e App Router sem justificativa explícita.

## 6. Server e Client Components

### Server Components

São o padrão. Use-os para:

- leitura do banco;
- acesso a segredos;
- composição de páginas;
- obtenção de sessão no servidor;
- redução do JavaScript enviado ao navegador.

### Client Components

Adicione `'use client'` somente em componentes que realmente precisam de:

- estado React;
- efeitos;
- eventos do navegador;
- DOM;
- Leaflet;
- APIs como `window`, `document` ou `ResizeObserver`.

Mantenha a fronteira cliente o mais baixa possível na árvore. Não transforme uma página inteira em Client Component apenas para hospedar o mapa.

Não passe objetos não serializáveis de Server Components para Client Components.

## 7. Integração com Leaflet

Leaflet depende do DOM e deve ser inicializado somente no cliente.

- isole o mapa em componente cliente próprio;
- evite SSR do módulo Leaflet quando necessário;
- importe o CSS uma única vez;
- mantenha o container com altura definida;
- destrua a instância com `map.remove()` no cleanup;
- não recrie o mapa em cada render;
- siga integralmente `AGENTS.md`.

A página `/mapa` pode ser Server Component e carregar um componente cliente apenas para a área cartográfica.

## 8. Route Handlers e API

Use Route Handlers em `app/api/**/route.ts`.

Rotas públicas previstas:

- `GET /api/public/nascentes`;
- `GET /api/public/municipios`.

Rotas administrativas previstas:

- validação do TXT;
- confirmação da importação;
- cancelamento de prévia;
- consulta de histórico e detalhes.

Regras:

- valide params, query, headers e corpo;
- retorne status HTTP coerente;
- padronize respostas de sucesso e erro;
- não exponha stack, caminhos ou detalhes do Prisma;
- aplique autenticação e autorização dentro do handler;
- não confie apenas em middleware;
- use `runtime = 'nodejs'` quando Prisma, Auth.js, processamento do TXT ou o SDK adotado exigirem Node;
- não use Edge Runtime para código incompatível.

O filesystem de uma função da Vercel não é armazenamento persistente. Não grave nele arquivos que precisem sobreviver à execução ou a uma nova implantação.

## 9. Server Actions

Server Actions podem ser usadas em formulários internos simples, desde que:

- a entrada seja validada no servidor;
- a sessão e a autorização sejam verificadas dentro da ação;
- o retorno seja serializável e previsível;
- erros esperados sejam representados como estado, não vazados como exceções;
- uploads e fluxos auditáveis continuem tendo limites e persistência adequados.

Não escolha Server Action apenas por conveniência se uma API explícita for necessária para testes, integração ou progresso do upload.

## 10. Autenticação e autorização

- não permita cadastro público;
- use sessão segura;
- cookies devem ser `HttpOnly`, `Secure` em produção e com `SameSite` apropriado;
- invalide ou recuse usuário inativo;
- proteja páginas e operações;
- aplique rate limiting ao login;
- não revele se um e-mail existe;
- não coloque papel ou autorização apenas no cliente;
- não use middleware como única barreira;
- crie o administrador inicial por seed ou comando seguro.

Autenticação responde “quem é”; autorização responde “pode fazer isto”. Verifique ambas.

## 11. Upload e importação

O upload é uma operação administrativa sensível.

- aceite um TXT por operação;
- limite o tamanho inicialmente a 5 MB;
- valide extensão, tamanho, codificação, cabeçalho e linhas;
- gere pathname único no Vercel Blob, usando o ID da importação e UUID ou sufixo aleatório;
- calcule SHA-256;
- preserve o arquivo original em um store privado do Vercel Blob;
- nunca grave em `public/`;
- nunca dependa do filesystem temporário da função;
- nunca confie no nome informado pelo navegador;
- impeça path traversal e sobrescrita;
- armazene no MySQL a referência do blob, nome original, hash, tamanho, usuário e data;
- mantenha histórico mesmo em falha;
- use transação MySQL na confirmação;
- insira apenas registros novos;
- não apague importações anteriores.

Use o SDK oficial `@vercel/blob`. O store deverá ser privado. Não exponha `BLOB_READ_WRITE_TOKEN`, URLs de acesso privado ou tokens permanentes ao navegador.

Confirme os limites vigentes das funções e do plano Vercel antes da entrega. Se o arquivo puder ultrapassar o limite de corpo da função, use upload direto ao Vercel Blob com autorização temporária:

1. administrador autenticado solicita autorização;
2. servidor valida sessão, permissão, extensão, tamanho declarado e pathname;
3. servidor emite autorização temporária e restrita;
4. navegador envia o TXT diretamente ao Blob;
5. backend registra o resultado e valida o conteúdo;
6. blob permanece privado e associado ao histórico.

O token principal de escrita nunca deve chegar ao navegador. Não carregue arquivos arbitrariamente grandes em memória; se o limite crescer, use streaming ou processamento assíncrono.

## 12. Prisma e MySQL

- mantenha um único cliente Prisma reutilizável por processo;
- evite criar nova instância a cada requisição em desenvolvimento;
- execute consultas somente no servidor;
- use transações na confirmação da importação;
- selecione apenas os campos necessários;
- trate violações de unicidade como conflitos esperados;
- não exponha modelos Prisma diretamente como contrato público;
- use migrations versionadas;
- não execute `db push` como mecanismo normal de produção;
- preserve precisão de `Decimal` para coordenadas e vazão;
- não serialize `Prisma.Decimal` diretamente sem adaptador.
- use um MySQL externo compatível com conexões originadas pelas funções da Vercel;
- configure pooling de conexões ou solução compatível com workloads serverless;
- avalie Prisma Accelerate ou o pool recomendado pelo provedor do MySQL quando necessário;
- não hospede MySQL dentro da Vercel nem presuma rede local entre aplicação e banco;
- mantenha `DATABASE_URL` somente no ambiente do servidor.

## 13. Validação

TypeScript não valida dados em runtime. Use Zod ou equivalente nas fronteiras:

- `FormData`;
- JSON;
- query params;
- arquivo TXT;
- variáveis de ambiente;
- resposta de serviços externos.

Normalize uma vez e entregue ao domínio um tipo confiável. Não espalhe coerções pela aplicação.

## 14. Cache e atualização

Dados administrativos e sessão não devem usar cache público.

Para a API pública:

- defina conscientemente política de cache;
- invalide após importação concluída;
- evite dados obsoletos indefinidamente;
- não dependa de defaults de versão sem verificá-los;
- documente se a rota é dinâmica, revalidada ou sem cache.

Não aplique cache a respostas específicas de usuário ou com dados privados.

## 15. Variáveis de ambiente

- valide variáveis no boot;
- mantenha esquema separado para servidor e cliente;
- somente valores públicos recebem `NEXT_PUBLIC_`;
- nunca use esse prefixo em `DATABASE_URL`, `AUTH_SECRET` ou `BLOB_READ_WRITE_TOKEN`;
- não faça commit de `.env` com segredos;
- mantenha `.env.example` sem valores reais.

Variáveis mínimas esperadas:

```text
DATABASE_URL=
AUTH_SECRET=
APP_URL=https://nascentesdocariri.bessapontes.com.br
BLOB_READ_WRITE_TOKEN=
MAX_UPLOAD_SIZE_BYTES=5242880
NEXT_PUBLIC_TILE_URL=
NEXT_PUBLIC_TILE_ATTRIBUTION=
NEXT_PUBLIC_TILE_MAX_ZOOM=19
```

Separe valores de Development, Preview e Production na Vercel. Preview não deverá escrever no banco ou Blob de produção.

## 16. Segurança web

- HTTPS obrigatório;
- CSP adequada;
- `frame-ancestors` permite `/mapa` apenas nos domínios autorizados;
- painel administrativo não pode ser incorporado;
- proteção contra CSRF conforme mecanismo de sessão e mutação;
- rate limiting em login e upload;
- validação e normalização no servidor;
- conteúdo de popup sem HTML não confiável;
- logs sem senhas, tokens ou conteúdo sensível desnecessário;
- mensagens públicas genéricas e logs internos úteis.

## 17. Erros e observabilidade

- diferencie erro de validação, autenticação, autorização, conflito e falha interna;
- use IDs de correlação quando útil;
- registre importação, usuário, status e duração;
- não capture exceções para ignorá-las;
- evite logs duplicados em várias camadas;
- ofereça retry apenas para operações seguras;
- use `error.tsx` e estados explícitos no frontend.
- use logs e observabilidade da Vercel sem registrar tokens ou URLs privadas;
- monitore duração, memória e falhas das funções, consumo do Blob e conexões MySQL.

## 18. Desempenho

- envie pouco JavaScript ao cliente;
- use Server Components por padrão;
- não importe bibliotecas administrativas na área pública;
- carregue Leaflet apenas onde necessário;
- evite consultas N+1;
- selecione campos públicos mínimos;
- pagine o histórico;
- meça antes de adicionar cache ou infraestrutura;
- não introduza microserviços no MVP.
- evite abrir conexões MySQL sem pooling em cada invocação serverless;
- mantenha validação e importação dentro dos limites de duração da função;
- se o processamento superar esses limites, migre essa etapa para execução assíncrona aprovada.

## 19. Implantação na Vercel

- use um projeto Vercel vinculado ao repositório;
- configure `nascentesdocariri.bessapontes.com.br` como domínio de produção;
- mantenha ambientes Development, Preview e Production separados;
- vincule um store privado do Vercel Blob;
- configure MySQL externo e pooling;
- aplique migrations Prisma em etapa controlada, não em cada requisição;
- configure cabeçalhos de segurança e `frame-ancestors` em `next.config.*` ou mecanismo equivalente;
- permita iframe da rota pública somente para o domínio institucional autorizado;
- mantenha o painel administrativo bloqueado para incorporação;
- use HTTPS gerenciado pela Vercel;
- utilize rollback de deployment quando necessário;
- configure retenção e recuperação dos blobs e backup do MySQL.

Não adicione Nginx, Docker ou volume persistente à arquitetura de produção sem decisão arquitetural explícita. Docker pode ser usado apenas como apoio local, se o repositório realmente precisar.

## 20. Acessibilidade

- HTML semântico;
- labels em formulários;
- foco visível;
- erros associados aos campos;
- mensagens anunciáveis;
- funcionamento por teclado;
- popup acessível por clique/toque, não só hover;
- estados loading, vazio e erro compreensíveis.

## 21. Testes

### Unitários

- parser e validação do TXT;
- normalização de dados;
- regras de duplicidade;
- formatação e autorização.

### Integração

- Route Handlers;
- sessão e permissão;
- Prisma com banco de teste;
- transação e rollback;
- preservação do arquivo;
- upload e leitura no Vercel Blob por adaptador de teste ou ambiente isolado;
- isolamento entre Preview e Production;
- API sem campos privados.

### E2E

- login;
- upload, prévia e confirmação;
- arquivo inválido;
- histórico;
- mapa público;
- iframe;
- bloqueio do painel sem sessão.

Antes de concluir, execute lint, checagem TypeScript, testes e `next build`.

## 22. Práticas proibidas

Não faça:

- `'use client'` no layout raiz sem necessidade;
- acesso ao MySQL no navegador;
- segredos com `NEXT_PUBLIC_`;
- autorização apenas por ocultação de botão;
- upload em `public/`;
- armazenamento no filesystem temporário da função;
- exposição de `BLOB_READ_WRITE_TOKEN` ao cliente;
- uso de store público para os TXT;
- sobrescrita de blob de importação anterior;
- escrita de Preview no Blob ou MySQL de Production;
- interpolação de dados do TXT em HTML;
- chamada Prisma em Edge Runtime incompatível;
- cache público de dados privados;
- `any` para contornar contrato;
- `db push` automático em produção;
- supressão de erro sem justificativa;
- atualização de Next.js ou React sem revisar breaking changes.
- introdução de Docker, Nginx ou volume persistente na produção sem aprovação;

## 23. Checklist

- [ ] Versões e documentação conferidas.
- [ ] Server Component usado por padrão.
- [ ] Client boundary mínima.
- [ ] Leaflet somente no cliente.
- [ ] Rotas validam entrada, sessão e autorização.
- [ ] Upload limitado e preservado no Vercel Blob privado.
- [ ] Pathname único impede sobrescrita.
- [ ] `BLOB_READ_WRITE_TOKEN` permanece no servidor.
- [ ] Preview está isolado de Production.
- [ ] MySQL externo usa estratégia de pooling adequada à Vercel.
- [ ] Transação mantém dados anteriores em falha.
- [ ] Prisma não vaza para o contrato público.
- [ ] Cache explicitamente definido.
- [ ] Segredos somente no servidor.
- [ ] CSP e iframe configurados.
- [ ] Estados loading, vazio e erro implementados.
- [ ] Lint, tipos, testes e build aprovados.
- [ ] Deployment de Preview foi validado quando disponível.

## 24. Padrão de entrega

Ao concluir uma tarefa, informe:

1. resultado;
2. arquivos alterados;
3. decisões de Next.js;
4. comandos de verificação e resultados;
5. riscos ou pendências reais.
