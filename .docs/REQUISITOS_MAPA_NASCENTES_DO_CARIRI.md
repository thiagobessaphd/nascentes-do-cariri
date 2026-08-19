# Requisitos do Sistema — Mapa Interativo Nascentes do Cariri

## 1. Visão geral

Desenvolver uma aplicação web para exibir, em um mapa interativo, as nascentes cadastradas no projeto **Nascentes do Cariri**, vinculado à Universidade Federal do Cariri (UFCA).

A aplicação será publicada em:

- **Aplicação do mapa:** `https://nascentesdocariri.bessapontes.com.br`
- **Site institucional que incorporará o mapa:** `https://nascentesdocariri.ufca.edu.br`

O mapa deverá ser incorporado ao site institucional por meio de `iframe` responsivo. A aplicação terá uma área administrativa protegida por autenticação, na qual usuários autorizados poderão enviar um arquivo `.txt` contendo os dados das nascentes.

## 2. Objetivos

- Centralizar os dados geográficos e descritivos das nascentes do Cariri.
- Permitir atualização dos dados por meio de importação de arquivo `.txt`.
- Exibir cada nascente como um marcador georreferenciado em um mapa Leaflet.
- Apresentar informações resumidas ao passar o mouse sobre o marcador.
- Apresentar informações completas ao clicar ou tocar no marcador.
- Permitir a incorporação segura e responsiva do mapa no site da UFCA.

## 3. Escopo do MVP

O MVP deverá conter:

1. Página pública com mapa interativo.
2. Marcadores das nascentes cadastradas.
3. Tooltip no evento de `mouseover`.
4. Popup no clique ou toque.
5. Área administrativa com login e senha.
6. Upload e validação de arquivo `.txt`.
7. Importação dos dados válidos para banco de dados.
8. Relatório do resultado da importação.
9. Histórico básico das importações.
10. Endpoint ou página apropriada para incorporação via `iframe`.

## 4. Perfis de usuário

### 4.1. Visitante

Usuário não autenticado que pode:

- acessar o mapa;
- navegar, ampliar e reduzir o mapa;
- visualizar as nascentes;
- consultar as informações públicas de cada nascente;
- utilizar filtros públicos, quando implementados.

### 4.2. Administrador

Usuário autenticado que pode:

- acessar o painel administrativo;
- enviar um arquivo `.txt`;
- visualizar a prévia e os erros de validação;
- confirmar ou cancelar a importação;
- consultar o histórico das importações;
- sair do sistema.

No MVP, não é necessário permitir cadastro público de usuários. O primeiro administrador deverá ser criado por seed, comando de implantação ou variável segura de ambiente.

## 5. Dados de uma nascente

Cada registro deverá conter os seguintes campos:

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `latitude` | decimal | Sim | Entre `-90` e `90`; usar ponto como separador decimal |
| `longitude` | decimal | Sim | Entre `-180` e `180`; usar ponto como separador decimal |
| `municipio` | texto | Sim | Máximo sugerido de 150 caracteres |
| `fonte` | texto | Sim | Nome ou identificação da fonte/nascente; máximo sugerido de 255 caracteres |
| `localidade` | texto | Sim | Máximo sugerido de 255 caracteres |
| `data_criacao` | data | Sim | Data em que a nascente surgiu na natureza, no formato ISO `AAAA-MM-DD` |
| `vazao_media` | decimal | Sim | Vazão média em metros cúbicos por segundo (`m³/s`), com valor maior ou igual a zero |

### 5.1. Unidade da vazão

A unidade oficial e obrigatória de `vazao_media` será **metros cúbicos por segundo (`m³/s`)**. O arquivo TXT armazenará somente o valor numérico, pois a unidade será fixa em todo o sistema. A interface e a API deverão sempre apresentar explicitamente `m³/s` ao usuário.

### 5.2. Campos internos recomendados

O banco de dados deverá manter também:

- `id`: identificador único;
- `created_at`: data e hora de criação do registro;
- `updated_at`: data e hora da última atualização;
- `importacao_id`: referência à importação que originou o registro;
- `ativo`: indica se o registro está disponível no mapa.

## 6. Especificação do arquivo TXT

### 6.1. Formato

- Extensão obrigatória: `.txt`.
- Codificação: `UTF-8`.
- Primeira linha obrigatoriamente contém o cabeçalho.
- Separador de colunas: ponto e vírgula (`;`).
- Uma nascente por linha.
- Datas no formato `AAAA-MM-DD`.
- Coordenadas e vazão com ponto como separador decimal.
- Linhas vazias deverão ser ignoradas.
- Espaços no início e no final dos valores deverão ser removidos.

Cabeçalho esperado:

```text
latitude;longitude;municipio;fonte;localidade;data_criacao;vazao_media
```

Exemplo:

```text
latitude;longitude;municipio;fonte;localidade;data_criacao;vazao_media
-7.213456;-39.315678;Crato;Nascente do Sítio A;Distrito de Santa Fé;2026-08-01;2.75
-7.245100;-39.410200;Barbalha;Fonte Boa Esperança;Sítio Boa Esperança;2026-08-12;1.40
```

### 6.2. Regras de validação

O sistema deverá:

- recusar arquivos vazios;
- recusar arquivos que não tenham todas as colunas obrigatórias;
- rejeitar tipos de arquivo diferentes de `.txt`;
- limitar o tamanho do upload por configuração, com sugestão inicial de `5 MB`;
- validar cada linha individualmente;
- informar o número da linha e o motivo de cada erro;
- impedir a importação definitiva enquanto existirem linhas inválidas;
- detectar duplicidades dentro do próprio arquivo;
- registrar quem enviou o arquivo, quando enviou e o resultado do processamento.

Para o MVP, considerar duplicado um registro que possua a mesma combinação normalizada de `latitude`, `longitude` e `fonte`.

### 6.3. Comportamento da importação

Fluxo recomendado:

1. O administrador seleciona o arquivo.
2. O backend valida extensão, tamanho, codificação, cabeçalho e conteúdo.
3. O sistema exibe uma prévia com quantidade de registros válidos, inválidos e duplicados.
4. Se não houver erros, o administrador confirma a importação.
5. O sistema realiza a operação em transação de banco de dados.
6. Os novos registros são adicionados à base existente, sem excluir automaticamente os dados de importações anteriores.
7. Registros já existentes, identificados pela chave de duplicidade definida neste documento, não deverão ser cadastrados novamente.
8. Se ocorrer falha, toda a operação é desfeita e os dados anteriores permanecem ativos.
9. O sistema registra o resultado no histórico, vinculando cada registro à sua importação de origem.

Cada arquivo original enviado deverá ser preservado permanentemente em armazenamento privado para auditoria, sem acesso público direto. Uma nova importação nunca deverá substituir, sobrescrever ou apagar o arquivo TXT de uma importação anterior. Arquivos com o mesmo nome deverão receber identificadores internos ou caminhos únicos, preservando o nome original nos metadados.

## 7. Requisitos funcionais

### RF01 — Autenticação

O sistema deverá permitir login de administrador com usuário ou e-mail e senha.

### RF02 — Encerramento de sessão

O administrador deverá poder encerrar sua sessão de forma segura.

### RF03 — Upload

O administrador deverá poder selecionar e enviar um único arquivo `.txt` por operação.

### RF04 — Validação do arquivo

O sistema deverá validar o arquivo e apresentar os erros de forma clara, identificando a linha e o campo problemático.

### RF05 — Prévia da importação

Antes da confirmação, o sistema deverá apresentar uma prévia dos dados e um resumo da validação.

### RF06 — Importação transacional

A importação deverá ser atômica: ou todos os novos registros válidos são adicionados, ou nenhuma alteração é aplicada. A operação não deverá excluir registros nem arquivos provenientes de importações anteriores.

### RF07 — Histórico

O sistema deverá registrar data, administrador, nome do arquivo, total de linhas, registros importados, registros rejeitados e status.

### RF08 — Exibição do mapa

O frontend deverá exibir um mapa utilizando a biblioteca Leaflet e uma camada de mapas configurável.

### RF09 — Marcadores

Cada nascente ativa deverá ser representada por um marcador na latitude e longitude cadastradas.

### RF10 — Tooltip

Ao passar o mouse sobre um marcador, o sistema deverá apresentar pelo menos:

- nome da fonte/nascente;
- município;
- localidade;
- vazão média e unidade.

### RF11 — Popup acessível

Ao clicar ou tocar no marcador, o sistema deverá exibir:

- fonte/nascente;
- município;
- localidade;
- data de criação;
- vazão média em `m³/s`;
- latitude e longitude.

O popup é obrigatório porque dispositivos móveis não possuem evento equivalente confiável ao `mouseover`.

### RF12 — Ajuste inicial do mapa

Ao carregar, o mapa deverá ajustar automaticamente o enquadramento para abranger todos os marcadores. Se não houver registros, deverá usar um enquadramento padrão que abranja a região do Cariri Cearense. Os limites geográficos exatos deverão ser mantidos em configuração versionada, e não dispersos pelo código.

### RF13 — Agrupamento de marcadores

Quando houver muitos pontos próximos, os marcadores deverão ser agrupados visualmente com um plugin compatível, como `Leaflet.markercluster`, para preservar desempenho e legibilidade.

### RF14 — Filtros públicos

O mapa deverá permitir, preferencialmente já no MVP, filtrar os registros por:

- município;
- texto contido em fonte ou localidade.

### RF15 — Incorporação

O sistema deverá disponibilizar uma página pública sem elementos administrativos, adequada para incorporação no site `nascentesdocariri.ufca.edu.br`.

### RF16 — Responsividade

O mapa deverá adaptar-se a computadores, tablets e celulares, inclusive quando exibido dentro de um `iframe`.

## 8. Requisitos não funcionais

### RNF01 — Segurança

- Todo o tráfego deverá utilizar HTTPS.
- Senhas deverão ser armazenadas somente como hash seguro, nunca em texto simples.
- Cookies de sessão deverão usar `HttpOnly`, `Secure` e política `SameSite` apropriada.
- O login deverá possuir proteção contra tentativas repetidas.
- O upload deverá ser processado como dado não confiável.
- Consultas ao banco deverão ser parametrizadas ou realizadas por ORM.
- A área administrativa não poderá ser carregada dentro de `iframe`.
- Credenciais, chaves e segredos deverão permanecer em variáveis de ambiente.

### RNF02 — Controle de incorporação

Os cabeçalhos de segurança deverão permitir `frame-ancestors` somente para:

- o próprio domínio da aplicação;
- `https://nascentesdocariri.ufca.edu.br`.

Exemplo conceitual:

```text
Content-Security-Policy: frame-ancestors 'self' https://nascentesdocariri.ufca.edu.br
```

Não configurar `X-Frame-Options: DENY` na rota pública incorporável. A área administrativa deverá usar uma política separada e restritiva.

### RNF03 — Privacidade

O sistema não deverá coletar dados pessoais de visitantes. Logs deverão evitar o armazenamento desnecessário de dados pessoais e seguir a LGPD.

### RNF04 — Desempenho

- O mapa deverá apresentar feedback visual durante o carregamento.
- A API deverá retornar apenas os campos públicos necessários.
- Os registros deverão possuir índices adequados, principalmente para status e coordenadas.
- A resposta pública poderá utilizar cache com invalidação após uma importação bem-sucedida.

### RNF05 — Disponibilidade e integridade

- A implantação deverá possuir rotina de backup do banco de dados e dos arquivos importados.
- O sistema deverá manter os dados anteriores se uma importação falhar.
- Erros deverão ser registrados em log, sem exposição de detalhes internos ao visitante.

### RNF06 — Acessibilidade

- Navegação administrativa utilizável por teclado.
- Contraste adequado.
- Campos de formulário com rótulos.
- Mensagens de erro associadas aos campos.
- Alternativa ao `mouseover` por clique, toque e foco de teclado sempre que possível.

### RNF07 — Compatibilidade

Suportar as versões atuais dos principais navegadores: Chrome, Firefox, Edge e Safari.

### RNF08 — Manutenibilidade

- Código versionado em Git.
- Configurações separadas por ambiente.
- Migrações de banco versionadas.
- Testes automatizados para importação, autenticação e API pública.
- Documentação de instalação, implantação, backup e recuperação.

## 9. Arquitetura sugerida

A tecnologia específica do backend poderá ser definida pela equipe. Uma arquitetura adequada contém:

- **Frontend público:** HTML/CSS/JavaScript ou framework frontend, com Leaflet.
- **Frontend administrativo:** formulário de autenticação, upload, prévia e histórico.
- **Backend:** API HTTP, autenticação, validação e processamento do TXT.
- **Banco de dados:** MySQL, utilizando versão estável suportada pela infraestrutura do projeto; recomenda-se MySQL 8 ou superior.
- **Armazenamento privado:** arquivos originais das importações.
- **Proxy web:** Nginx ou equivalente, responsável por HTTPS e cabeçalhos.

No MVP, o mapa não deve ler diretamente o arquivo `.txt`. O backend deverá validar e persistir os dados; o frontend consumirá somente a API pública.

## 10. Modelo de dados mínimo

### Tabela `nascentes`

- `id`
- `latitude`
- `longitude`
- `municipio`
- `fonte`
- `localidade`
- `data_criacao`
- `vazao_media`
- `ativo`
- `importacao_id`
- `created_at`
- `updated_at`

### Tabela `usuarios`

- `id`
- `nome`
- `email` ou `username`
- `password_hash`
- `ativo`
- `last_login_at`
- `created_at`
- `updated_at`

### Tabela `importacoes`

- `id`
- `usuario_id`
- `nome_arquivo`
- `caminho_privado_arquivo`
- `hash_arquivo`
- `total_linhas`
- `total_validas`
- `total_invalidas`
- `total_duplicadas`
- `status`: `validando`, `aguardando_confirmacao`, `processando`, `concluida` ou `falhou`
- `mensagem_erro`
- `created_at`
- `concluida_at`

## 11. API sugerida

Os nomes exatos poderão ser adaptados ao framework escolhido.

### Rotas públicas

#### `GET /api/public/nascentes`

Retorna somente as nascentes ativas e os campos públicos.

Filtros opcionais:

- `municipio`
- `q`: busca textual por fonte ou localidade
- limites geográficos visíveis no mapa: `north`, `south`, `east`, `west`, caso a quantidade de registros exija carregamento por área.

Exemplo de resposta:

```json
{
  "data": [
    {
      "id": 1,
      "latitude": -7.213456,
      "longitude": -39.315678,
      "municipio": "Crato",
      "fonte": "Nascente do Sítio A",
      "localidade": "Distrito de Santa Fé",
      "data_criacao": "2026-08-01",
      "vazao_media": 2.75,
      "unidade_vazao": "m³/s"
    }
  ],
  "meta": {
    "total": 1,
    "updated_at": "2026-08-19T12:00:00Z"
  }
}
```

#### `GET /api/public/municipios`

Retorna a lista de municípios que possuem nascentes ativas para alimentar o filtro.

### Rotas administrativas

- `POST /api/admin/auth/login`
- `POST /api/admin/auth/logout`
- `GET /api/admin/auth/me`
- `POST /api/admin/importacoes/validar`
- `POST /api/admin/importacoes/{id}/confirmar`
- `DELETE /api/admin/importacoes/{id}` para cancelar uma importação ainda não confirmada
- `GET /api/admin/importacoes`
- `GET /api/admin/importacoes/{id}`

Todas as rotas administrativas deverão exigir autenticação e autorização.

## 12. Interface pública do mapa

A página pública deverá conter:

- título ou identificação discreta do mapa;
- mapa ocupando todo o espaço disponível;
- controles de zoom;
- escala cartográfica;
- filtro por município;
- campo de busca por fonte ou localidade;
- botão para limpar filtros;
- legenda ou contador de nascentes visíveis;
- mensagem quando não houver dados ou resultados para o filtro.

O mapa-base usado em produção será o **OpenStreetMap**. A atribuição exigida deverá permanecer visível em todas as exibições, inclusive dentro do `iframe`.

O endpoint de tiles deverá permanecer configurável por ambiente. O uso em produção deverá respeitar a política de utilização, atribuição, capacidade e disponibilidade do serviço de tiles escolhido para exibir os dados do OpenStreetMap. A escolha do OpenStreetMap como mapa-base não autoriza presumir que um servidor público específico de tiles oferece capacidade ilimitada ou SLA para a aplicação.

## 13. Interface administrativa

### Tela de login

- usuário ou e-mail;
- senha;
- botão de entrar;
- mensagem genérica para credenciais inválidas.

### Painel

- data e situação da última importação;
- quantidade atual de nascentes ativas;
- acesso ao novo upload;
- histórico recente.

### Tela de importação

- seletor de arquivo `.txt`;
- instruções e exemplo do formato esperado;
- botão para validar;
- resumo dos resultados;
- tabela de prévia;
- lista de erros por linha;
- botão de confirmar importação, habilitado apenas quando o arquivo for válido;
- botão de cancelar.

## 14. Incorporação no WordPress/site institucional

Exemplo de incorporação:

```html
<iframe
  src="https://nascentesdocariri.bessapontes.com.br/mapa"
  title="Mapa interativo das Nascentes do Cariri"
  width="100%"
  height="700"
  loading="lazy"
  style="border: 0; width: 100%; min-height: 600px;"
  allowfullscreen>
</iframe>
```

Após o carregamento do mapa, o código deverá chamar `map.invalidateSize()` quando necessário para corrigir o dimensionamento do Leaflet dentro do `iframe` ou após mudanças de layout.

## 15. Critérios de aceite do MVP

O MVP será considerado aceito quando:

1. Um administrador válido conseguir entrar e sair do sistema.
2. Um visitante não autenticado não conseguir acessar as rotas administrativas.
3. Um arquivo TXT válido for validado, visualizado e importado com sucesso.
4. Um arquivo inválido não alterar a base ativa e exibir erros com número da linha.
5. Uma falha durante a importação preservar integralmente os dados anteriores.
6. Todas as novas nascentes importadas aparecerem nas coordenadas corretas, sem apagar nascentes de importações anteriores.
7. O `mouseover` apresentar as informações resumidas no computador.
8. O clique ou toque apresentar todas as informações definidas.
9. O mapa ajustar o enquadramento aos registros e funcionar em celular e computador.
10. O mapa puder ser incorporado no domínio institucional autorizado.
11. A área administrativa não puder ser incorporada em sites externos.
12. O histórico registrar corretamente o autor, arquivo, data, totais e status, preservando permanentemente o arquivo TXT original de cada importação.
13. As senhas não forem armazenadas em texto simples.
14. A API pública não expuser dados administrativos, caminhos internos ou informações de usuários.

## 16. Testes mínimos

### Backend

- login válido e inválido;
- bloqueio de rota administrativa sem autenticação;
- arquivo vazio;
- extensão inválida;
- arquivo acima do limite;
- cabeçalho ausente ou incorreto;
- coordenada fora dos limites;
- data inválida;
- vazão negativa ou não numérica;
- campo obrigatório vazio;
- linha duplicada;
- rollback em caso de falha;
- adição dos novos registros à base existente após confirmação;
- preservação dos registros provenientes de importações anteriores;
- preservação dos arquivos TXT originais, inclusive quando possuírem o mesmo nome;
- resposta da API somente com registros ativos.

### Frontend

- criação correta dos marcadores;
- tooltip no mouseover;
- popup no clique e toque;
- filtros;
- estado sem dados;
- estado de erro da API;
- carregamento responsivo dentro do `iframe`.

## 17. Implantação e operação

- Usar ambientes separados para desenvolvimento e produção.
- Configurar DNS do subdomínio para o servidor da aplicação.
- Emitir e renovar automaticamente o certificado TLS.
- Configurar CORS apenas se a arquitetura realmente exigir chamadas entre origens; o uso de `iframe` isoladamente não exige CORS.
- Aplicar migrações de banco de forma controlada.
- Criar usuário administrador inicial sem expor a senha em repositório.
- Configurar backups periódicos do MySQL e dos arquivos TXT preservados, e testar a restauração conjunta.
- Monitorar disponibilidade, erros da aplicação e espaço de armazenamento.
- Documentar o procedimento de implantação e rollback.

## 18. Itens fora do escopo inicial

Podem ser avaliados em versões futuras:

- cadastro e edição manual de cada nascente;
- múltiplos perfis e níveis de permissão;
- fotos, vídeos e documentos anexos;
- trilhas, áreas de preservação ou camadas geográficas adicionais;
- exportação em CSV, GeoJSON, KML ou PDF;
- painel estatístico;
- comparação histórica da vazão;
- integração automática com outros sistemas;
- aplicativo móvel;
- modo offline;
- geocodificação de endereços;
- API pública documentada para terceiros.

## 19. Decisões consolidadas e pendências

### 19.1. Decisões confirmadas

1. `data_criacao` representa a data em que a nascente surgiu na natureza.
2. A unidade oficial da vazão média é metros cúbicos por segundo (`m³/s`).
3. Cada importação adiciona novos registros à base existente; não substitui integralmente os dados anteriores.
4. Todas as importações devem permanecer registradas no histórico.
5. Todos os arquivos TXT originais devem ser preservados e nunca sobrescritos por novas importações.
6. O mapa-base usado em produção será o OpenStreetMap.
7. Quando não houver dados, o enquadramento padrão deverá abranger a região do Cariri Cearense.
8. O sistema utilizará banco de dados MySQL.

### 19.2. Pendências

1. Quantos registros são esperados inicialmente e no horizonte de alguns anos?
2. Quais limites geográficos exatos serão usados para representar o Cariri Cearense no enquadramento padrão?
3. Qual serviço de tiles baseado em OpenStreetMap será usado em produção, considerando política de uso, capacidade e disponibilidade?
4. Será necessário publicar fotos, estado de conservação ou situação de acesso das nascentes em uma segunda versão?

## 20. Orientação para agentes de IA

Ao implementar este documento:

- trate os requisitos numerados como fonte principal de verdade;
- não altere o formato do TXT sem atualizar parser, documentação, exemplo e testes;
- não exponha endpoints administrativos sem autenticação;
- não processe o arquivo somente no navegador;
- implemente importações usando transação;
- preserve a base ativa quando houver erro;
- mantenha a página pública independente do painel administrativo;
- escreva testes antes de considerar cada requisito concluído;
- registre no README as decisões tomadas para os itens ainda pendentes;
- evite adicionar funcionalidades fora do escopo sem aprovação explícita.
