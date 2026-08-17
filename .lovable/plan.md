# Regras de Campanha: períodos de desconto configuráveis

Escopo exclusivo: `campaign_rules`, `campaign_clients` e a tela Campanhas. Nenhum outro módulo.

## 1. Migration completa proposta

```sql
-- 1) Tabela de períodos
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

CREATE INDEX idx_campaign_rule_periods_rule
  ON public.campaign_rule_periods (campaign_rule_id, sort_order);

-- 2) GRANTs (obrigatórios para o Data API alcançar a tabela)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_rule_periods TO authenticated;
GRANT ALL ON public.campaign_rule_periods TO service_role;

-- 3) RLS espelhando exatamente as políticas atuais de campaign_rules
ALTER TABLE public.campaign_rule_periods ENABLE ROW LEVEL SECURITY;
-- leitura: mesmos usuários que já leem campaign_rules
-- escrita: mesmos cargos que já gerenciam campaign_rules (manager/admin/supervisor)

-- 4) Validação por trigger (não CHECK: precisa consultar a regra-mãe e os irmãos)
--    - end_date >= start_date
--    - discount_percent >= 0
--    - período contido na vigência da regra, quando a regra tiver start/end
--    - sem sobreposição com outro período da mesma regra:
--      daterange(NEW.start_date, NEW.end_date, '[]') && daterange(p.start_date, p.end_date, '[]')
--    - sem limite de quantidade de períodos

-- 5) Trigger de updated_at (reutiliza public.update_updated_at_column)

-- 6) Snapshot por lançamento
ALTER TABLE public.campaign_clients
  ADD COLUMN discount_periods_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
```

Nada é removido: `gained_april`, `gained_may`, `gained_june` permanecem em `campaign_rules` e em `campaign_clients`. Nenhuma política existente é alterada. Nenhum dos 289 lançamentos é tocado (a nova coluna nasce com `[]`).

## 2. Estratégia de snapshot

- Estrutura: **JSONB `campaign_clients.discount_periods_snapshot`**, array ordenado por `sort_order`, cada item com `label`, `start_date`, `end_date`, `discount_percent`.
- Gravado **uma única vez**, no momento da criação do lançamento, a partir dos períodos então vigentes da regra escolhida.
- Nenhum caminho de update escreve nessa coluna. Alterar/excluir períodos da regra depois disso não altera lançamento algum (não existe FK do snapshot para os períodos).
- Por que JSONB e não tabela filha: o snapshot é imutável e sempre lido junto com a linha do lançamento; nenhuma consulta precisa filtrar por período isolado; evita centenas de linhas extras e um segundo round-trip na aba mais sensível a Disk IO.

## 3. Estratégia de migração das regras existentes

Regra de ouro: **não inventar datas**. Só migra quem tem informação suficiente.

| Campanha | Gatilho | Vigência | % legados | Ação |
|---|---|---|---|---|
| LUB | R$ 4.000 | 01/08/2026–31/08/2026 | Abr 2% | migra: `Agosto` 01/08–31/08, 2% |
| LUB | R$ 7.000 | 01/08/2026–31/08/2026 | Abr 4% | migra: `Agosto` 01/08–31/08, 4% |
| LUB | R$ 40.000 | 01/08/2026–31/08/2026 | Abr 6% | migra: `Agosto` 01/08–31/08, 6% |
| AGRINORTE | R$ 5.000 | sem período | Abr 8% / Mai 7% | **ajuste manual** |
| AGRISHOW | R$ 5.000 | sem período | Abr 7% / Mai 6% | **ajuste manual** |
| AGRISHOW | R$ 8.000 | sem período | Abr 8% / Mai 7% | **ajuste manual** |
| AGRISHOW | R$ 10.000 | sem período | Abr 9% / Mai 8% | **ajuste manual** |

Detalhes:
- as 3 regras LUB têm exatamente **um** percentual não nulo e vigência bem definida de um único mês (agosto/2026), então o período migrado recebe o label do mês da vigência e as datas da própria vigência — sem suposição de ano;
- as 4 regras AGRISHOW/AGRINORTE não têm `start_date`/`end_date`; migrar "Abril/Maio" exigiria adivinhar o ano, o que fica de fora. Elas aparecem na aba Regras com o aviso **"Períodos pendentes de definição"** e continuam exibindo os percentuais legados até que o gerente cadastre os períodos manualmente;
- `gained_june` = 0 em todas as 7 regras: nada a migrar;
- o `INSERT` é idempotente (`WHERE NOT EXISTS`), podendo ser reexecutado sem duplicar.

## 4. Alterações exatas no frontend

`src/hooks/useCampaigns.ts`
- novo tipo `CampaignRulePeriod` e campo `discount_periods_snapshot` em `CampaignClient`;
- `useCampaignRulePeriods()` — busca em lote todos os períodos, agrupados por `campaign_rule_id`;
- `useSaveCampaignRulePeriods()` — upsert em lote + delete dos removidos, ao salvar a regra;
- `useCreateCampaignClient` passa a gravar `discount_periods_snapshot` com os períodos da regra escolhida;
- `useUpdateCampaignClient`: o tipo do `patch` é reduzido a `filial_id`, `invoice_number`, `sold_trigger`, `client_code`, `client_name` — remove `campaign_trigger_value`, `commitment_value`, `gained_april`, `gained_may`, `gained_june`, `campaign_rule_id`. A sobrescrita passa a ser impossível pelo tipo.

`src/pages/Campaigns.tsx` — aba **Regras**
- `NewRuleDialog`: removidos os inputs `Abr %` / `Mai %`; adicionada a seção **Períodos de desconto** (linhas `Nome | Início | Fim | % | excluir` + botão `+ Adicionar período`, N períodos);
- `RuleRow`: mesma seção na edição inline; o resumo da regra passa de `Abr 8% · Mai 7%` para a lista de períodos (`Agosto 8% · Setembro 7% · Outubro 6%`), ou o aviso "Períodos pendentes de definição";
- validação client-side espelhando o trigger, com mensagem inline e botão salvar bloqueado.

`src/pages/Campaigns.tsx` — aba **Lançamentos**
- as duas colunas fixas de percentual (linhas 928-929 / 1259-1260) são substituídas por **uma** coluna "Descontos", compacta: primeiro período + `+N` , com popover mostrando todos (`Agosto 8% / Setembro 7% / Outubro 6%`);
- fonte do dado: `entry.discount_periods_snapshot` quando não vazio; caso contrário, fallback para os `gained_april/gained_may/gained_june` da própria linha (lançamentos legados) — **nunca** os valores atuais da regra;
- gatilho e compromisso da linha passam a ler `entry.campaign_trigger_value` e `entry.commitment_value`;
- `handleSave` da linha (hoje linhas 1268-1285) deixa de enviar regra, gatilho, compromisso e `gained_*`; salva apenas os campos operacionais;
- a troca de regra em lançamento já criado fica somente leitura; reclassificação exige ação explícita "Reaplicar regra atual" com confirmação, que é o único caminho capaz de reescrever o snapshot.

**Exportação Excel**
- nova coluna `Períodos de Desconto` com o texto `Agosto: 8% | Setembro: 7% | Outubro: 6%`, derivada do snapshot;
- para lançamentos legados (snapshot vazio), essa coluna é preenchida a partir dos percentuais legados da própria linha, no mesmo formato (`Abril: 8% | Maio: 7%`), e as colunas `Ganhou Abril (%)`/`Ganhou Maio (%)` permanecem por ora para conferência.

## 5. Preservação do histórico antigo

- Nenhuma coluna removida, nenhum dado dos 289 lançamentos alterado, nenhuma conversão em massa nesta etapa.
- Lançamentos legados continuam exibindo e exportando os percentuais que já estão gravados **na própria linha**.
- A listagem para de preferir os valores atuais da regra, o que corrige o efeito atual de "percentual do passado mudou porque a regra mudou".
- O update de lançamento não pode mais tocar percentual, gatilho, compromisso nem snapshot — garantido no tipo do hook e no patch enviado.
- Consequência: alterar uma regra ou seus períodos afeta **apenas novos lançamentos**.

## 6. Exemplo de campanha com 3 períodos

`campaign_rules`
```
AGRINORTE 2026 | gatilho R$ 5.000 | compromisso R$ 30.000
vigência 01/08/2026 → 31/10/2026 | ativa
```

`campaign_rule_periods`
```
Agosto    | 2026-08-01 | 2026-08-31 | 8% | 1
Setembro  | 2026-09-01 | 2026-09-30 | 7% | 2
Outubro   | 2026-10-01 | 2026-10-31 | 6% | 3
```

Lançamento criado em 12/08/2026 grava:
```json
[{"label":"Agosto","start_date":"2026-08-01","end_date":"2026-08-31","discount_percent":8},
 {"label":"Setembro","start_date":"2026-09-01","end_date":"2026-09-30","discount_percent":7},
 {"label":"Outubro","start_date":"2026-10-01","end_date":"2026-10-31","discount_percent":6}]
```

Se em setembro o gerente mudar outubro de 6% para 5%, esse lançamento continua mostrando 6%; somente lançamentos criados depois da alteração mostram 5%.

Aguardando aprovação para aplicar a migration e implementar o frontend.
