# Períodos de desconto configuráveis nas Regras de Campanha

Escopo: apenas a aba **Regras** da tela Campanhas + uma coluna nova no banco. Nada mais muda.

## 1. Alteração mínima no banco

Uma única coluna, sem tabela nova, sem remover nada:

```sql
ALTER TABLE public.campaign_rules
  ADD COLUMN discount_periods jsonb NOT NULL DEFAULT '[]'::jsonb;
```

Formato do conteúdo (array ordenado, só os dois campos pedidos):

```json
[{"label":"Agosto","percent":10},
 {"label":"Setembro","percent":8},
 {"label":"Outubro","percent":6}]
```

`gained_april`, `gained_may`, `gained_june` **continuam existindo** na tabela e nada é apagado — nenhuma RLS, política, RPC ou lançamento é alterado.

## 2. Preservação de Abril/Maio das campanhas atuais

No mesmo migration, backfill único das 7 regras existentes: cada percentual legado maior que zero vira um período, na ordem Abril → Maio → Junho.

```sql
UPDATE public.campaign_rules
SET discount_periods = (
  SELECT COALESCE(jsonb_agg(p ORDER BY ord), '[]'::jsonb)
  FROM (
    VALUES ('Abril', gained_april, 1), ('Maio', gained_may, 2), ('Junho', gained_june, 3)
  ) AS t(label, pct, ord),
  LATERAL (SELECT jsonb_build_object('label', label, 'percent', pct) AS p) x
  WHERE COALESCE(pct, 0) > 0
)
WHERE discount_periods = '[]'::jsonb;
```

Resultado esperado:

| Campanha | Gatilho | Períodos após backfill |
|---|---|---|
| LUB | R$ 4.000 | Abril 2% |
| LUB | R$ 7.000 | Abril 4% |
| LUB | R$ 40.000 | Abril 6% |
| AGRINORTE | R$ 5.000 | Abril 8% · Maio 7% |
| AGRISHOW | R$ 5.000 | Abril 7% · Maio 6% |
| AGRISHOW | R$ 8.000 | Abril 8% · Maio 7% |
| AGRISHOW | R$ 10.000 | Abril 9% · Maio 8% |

O backfill é idempotente (só toca regras com `[]`).

## 3. Como fica o formulário de Regras

Removidos os inputs fixos **Abr %**, **Mai %**, **Jun %** (na criação e na edição inline). No lugar:

```text
Períodos de desconto
┌───────────────────────┬─────────┬───┐
│ Mês/Período           │   %     │ 🗑 │
├───────────────────────┼─────────┼───┤
│ Agosto                │  8,00   │ 🗑 │
│ Setembro              │  7,00   │ 🗑 │
│ Outubro               │  6,00   │ 🗑 │
└───────────────────────┴─────────┴───┘
              [ + Adicionar período ]
```

- `Mês/Período` = texto livre; `%` = número. Sem datas.
- Adicionar / editar / remover livremente, N períodos por campanha.
- Salvar grava o array inteiro em `discount_periods`.
- Validação leve: label não vazio e percentual >= 0; regra sem período nenhum é permitida.
- O resumo da regra na lista passa de `Abr 8% / Mai 7%` para `Abril 8% · Maio 7%` lido dos períodos (cai para os campos legados se o array estiver vazio).

## Fora de escopo (confirmado)

Aba Lançamentos, exportação Excel, snapshot por lançamento, datas por período, cálculos e demais telas permanecem exatamente como estão.
