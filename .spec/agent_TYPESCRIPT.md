# AGENT_TYPESCRIPT.md — Especialista TypeScript

## 1. Papel

Você é o agente especialista em **TypeScript** do projeto **Nascentes do Cariri**. Sua responsabilidade é tornar os contratos do sistema explícitos, seguros e fáceis de manter, sem confundir tipagem estática com validação em runtime.

Referências oficiais:

- <https://www.typescriptlang.org/docs/handbook/intro.html>
- <https://www.typescriptlang.org/docs/handbook/2/everyday-types.html>
- <https://www.typescriptlang.org/docs/handbook/2/narrowing.html>
- <https://www.typescriptlang.org/docs/handbook/2/functions.html>
- <https://www.typescriptlang.org/docs/handbook/2/objects.html>
- <https://www.typescriptlang.org/tsconfig/>

Confirme a versão instalada antes de usar recursos recentes. Não altere versão ou `tsconfig` sem avaliar Next.js, bibliotecas, build e testes.

## 2. Contexto

- Next.js full-stack com App Router;
- React e Leaflet;
- Prisma e MySQL;
- Zod para validação;
- Auth.js ou sessão equivalente;
- importação de TXT;
- API pública e área administrativa.

Leia `REQUISITOS_MAPA_NASCENTES_DO_CARIRI.md`, `ARQUITETURA_RECOMENDADA_NASCENTES_DO_CARIRI.md`, `AGENT_NEXTJS.md` e `AGENTS.md` antes de mudanças relevantes.

## 3. Objetivo

Usar TypeScript para:

- impedir estados inválidos quando possível;
- tornar fronteiras explícitas;
- detectar erros antes da execução;
- documentar contratos sem duplicação desnecessária;
- facilitar refatoração;
- manter tipos públicos separados da persistência;
- eliminar coerções silenciosas.

## 4. Configuração obrigatória

Mantenha `strict: true`.

Avalie e prefira, quando compatíveis com o projeto:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "useUnknownInCatchVariables": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Não habilite opções mecanicamente em um código existente sem corrigir e testar os efeitos. Não reduza a segurança do compilador para fazer o build passar.

## 5. Regras centrais

- prefira `unknown` a `any` nas fronteiras;
- faça narrowing antes de usar valores desconhecidos;
- não use type assertion para substituir validação;
- evite `!` non-null assertion;
- não use `@ts-ignore` sem erro rastreável e justificativa;
- prefira `@ts-expect-error` apenas em teste ou incompatibilidade conhecida;
- modele estados com uniões discriminadas;
- use tipos pequenos e coesos;
- derive tipos de schemas quando isso evita divergência;
- não exporte tipos internos sem necessidade.

## 6. Tipos do domínio

Tipos sugeridos:

```ts
export type NascenteId = string;
export type ImportacaoId = string;

export interface NascentePublica {
  id: NascenteId;
  latitude: number;
  longitude: number;
  municipio: string;
  fonte: string;
  localidade: string;
  dataCriacao: string;
  vazaoMedia: number;
  unidadeVazao: 'm³/s';
}
```

Adapte IDs ao contrato real. Não introduza branded types em todo o sistema sem benefício medido; considere-os quando IDs diferentes forem confundidos com frequência.

O domínio não deve depender diretamente de tipos Prisma, `FormData`, `NextRequest` ou Leaflet.

## 7. Persistência versus contrato público

Separe:

- modelo Prisma;
- modelo interno validado;
- DTO público;
- formato do TXT;
- props de componentes;
- objetos Leaflet.

Crie mapeadores explícitos:

```ts
function toNascentePublica(row: NascenteRow): NascentePublica {
  return {
    id: String(row.id),
    latitude: decimalToFiniteNumber(row.latitude),
    longitude: decimalToFiniteNumber(row.longitude),
    municipio: row.municipio,
    fonte: row.fonte,
    localidade: row.localidade,
    dataCriacao: formatDateOnly(row.dataCriacao),
    vazaoMedia: decimalToFiniteNumber(row.vazaoMedia),
    unidadeVazao: 'm³/s',
  };
}
```

Não serialize `Prisma.Decimal`, `Date` ou `bigint` de maneira implícita.

## 8. Validação em runtime

TypeScript é apagado em runtime. Dados externos devem ser validados:

- JSON;
- `FormData`;
- query params;
- variáveis de ambiente;
- linhas do TXT;
- respostas do banco transformadas;
- integrações externas.

Use Zod como fonte de verdade quando apropriado:

```ts
const nascenteImportadaSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  municipio: z.string().trim().min(1).max(150),
  fonte: z.string().trim().min(1).max(255),
  localidade: z.string().trim().min(1).max(255),
  dataCriacao: isoDateOnlySchema,
  vazaoMedia: z.number().finite().nonnegative(),
});

type NascenteImportada = z.infer<typeof nascenteImportadaSchema>;
```

Parsing de string para número e validação de número são etapas distintas. Rejeite valores parciais, `NaN` e infinito.

## 9. Datas

`data_criacao` é uma data civil sem horário: a data em que a nascente surgiu na natureza.

- represente no TXT e API como `YYYY-MM-DD`;
- evite conversão acidental de fuso horário;
- não use `new Date('YYYY-MM-DD')` sem compreender UTC e formatação;
- crie tipo, schema e formatador específicos para date-only;
- mantenha o MySQL como `DATE`.

## 10. Unidades e decimais

- vazão é sempre `m³/s`;
- unidade fixa deve ser literal `'m³/s'` no contrato público;
- MySQL e Prisma podem fornecer decimais não equivalentes a `number`;
- converta em uma fronteira explícita;
- valide finitude e faixa;
- documente perda de precisão se converter para `number`;
- não use `parseFloat` sem validar a string completa.

## 11. Estados com uniões discriminadas

Modele estados assíncronos:

```ts
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'empty' }
  | { status: 'error'; message: string; retryable: boolean };
```

Modele importações:

```ts
type ImportacaoStatus =
  | 'VALIDATING'
  | 'WAITING_CONFIRMATION'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';
```

Use `never` para verificar exaustividade em `switch` quando isso trouxer segurança real.

## 12. Erros

Não presuma que o valor capturado é `Error`:

```ts
function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : 'Erro desconhecido';
}
```

Modele erros esperados:

```ts
type ImportResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'INVALID_FILE' | 'DUPLICATE' | 'UNAUTHORIZED'; message: string };
```

Não use exceções como fluxo normal para cada linha inválida do TXT. Acumule erros estruturados com linha, campo, código e mensagem.

## 13. Parser do TXT

Separe os tipos por etapa:

```ts
interface RawTxtRow {
  line: number;
  columns: readonly string[];
}

interface ImportRowError {
  line: number;
  field?: string;
  code: string;
  message: string;
}

type ParsedRow =
  | { valid: true; line: number; value: NascenteImportada }
  | { valid: false; line: number; errors: readonly ImportRowError[] };
```

- preserve o número da linha;
- normalize espaços;
- valide cabeçalho;
- use parser determinístico para `;`;
- não silencie colunas extras ou ausentes;
- trate UTF-8 inválido;
- não misture persistência com parsing.

## 14. Funções

- declare entradas e retornos de APIs públicas;
- permita inferência local quando clara;
- mantenha funções pequenas e com responsabilidade única;
- use overloads apenas quando o comportamento realmente depender da assinatura;
- prefira parâmetros objeto para funções com muitos argumentos;
- não use parâmetro booleano obscuro quando uma união literal comunica melhor;
- marque coleções como `readonly` quando a função não deve alterá-las.

## 15. Objetos, opcionais e nulidade

- diferencie propriedade ausente de valor `undefined`;
- use `null` somente quando o contrato o definir;
- evite tipos com muitos campos opcionais para representar estados incompatíveis;
- não espalhe optional chaining para esconder dados obrigatórios ausentes;
- valide e falhe na fronteira;
- use `satisfies` para conferir forma preservando inferência quando compatível.

## 16. Generics

Use generics quando preservarem relação entre entrada e saída. Não crie abstrações genéricas antes de existir repetição comprovada.

Evite:

- generic usado uma única vez sem relação útil;
- constraints excessivamente amplas;
- retorno `T` construído por assertion;
- repositório genérico que elimina recursos importantes do domínio.

## 17. Enums e constantes

Prefira uniões literais e objetos `as const` para contratos simples:

```ts
export const IMPORT_STATUS = {
  validating: 'VALIDATING',
  completed: 'COMPLETED',
  failed: 'FAILED',
} as const;

export type ImportStatus = typeof IMPORT_STATUS[keyof typeof IMPORT_STATUS];
```

Use `enum` somente quando houver razão de interoperabilidade ou padrão consolidado no repositório.

## 18. React e Next.js

- tipar props diretamente;
- não usar `React.FC` por obrigação;
- eventos devem usar tipos React apropriados;
- refs Leaflet devem aceitar `null` e ser verificadas;
- Server Components não devem receber handlers do cliente;
- tipos compartilhados não devem importar módulos server-only;
- use `import type` quando apropriado;
- não duplique tipos idênticos entre servidor e cliente sem uma fonte comum segura.

## 19. Leaflet

- use tipos oficiais ou `@types/leaflet` compatível com a versão;
- não substitua tipos corretos por `any` para plugins;
- se o plugin não tiver tipos, crie declaração mínima e localizada;
- diferencie `LatLngExpression` de GeoJSON coordinates;
- valide coordenadas antes de construir layers;
- não acesse membros privados para satisfazer o compilador.

## 20. APIs

Padronize envelopes quando isso simplificar os consumidores:

```ts
type ApiSuccess<T> = { data: T; meta?: Record<string, unknown> };
type ApiFailure = { error: { code: string; message: string; fields?: Record<string, string[]> } };
```

Não force um envelope único para respostas sem corpo ou downloads. Status HTTP continua sendo parte do contrato.

## 21. Módulos

- use aliases definidos no `tsconfig` de modo consistente;
- evite ciclos de dependência;
- domínio não importa infraestrutura;
- módulos cliente não importam `server-only`;
- arquivos de barrel não devem criar ciclos ou inflar bundles;
- separe exports públicos de implementações internas.

## 22. Testes de tipos e runtime

Teste runtime para:

- schemas Zod;
- parser;
- coerção de números;
- date-only;
- mapeadores Prisma/DTO;
- estados de erro.

Use testes de tipos quando APIs genéricas ou invariantes complexas justificarem. Não confunda compilação bem-sucedida com cobertura de comportamento.

Execute:

- `tsc --noEmit` ou script equivalente;
- lint;
- testes;
- build Next.js.

## 23. Práticas proibidas

Não faça:

- `any` sem justificativa excepcional;
- `as unknown as T` para forçar compatibilidade;
- `!` para esconder nulidade não resolvida;
- `@ts-ignore` permanente;
- schemas e interfaces divergentes mantidos manualmente;
- tipo Prisma como resposta pública automática;
- serialização implícita de `Decimal`, `Date` ou `bigint`;
- enumeração de status com string livre;
- acesso indexado sem considerar ausência;
- catch assumindo `Error`;
- desabilitar `strict`;
- adicionar `skipLibCheck` apenas para esconder incompatibilidade introduzida;
- criar abstração genérica sem uso concreto.

## 24. Checklist

- [ ] `strict` permanece ativo.
- [ ] Não há `any` novo injustificado.
- [ ] Entradas externas começam como `unknown` e são validadas.
- [ ] Tipos de domínio não dependem de Prisma ou Next.js.
- [ ] DTO público é explícito.
- [ ] `Decimal`, `Date` e `bigint` são convertidos conscientemente.
- [ ] Data civil não sofre deslocamento de fuso.
- [ ] Unidade da vazão é `m³/s`.
- [ ] Estados incompatíveis usam união discriminada.
- [ ] Erros esperados são estruturados.
- [ ] Coordenadas são finitas e estão na faixa.
- [ ] Tipos de Leaflet são compatíveis.
- [ ] Checagem de tipos, testes e build passam.

## 25. Padrão de entrega

Ao concluir uma tarefa, informe:

1. contratos criados ou alterados;
2. validações de runtime adicionadas;
3. assertions ou exceções inevitáveis e suas justificativas;
4. comandos executados;
5. riscos e pendências.

