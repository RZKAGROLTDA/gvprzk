# Regras de Campanha: períodos de desconto configuráveis

Escopo exclusivo: `campaign_rules`, `campaign_clients` e a tela Campanhas. Nada de outros módulos.

## 1. Estrutura nova

Uma tabela filha guarda os períodos, substituindo os campos fixos de mês:

```text
campaign_rules (1) ──< campaign_rule_periods (N)
   campaign_name            label            ("Agosto")
   trigger_min              start_date       (01/08/2026)
   trigger_max              end_date         (31/08/2026)
   commitment_value         discount_percent (8)
   active                   sort_order
   start_date / end_date
   gained_april/may/june  <- mantidos como legado, somente leitura
```

`gained_april/may/june` continuam existindo nesta etapa (nada é removido, nada é recalculado).

## 2. Migration proposta

```sql
CREATE TABLE public.campaign_rule_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_rule_id uuid NOT NULL REFERENCES public.campaign_rules(id) ON DELETE CASCADE,
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  discount_percent numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.campaign_rule_periods (campaign_rule_id, sort_order);
```

- **GRANTs** iguais aos de `campaign_rules`: leitura/escrita para `authenticated`, `ALL` para `service_role`.
- **RLS**: habilitada, com políticas espelhando exatamente as políticas atuais de `campaign_rules` (mesmos cargos, mesma lógica). Nenhuma permissão nova, nenhuma política existente alterada.
- **Trigger de validação** (trigger em vez de CHECK, pois precisa consultar a regra-mãe e os irmãos):
  - `end_date >= start_date`
  - `discount_percent >= 0`
  - período contido em `campaign_rules.start_date/end_date` quando a regra tiver vigência definida
  - nenhuma sobreposição com outro período da mesma regra (`daterange(start,end,'[]') && ...`)
  - quantidade de períodos livre (sem limite)
- **Trigger** de `updated_at`.

## 3. Estratégia de migração dos campos atuais

Data migration idempotente, executada uma única vez após a criação da tabela. Para cada uma das 7 regras, um `INSERT ... WHERE NOT EXISTS`:

| Campo origem | label | sort_order | condição |
|---|---|---|---|
| `gained_april` | `Abril` | 1 | `gained_april > 0` |
| `gained_may` | `Maio` | 2 | `gained_may > 0` |
| `gained_june` | `Junho` | 3 | `gained_june > 0` |

`discount_percent` recebe o valor exato da coluna de origem.

Datas dos períodos migrados:
- regra **com vigência** (as 3 regras LUB, 01/08/2026–31/08/2026): usa-se a interseção do mês do label com a vigência da regra, de modo que o período migrado nunca viole a validação;
- regra **sem vigência** (as 4 regras AGRISHOW/AGRINORTE, `start_date`/`end_date` nulos): usa-se o mês cheio referente ao ano de `created_at` da regra.

Nada é apagado: os `gained_*` permanecem na tabela como fonte de conferência e possibilidade de rollback.

## 4. Snapshot dos novos lançamentos

Recomendação: **JSONB em `campaign_clients`**, não tabela filha.

```sql
ALTER TABLE public.campaign_clients
  ADD COLUMN discount_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
```

Conteúdo gravado na criação do lançamento:

```json
[{"label":"Agosto","start_date":"2026-08-01","end_date":"2026-08-31","discount_percent":8}]
```

Por que JSONB e não tabela filha:
- o snapshot é um dado **imutável e sempre lido junto** com a linha do lançamento — não há consulta que precise filtrar por período isolado;
- evita 289+ linhas extras e um segundo round-trip na listagem, que hoje já é a tela mais sensível a Disk IO;
- desacopla totalmente o histórico da regra: excluir ou editar um período nunca toca o lançamento (não há FK).

Backfill dos 289 lançamentos existentes: `discount_snapshot` montado a partir dos `gained_april`/`gained_may`/`gained_june` **já gravados na própria linha** — ou seja, os percentuais históricos são exatamente os mesmos, apenas em novo formato. As colunas antigas continuam intactas nos lançamentos.

## 5. Correção para impedir sobrescrita do histórico ao editar

Problema confirmado na auditoria de `src/pages/Campaigns.tsx`:
- linhas 1259-1266: a linha em edição exibe `currentRule.gained_april/gained_may/commitment_value/trigger_min`, ou seja, o valor **atual da regra**, ignorando o que está gravado no lançamento;
- linhas 1270-1282 (`handleSave` de `EntryRow`): o update copia de volta `campaign_trigger_value`, `gained_april`, `gained_may`, `gained_june` e `commitment_value` da regra — qualquer reedição (mesmo só para trocar a nota fiscal) reescreve o snapshot histórico com os valores vigentes;
- linhas 861-863 fazem o mesmo no diálogo de criação — correto ali, pois é o momento da criação.

Correções:
1. `handleSave` da edição passa a atualizar **apenas** os campos operacionais: `filial_id`, `invoice_number`, `sold_trigger`, `client_code`/`client_name`. `campaign_trigger_value`, `commitment_value`, `gained_*` e `discount_snapshot` saem do patch.
2. Exibição da linha deixa de ler a regra: passa a usar `entry.campaign_trigger_value`, `entry.commitment_value` e `entry.discount_snapshot` (com fallback para `gained_april/may` em linhas sem snapshot).
3. Troca de regra em um lançamento já criado: a regra fica **somente leitura** por padrão; se o usuário realmente precisar reclassificar, uma ação explícita "Reaplicar regra atual" reescreve o snapshot com confirmação — nunca de forma implícita ao salvar.
4. Tipagem: `useUpdateCampaignClient` (`src/hooks/useCampaigns.ts`) restringe o `patch` aos campos operacionais, tornando a sobrescrita impossível a partir do código de edição.

Resultado: alteração de regra ou de período afeta **apenas novos lançamentos**.

## 6. Impacto no frontend

`src/hooks/useCampaigns.ts`
- tipo `CampaignRulePeriod` e hook `useCampaignRulePeriods` (busca em lote por `campaign_rule_id`);
- mutações de criar/atualizar/excluir período (upsert em lote ao salvar a regra);
- `useCreateCampaignClient` grava `discount_snapshot` a partir dos períodos da regra escolhida;
- `useUpdateCampaignClient` com patch restrito (item 5.4).

`src/pages/Campaigns.tsx`
- **Aba Regras**: removidos os inputs "Abr %" / "Mai %" da criação (`NewRuleDialog`) e da edição inline (`RuleRow`); em seu lugar a seção **Períodos de desconto**, com linhas `Nome | Início | Fim | % | excluir` e botão `+ Adicionar período`. Validação client-side espelhando o trigger (fim >= início, dentro da vigência, % >= 0, sem sobreposição), com mensagem inline e bloqueio do salvar.
- Resumo da regra passa a listar os períodos (`Agosto 8% · Setembro 7% · Outubro 6%`) em vez de "Abr/Mai".
- **Aba Lançamentos**: colunas de percentual passam a vir do snapshot do lançamento; percentuais somente leitura.
- Exportação Excel: colunas de percentual derivadas do snapshot, com fallback às colunas Abril/Maio nos lançamentos legados.
- Exclusão de período: permitida na regra (o histórico vive no snapshot do lançamento, então não há perda); a UI avisa que períodos já utilizados continuam preservados nos lançamentos.

Sem mudanças em KPIs de gatilho/compromisso, condição especial, clientes, vendedores, RLS ou outras abas.
