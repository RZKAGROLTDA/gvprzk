# Oportunidades de Serviços — Auditoria + Proposta (nada aplicado)

## 0. Auditoria da estrutura atual (dados reais, hoje)

Não existe modelo normalizado de checklist. Um checklist aplicado é:

```text
tasks (task_type='checklist')
 ├─ client / clientcode / property     → cliente (texto, sem FK)
 ├─ filial / filial_atendida (texto)   → comparar sempre com LOWER(TRIM())
 ├─ created_by (uuid) / responsible (texto)
 ├─ start_date                         → data do checklist
 └─ checklist_machine (jsonb)          → tipo, modelo, chassi_serie, ano, horimetro, status
products (1 linha por item do checklist)
 ├─ name            → nome do item
 ├─ response_status → conforme | atencao | nao_conforme | na | NULL
 ├─ response_notes  → observação
 └─ photos          → NUNCA carregar no drill-down
```

Volumes atuais:

| Métrica | Valor |
|---|---|
| Checklists totais | 282 |
| Itens de checklist | 1.190 |
| Itens não avaliados (NULL) | 220 |
| Itens de oportunidade (atenção + não conforme) | 115 |
| Checklists com ≥1 oportunidade | 74 |
| Taxa de oportunidade | 26,2% (74/282) |
| Clientes únicos com oportunidade | 38 |
| Máquinas únicas com oportunidade | 73 |
| Itens sem chassi/série | 1 |
| Período com dados | 2026-07-20 a 2026-08-21 |

## 1. Arquitetura proposta

Todo cálculo no banco; frontend só renderiza. Duas RPCs `STABLE SECURITY DEFINER` + uma função determinística de mapeamento. Nenhuma tabela nova, nenhuma coluna nova, nenhum trigger.

```text
Management.tsx (nova aba)
  └─ useServiceOpportunities.ts
       ├─ rpc get_service_opportunities_summary(...)  → KPIs + ranking + filial + vendedor + mês
       └─ rpc get_service_opportunities_details(...)  → drill-down paginado
             └─ map_checklist_item_to_service(text)   → IMMUTABLE
```

## 2. RPCs a criar

**`get_service_opportunities_summary(p_start_date, p_end_date, p_filial_id, p_seller_role, p_seller_id, p_service_type, p_severity, p_machine_type, p_client)`**
Retorna um único `jsonb` com quatro blocos, em uma passada sobre o CTE base:
`kpis`, `by_service` (ranking principal), `by_filial`, `by_seller`, `by_month`.

**`get_service_opportunities_details(<mesmos filtros>, p_limit int default 50, p_offset int default 0)`**
Retorna as linhas do drill-down + `total_count` como coluna window (`COUNT(*) OVER()`), evitando `count exact` em query separada. Nunca seleciona `products.photos`.

## 3. Função auxiliar

`public.map_checklist_item_to_service(p_item text) RETURNS text` — `IMMUTABLE`, `STRICT`-safe, normaliza com `LOWER(TRIM())`:

| Item | Tipo de Serviço |
|---|---|
| Verificação de Pneus | Pneus |
| Verificação de Líquidos | Fluidos / Arrefecimento |
| Verificação de Luzes | Sistema Elétrico |
| Verificação de Óleo do Motor | Lubrificação / Motor |
| Nível de Óleo da Transmissão | Transmissão |
| Teste de Bateria | Baterias |
| Inspeção de Suspensão | Suspensão |
| Limpeza Geral | `EXCLUIR` (não é oportunidade comercial) |
| qualquer outro | Outros Serviços |

Sem categorias para Ar-condicionado / Hidráulico / Revisão Preventiva (não existem no checklist atual).

## 4. Índices

Apenas dois, ambos parciais e pequenos:

```sql
CREATE INDEX IF NOT EXISTS idx_products_response_status_open
  ON public.products (task_id, name)
  WHERE response_status IN ('atencao','nao_conforme');

CREATE INDEX IF NOT EXISTS idx_tasks_checklist_start_date
  ON public.tasks (start_date)
  WHERE task_type = 'checklist';
```

Nada em `checklist_machine` (volume baixo, GIN desnecessário).

## 5. Frontend

Criados:
- `src/hooks/useServiceOpportunities.ts` (2 queries, `staleTime` 5 min, `refetchOnWindowFocus: false`)
- `src/components/management/ServiceOpportunitiesTab.tsx` (KPIs + ranking + visões + drill-down)
- `src/lib/serviceOpportunities.ts` (labels, cores de severidade, ordem de exibição)

Alterado:
- `src/pages/Management.tsx` — adicionar `TabsTrigger`/`TabsContent` `oportunidades-servicos`, reaproveitando o objeto `filters` existente. Nenhuma aba existente é tocada.

## 6. Como fica a aba

```text
[ Filtros existentes: Período | Filial | Cargo | Responsável ]  + [Tipo de Serviço] [Severidade] [Tipo de Máquina] [Cliente 🔍]

┌ Oportunidades ┐┌ Clientes ┐┌ Máquinas ┐┌ Checklists ┐┌ Taxa ┐┌ Não avaliados ┐
│      115      ││    38    ││    73    ││     74     ││26,2% ││      220      │

RANKING POR TIPO DE SERVIÇO  (clique na linha → drill-down)
Tipo de Serviço            Oport.  Alta  Média  Clientes  Máquinas  % Total
Fluidos / Arrefecimento      27     11    16       20        27      24,5%
Pneus                        23      0    23       15        23      20,9%
Sistema Elétrico             17      0    17       14        17      15,5%
Transmissão                  16      2    14       12        15      14,5%
Lubrificação / Motor         15      0    15       14        15      13,6%
Baterias                      7      0     7        4         7       6,4%
Suspensão                     6      0     6        5         6       5,5%

[Por Filial]  [Por Responsável]  [Evolução mensal — 1 gráfico de barras]
```

Barra de severidade embutida na linha (alta/média), sem gráficos extras. Layout executivo: tabela em `overflow-x-auto`, números alinhados à direita, `whitespace-nowrap`, cards no mobile.

## 7. Regra exata de cada KPI

Base comum (`opp`): `products p JOIN tasks t ON t.id = p.task_id AND t.task_type='checklist'`, `p.response_status IN ('atencao','nao_conforme')`, item ≠ "Limpeza Geral", + filtros + escopo de permissão.

| KPI | Cálculo |
|---|---|
| Oportunidades Potenciais | `COUNT(*)` de itens em `opp` |
| Clientes com Oportunidade | `COUNT(DISTINCT client_key)` em `opp` |
| Máquinas com Oportunidade | `COUNT(DISTINCT machine_key)` em `opp` |
| Checklists com Oportunidade | `COUNT(DISTINCT p.task_id)` em `opp` |
| Taxa de Oportunidade | `checklists_com_opp / checklists_no_periodo * 100` (denominador = checklists que passam pelos filtros de período/filial/cargo/responsável e escopo, **sem** os filtros de serviço/severidade) |
| Itens Não Avaliados | `COUNT(*)` de itens com `response_status IS NULL` no mesmo universo de checklists do denominador |

Severidade: `nao_conforme` = ALTA, `atencao` = MÉDIA. `conforme`, `na`, `NULL` nunca entram.

## 8. Cliente único

`client_key = LOWER(TRIM(COALESCE(NULLIF(t.clientcode,''), t.client)))` — prioriza código, cai para nome normalizado. Mesma convenção já usada em `get_management_seller_summary`.

## 9. Máquina única

```sql
machine_key = UPPER(COALESCE(
  NULLIF(TRIM(t.checklist_machine->>'chassi_serie'), ''),   -- principal
  NULLIF(TRIM(t.checklist_machine->>'modelo'), '') || '|' || client_key,  -- fallback 1
  'task:' || t.id::text                                     -- fallback 2 (nunca colapsa registros distintos)
))
```

Hoje só 1 item de oportunidade está sem chassi, então o fallback é residual.

**DISTINCT por categoria:** no ranking, `clientes` e `maquinas` são `COUNT(DISTINCT ...)` calculados **dentro do `GROUP BY` do tipo de serviço**. Um cliente presente em Pneus e Baterias conta 1 em cada linha e a soma das linhas propositalmente não fecha com o KPI global (o KPI é DISTINCT global).

## 10. Drill-down

Clique na linha do ranking (ou no número) → painel/tabela paginada server-side (50 por página) chamando `get_service_opportunities_details` com o `service_type` da linha aplicado sobre os filtros vigentes. Colunas: Cliente, Código, Máquina (tipo), Modelo, Série/Chassi, Filial, Responsável, Data, Item, Tipo de Serviço, Severidade, Observação. **`products.photos` não entra no SELECT.**

## 11. Reaproveitamento de filtros

A aba consome o mesmo `filters: ManagementFilters` já montado em `Management.tsx` (período, filial UUID, cargo, vendedor UUID), com a mesma normalização `'all'/'todos' → NULL` de `useManagementData.ts`. Os quatro filtros novos (tipo de serviço, severidade, tipo de máquina, cliente) são locais da aba e enviados como parâmetros extras — não afetam as outras abas.

## 12. Permissões preservadas

As RPCs replicam **literalmente** o bloco de escopo já usado em `get_management_seller_summary`:

```sql
v_is_admin OR v_is_manager
OR (v_is_supervisor AND <filial> = get_supervisor_filial_id(v_user_id))
OR t.created_by = v_user_id
```

Reutiliza `has_role()` e `get_supervisor_filial_id()`. Admin/Manager = global; Supervisor = filial; RAC/CPA/CSA e demais = próprios registros — paridade RAC = CPA = CSA intacta (o `primary_role` já trata cpa/csa com o mesmo peso de rac). Nenhuma policy, grant ou role novo.

## 13. Performance esperada

- 115 itens de oportunidade / 1.190 itens totais → agregação trivial, esperado < 50 ms com os índices parciais.
- Uma requisição para todo o topo da tela (summary em `jsonb`), uma para o drill-down sob demanda.
- `COUNT(*) OVER()` em vez de `count exact`; sem `SELECT *`; sem `photos`.
- Índices parciais não afetam escrita relevante nem as telas existentes (Parque de Máquinas, CRM, Reports permanecem intocados).

## 14. Riscos identificados

| Risco | Mitigação |
|---|---|
| Filial em `tasks` é texto livre, mas o filtro da Análise Gerencial é UUID | resolver via `profiles.filial_id` do `created_by` (como o bloco `comm` da RPC atual já faz), não por string |
| `tipo` de máquina inconsistente ("Trator" vs "TRATOR", "6110j") | normalizar com `INITCAP(LOWER(TRIM()))` só na exibição/filtro; dado nunca alterado |
| Soma de clientes/máquinas por categoria ≠ KPI global | documentado na UI com nota "DISTINCT por categoria" |
| 220 itens NULL podem sugerir subnotificação | exposto como KPI "Itens Não Avaliados" em vez de inferido |
| Base pequena (74 checklists com oportunidade) | ranking pode oscilar; exibir também % do total, não só valor absoluto |

## 15. Números reais que apareceriam hoje (sem filtro)

KPIs: 115 oportunidades · 38 clientes · 73 máquinas · 74 checklists · 26,2% taxa · 220 itens não avaliados.
Ranking: conforme tabela do item 6. Por filial: Canarana 60, Caiapônia 32, Porto Alegre do Norte 15, Alto Taquari 4, Querência 4. Por mês: 2026-07 → 36, 2026-08 → 79. Tipo de máquina: Trator 65, Colheitadeira 38, Pulverizador 11.

## Confirmações explícitas

- Nenhum dado histórico será alterado.
- Nenhum checklist existente será alterado.
- Nenhuma resposta de checklist será alterada.
- Nenhuma permissão será modificada.
- Nenhuma RLS será modificada.
- Nenhuma funcionalidade existente será removida.
- Nada foi aplicado nesta etapa: somente leituras (`SELECT`) e esta proposta.
