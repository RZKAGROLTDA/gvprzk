# Períodos de desconto configuráveis nas Regras de Campanha

## 1. Estrutura atual (auditoria)

**`public.campaign_rules`** (7 regras hoje)
- `campaign_name`, `trigger_min`, `trigger_max`, `commitment_value`, `active`, `start_date`, `end_date`
- Percentuais fixos: `gained_april`, `gained_may`, `gained_june` (`gained_june` = 0 em 100% das regras)

**`public.campaign_clients`** (289 lançamentos)
- Cada lançamento **já grava sua própria cópia** de `gained_april`, `gained_may`, `gained_june`, `campaign_trigger_value` e `commitment_value` no momento do lançamento — ou seja, o snapshot histórico já existe fisicamente na linha.
- 289/289 lançamentos possuem valores de abril e maio preenchidos.

**Como o frontend usa hoje** (`src/pages/Campaigns.tsx`)
- Ao criar/editar um lançamento, copia `gained_april`/`gained_may` da regra selecionada para a linha (linhas ~861 e ~1275) — isto é, hoje o snapshot é **sobrescrito** ao reeditar o lançamento, e a listagem prefere o valor atual da regra (`displayApril`/`displayMay`, linhas 1259-1260) em vez do valor gravado.
- Exportação Excel usa as colunas "Ganhou Abril (%)" / "Ganhou Maio (%)".
- Aba Regras exibe e edita "Abr %" / "Mai %".

**Nenhuma função/trigger/RPC do banco referencia `gained_*`** — o impacto é apenas frontend + tabelas.

Consequência importante: os percentuais **não entram em nenhum cálculo agregado** (KPIs somam gatilho e compromisso apenas). São informativos/exibidos.

## 2. Migration proposta

```sql
CREATE TABLE public.campaign_rule_periods (
  id uuid PK default gen_random_uuid(),
  campaign_rule_id uuid NOT NULL REFERENCES public.campaign_rules(id) ON DELETE CASCADE,
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  discount_percent numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at / updated_at timestamptz
);
```
- GRANTs: `SELECT` para `anon`+`authenticated`, `INSERT/UPDATE/DELETE` para `authenticated`, `ALL` para `service_role`.
- RLS espelhando exatamente as políticas atuais de `campaign_rules` (nada de novas permissões).
- Índice em `(campaign_rule_id, sort_order)`.
- Trigger de validação (não CHECK, para permitir comparação entre tabelas):
  - `end_date >= start_date`
  - `discount_percent >= 0`
  - período contido na vigência da regra (quando a regra tem `start_date`/`end_date`)
  - proibição de sobreposição com outro período da mesma regra (`daterange && daterange`)
- Trigger `updated_at`.

**Snapshot de histórico nos lançamentos** — nova coluna:
```sql
ALTER TABLE public.campaign_clients
  ADD COLUMN discount_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
```
Guarda `[{label, start_date, end_date, discount_percent}]` congelado no momento do lançamento. As colunas `gained_april`/`gained_may`/`gained_june` **permanecem intactas** (nada é dropado nesta etapa) para garantir reversibilidade.

## 3. Estratégia de migração dos campos Abr/Mai

Data migration idempotente, sem alterar nenhum valor existente:
1. Para cada regra com `gained_april > 0`, criar período `label='Abril'`, `discount_percent = gained_april`, `sort_order=1`; mesmo para `gained_may` (`'Maio'`, ordem 2) e `gained_june` (`'Junho'`, ordem 3).
2. Datas dos períodos migrados: se a regra tem vigência, usa-se a interseção com o mês correspondente; se não tem (as 4 regras AGRISHOW/AGRINORTE estão "Sem período"), usa-se o mês cheio do ano do `created_at` da regra. Isso mantém as regras antigas legíveis sem inventar vigência.
3. Backfill de `campaign_clients.discount_snapshot` a partir dos `gained_*` já gravados em cada linha — assim os 289 lançamentos passam a carregar seu próprio histórico independente da regra.

## 4. Impacto no frontend

`src/hooks/useCampaigns.ts`
- Novo tipo `CampaignRulePeriod`; hook `useCampaignRulePeriods` (busca por regra ou em lote) e mutações de criar/editar/excluir período (upsert em lote no salvamento da regra).
- Tipos de `CampaignRule` mantêm `gained_*` (legado, não mais editável).
- `useCreateCampaignClient` passa a gravar `discount_snapshot` com os períodos vigentes da regra escolhida.

`src/pages/Campaigns.tsx`
- **Aba Regras**: remover inputs "Abr %"/"Mai %" da criação e da edição inline; adicionar seção "Períodos de desconto" com linhas editáveis (Nome, Data início, Data fim, %, excluir) e botão "+ Adicionar período". Validação client-side espelhando as regras do trigger (dentro da vigência, fim >= início, % >= 0, sem sobreposição) com mensagens inline.
- Resumo da regra passa a listar os períodos (`Agosto 8% · Setembro 7% · Outubro 6%`) em vez de "Abr/Mai".
- **Aba Lançamentos**: a coluna de percentuais passa a ler o `discount_snapshot` do lançamento (fallback para `gained_april`/`gained_may` em linhas antigas), eliminando o comportamento atual em que alterar a regra muda o percentual exibido de lançamentos passados.
- Exportação Excel: colunas dinâmicas por período do snapshot (com fallback para as colunas Abril/Maio quando o lançamento é legado).
- Exclusão de período: bloqueada quando existe lançamento vinculado à regra cujo snapshot referencia aquele label/período — nesse caso o período é apenas removido da regra vigente, e o lançamento continua exibindo o valor do snapshot.

Nada muda em clientes, vendedores, condição especial, KPIs, RLS ou outros módulos.

## 5. Preservação do histórico

- Nenhuma coluna é removida e nenhum valor existente é alterado.
- `campaign_clients` deixa de depender da regra para exibir percentuais: passa a usar snapshot próprio, então editar uma regra no futuro **não altera** lançamentos já realizados.
- Backfill garante que os 289 lançamentos atuais tenham snapshot com exatamente os percentuais que já estão gravados neles.
- Exclusão de período nunca apaga dado de lançamento (FK só em `campaign_rules`, com snapshot desacoplado em jsonb).

Aguardando aprovação para aplicar a migration e implementar o frontend.
