# Campanhas — meses dinâmicos (auditoria + proposta)

## 1. Causa encontrada

Existem **duas fontes de verdade** para os percentuais de desconto:

| Fonte | Onde é usada | Comportamento |
|---|---|---|
| `campaign_rules.discount_periods` (jsonb: `[{label, percent}]`) | apenas aba **Regras** | dinâmico e correto (mostra "Agosto 2,00%") |
| colunas legadas `gained_april` / `gained_may` / `gained_june` | aba **Lançamentos**, seletor "Gatilho / Comprou", exportação Excel | rótulos fixos "Abr %" / "Mai %" no código |

Quando os períodos configuráveis foram introduzidos, a aba Regras passou a ler `discount_periods`, mas Lançamentos continuou lendo as três colunas mensais legadas — e como o formulário de Regras hoje grava só o array (deixando `gained_april/may/june` em 0), o seletor mostra "Abr 2,00% / Mai 0,00%" com número vindo do backfill antigo ou zero.

## 2. Arquivos e funções envolvidos

Tudo em **`src/pages/Campaigns.tsx`** e **`src/hooks/useCampaigns.ts`** (nenhuma RPC calcula mês; o banco só armazena):

- `useCampaigns.ts`: `DiscountPeriod`, `normalizeDiscountPeriods`, tipos `CampaignRule`/`CampaignClient` (ambos ainda com os três campos legados).
- `Campaigns.tsx`:
  - linhas 649-650 — cabeçalhos fixos `Abr %` / `Mai %` da tabela de Lançamentos;
  - 1003-1005 e 1402-1404 — texto do seletor "Gatilho / Comprou" (nova linha e edição inline);
  - 1012-1013 — células auto-preenchidas da linha de inserção;
  - 1343-1344 e 1425-1435 — células de exibição do `EntryRow`;
  - 618-630 — exportação Excel ("Ganhou Abril (%)", "Ganhou Maio (%)");
  - 945-947 / 1359-1361 — gravação de `gained_april/may/june` no lançamento;
  - 2165-2166 — resumo da regra na lista (já usa `discount_periods` com fallback legado);
  - `SellerSummaryTab` (1537+) — **não** exibe meses, só gatilho/compromisso: nada a mudar.
- Banco: `campaign_rules.discount_periods` já existe; `campaign_clients` guarda cópia em `gained_april/may/june`.

## 3. Como funciona hoje

Regras → lê array `discount_periods` → rótulo livre ("Agosto"). Lançamentos → assume três slots fixos abril/maio/junho, copia da regra para o lançamento e rotula no código.

## 4. Proposta de correção (somente apresentação)

Fonte única de verdade: **`campaign_rules.discount_periods`**, com resolução por lançamento via `campaign_rule_id`.

1. Novo helper `src/lib/campaignPeriods.ts`:
   - `getRulePeriods(rule)` → `discount_periods` normalizado; se vazio, deriva do legado (`Abril/Maio/Junho` com percentual > 0). Garante que regra antiga continue mostrando Abril/Maio.
   - `getEntryPeriods(entry, rule)` → períodos da regra vinculada; sem regra vinculada, deriva do legado do próprio lançamento.
   - `buildPeriodColumns(periods[][])` → união ordenada dos rótulos (primeira aparição), usada para montar as colunas dinâmicas.
   - `shortLabel(label)` → abreviação de 3 letras para cabeçalho ("Agosto" → "Ago %"), mantendo rótulo completo no tooltip e no Excel.
   - `formatPeriodsInline(periods)` → "Ago 2,00% · Set 1,50%" para o seletor.
2. Tabela de Lançamentos: substituir as duas colunas fixas por **N colunas geradas** a partir da união dos períodos das regras presentes na lista filtrada (mínimo 1 coluna placeholder "%" quando não houver período). Cada célula busca o percentual do rótulo naquele lançamento; rótulo ausente na regra → "—".
3. Seletor "Gatilho / Comprou" (inserção e edição): texto passa a `R$ 4.000,00 — Ago 2,00% / Comp. R$ 20.000,00`, montado com `formatPeriodsInline`.
4. Exportação Excel: colunas de percentual geradas dinamicamente com o rótulo completo (`Ganhou Agosto (%)`), demais colunas intactas.
5. Gravação: **inalterada**. Continua preenchendo `gained_april/may/june` exatamente como hoje (compatibilidade), sem novas colunas nem migration.

Sem alteração de banco, RPC, permissões, cálculos de gatilho/compromisso ou layout geral (mesma tabela, apenas colunas de percentual dinâmicas).

## 5. Impacto nos dados históricos

Nenhuma escrita. Lançamentos antigos vinculados a regras de Abril/Maio continuam exibindo "Abr %/Mai %" (via `discount_periods` do backfill ou via fallback legado). Lançamentos sem regra vinculada caem no fallback com os próprios valores gravados. Campanhas de Agosto/Setembro/futuras aparecem automaticamente.

## 6. Múltiplas campanhas selecionadas

As colunas são a **união** dos períodos das regras visíveis, na ordem de primeira aparição (ex.: Abril, Maio, Agosto = 3 colunas). Cada linha preenche apenas os meses da sua própria regra; os demais ficam "—", sem misturar percentuais entre campanhas. A exportação segue a mesma união.

## 7. Riscos

- Baixo: mudança visual/renderização apenas; nenhuma mutação, cálculo ou policy alterada.
- Tabela pode ficar mais larga com muitos meses distintos — mitigado pelo `overflow-x-auto` já existente e pelo rótulo abreviado.
- `colSpan` das linhas de estado vazio/carregando precisa passar a ser calculado — ajustado no mesmo commit.
- Rótulos livres digitados pelo usuário ("ago/26", "AGOSTO") aparecem como digitados; sem normalização forçada para não inventar regra de negócio.

Aprovar para implementar apenas a camada de apresentação descrita.
