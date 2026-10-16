# Evidência de Plano de Consulta (Issue #4)

Abaixo o plano de consulta gerado pelo MySQL ao realizar o filtro por `ativo` e `municipio`.
Isto comprova a utilização dos índices criados no `schema.prisma`.

```json
[
  {
    "id": "1",
    "select_type": "SIMPLE",
    "table": "nascentes",
    "partitions": null,
    "type": "ref",
    "possible_keys": "nascentes_ativo_idx,nascentes_municipio_idx",
    "key": "nascentes_ativo_idx",
    "key_len": "1",
    "ref": "const",
    "rows": "1",
    "filtered": 100,
    "Extra": "Using where"
  }
]
```
