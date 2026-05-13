# Padronização Global de Métricas — Diagnóstico + Matriz Oficial

> Objetivo: qualquer tela usando o **mesmo período + mesmos filtros** deve produzir
> **a mesma percepção operacional**. Hoje há divergência porque cada tela usa
> uma combinação diferente de fonte, data, filial e regra de contagem.

---

## 1. Diagnóstico por tela (estado atual)

| # | Tela | Fonte | Data usada | Regra de filial | Contagem | Agrupamento | Filtros aceitos |
|---|------|-------|-----------|-----------------|----------|-------------|-----------------|
| 1 | **CRM › Agenda Semanal** (`WeeklyAgenda.tsx` → `get_weekly_followups_agenda`) | `task_followups` | `activity_date` | `filial_id` | atividades, visitas, ligações, checklists, **clientes únicos** (por `client_code`/`client_name`) | por dia (YYYY-MM-DD) | período (semana), responsável, filial_id |
| 2 | **CRM › Carteira** (`ClientPortfolio.tsx` + `useFollowups`) | `task_followups` (full table) | `activity_date` (último contato) | `filial_id` | clientes únicos por `client_code`/`client_name` | por cliente | período, filial_id |
| 3 | **CRM › Retornos** (`Returns.tsx` + `useFollowupsProspectsOnly`) | `task_followups` JOIN `tasks.sales_type='prospect'` | `next_return_date` (fallback `activity_date`) | `filial_id` | follow-ups com retorno pendente | por cliente | período, filial_id, status retorno |
| 4 | **CRM › Gerencial** (`CRMManagement.tsx` + `useFollowups`) | `task_followups` (full table, client-side) | `activity_date` | `filial_id` | atividades, clientes únicos, retornos pendentes | por filial / por vendedor | período, filial_id |
| 5 | **Dashboard › Funil** (`SalesFunnel.tsx`) | `tasks` via RPC `get_secure_tasks_paginated_filtered` + `opportunities` (direta) | `start_date` (tasks) e `data_criacao`/`created_at` (opportunities) | `filial` (texto) **e** `filial_atendida` | tasks por `task_type`, opportunities por `status` | — | período (≥90d hardcoded), filial, filial_atendida, consultor |
| 6 | **Dashboard › Clientes** (`FunnelClientsOptimized.tsx`) | `tasks` (mesma fonte do Funil) | `start_date` | `filial` | clientes por `client`/`clientcode` | por cliente | mesmos do Funil |
| 7 | **Dashboard › Tarefas** (`FunnelTasksOptimized.tsx`) | `tasks` | **`created_at`** ⚠️ | `filial` | tasks | por mês de `created_at` | mesmos do Funil |
| 8 | **Dashboard › Métricas consolidadas** (`useConsolidatedSalesMetrics` → `get_activity_metrics_v2`) | `task_followups` (operacional) + `tasks` (financeiro) | `activity_date` | `filial_id` | visitas, ligações, checklists, prospects, vendas total/parcial/perdida | overview + funil | período (sem 90d), filial_id, responsável |
| 9 | **Relatórios** (`Reports.tsx`) | `tasks` via RPCs `get_task_type_counts`, `get_prospects_aggregate`, `get_sales_breakdown` | `start_date` | `filial` **e** `filial_atendida` | counts por tipo + agregados | por categoria | período, filial, filial_atendida |
| 10 | **Performance por Filial** (`PerformanceByFilial.tsx` → `get_performance_by_filial_v2`) | `task_followups` + `tasks` | `activity_date` | `filial_id` | atividades, clientes únicos, vendas | por filial | período, responsável |
| 11 | **Performance por Vendedor** (`PerformanceBySeller.tsx` → `get_performance_by_seller_v2`) | `task_followups` + `tasks` | `activity_date` | `filial_id` | atividades, clientes únicos, vendas | por vendedor | período, filial_id |
| 12 | **Listagens operacionais** (`useTasksOptimized` → `get_secure_tasks_paginated`) | `tasks` | `start_date` (default), com fallback de exibição `created_at` | `filial` | linhas individuais | — | filtros livres |
| 13 | **Management** (`useManagementData`) | RPCs gerenciais sobre `tasks`/`opportunities` | `start_date` | `filial` (texto) | clientes Ganho/Prospect/Perdido | por filial/vendedor | período, filial |

### Inconsistências identificadas

| # | Inconsistência | Impacto |
|---|----------------|---------|
| A | **Data operacional divergente**: telas 1, 2, 4, 8, 10, 11 usam `activity_date`; telas 5, 6, 9, 12, 13 usam `start_date`; **tela 7 usa `created_at`** | Mesmo período produz contagens diferentes |
| B | **Conceito de "filial" duplicado**: `tasks.filial` (texto) vs `tasks.filial_atendida` (texto) vs `task_followups.filial_id` (uuid) | Filtro "Filial = X" significa coisas diferentes em telas diferentes |
| C | **Fonte de "atividade" divergente**: telas CRM/V2 contam linhas de `task_followups` (1 task pode ter N follow-ups); Dashboard/Reports contam linhas de `tasks` | Soma nunca bate |
| D | **Regra de "cliente único" divergente**: Carteira/Gerencial usam `client_code` ou `client_name` (lowercase) sobre `task_followups`; Funil usa `client`/`clientcode` sobre `tasks` | Mesma carteira, contagens diferentes |
| E | **Filtro hardcoded de 90 dias** ainda presente em `useInfiniteSalesData` e `SalesFunnel` | Período "Tudo" no Dashboard é silenciosamente cortado |
| F | **Status comercial**: Dashboard lê `tasks.sales_type`; Funil de Opportunities lê `opportunities.status`; podem divergir após edição | "Vendas" por tela diferente |

---

## 2. Matriz oficial (regra única da plataforma)

> Esta matriz é a **fonte de verdade**. Toda nova tela e todo refactor deve aderir.

| Dimensão | Regra oficial | Justificativa |
|----------|--------------|---------------|
| **Atividade operacional** (visita, ligação, checklist) | Sempre `task_followups` | É a única tabela 1:1 com cada interação real. `tasks` é container. |
| **Data operacional** | Sempre `activity_date` | Reflete quando a atividade aconteceu. `created_at` reflete quando foi digitada (pode ser dias depois). `start_date` reflete planejamento. |
| **Filial operacional** | Sempre `task_followups.filial_id` (uuid) | Texto livre (`tasks.filial`) é instável; `filial_atendida` é metadado de exceção. |
| **Vendedor** | Sempre `responsible_user_id` (uuid) | Nunca filtrar por nome. |
| **Cliente único** | `getClientKey(f)` = `client_code` (case-insensitive) ou, se vazio, `client_name` lowercase | Já existe em `useFollowups.ts`; promover a util compartilhado. |
| **Status comercial / valor financeiro** | `tasks.sales_type`, `tasks.sales_value`, `tasks.partial_sales_value` (e `opportunities` para o pipeline visual) | Tabela `tasks` é a oficial para valor; `opportunities` é derivada. |
| **Filtro de período "Todos"** | NULL nas RPCs (sem corte). Remover qualquer fallback de 90 dias. | Garantir que "Tudo" seja mesmo tudo em todas as telas. |
| **Normalização de filtros UI** | "Todos"/"all"/"" → `NULL` antes de chamar RPC | Já existe nas RPCs `_v2`; aplicar em todas. |
| **Filial atendida** | Campo opcional de **detalhamento**, nunca de filtro padrão. Só aparece em Reports/Funil quando o gestor pede explicitamente. | Evita confundir "filial do vendedor" com "filial onde a ligação foi feita". |

### Definições oficiais dos KPIs

| KPI | Fórmula oficial |
|-----|-----------------|
| **Total de atividades** | `COUNT(*) FROM task_followups WHERE activity_date BETWEEN ?` |
| **Visitas / Ligações / Checklists** | `COUNT(*) WHERE activity_type IN ('visita'/'ligacao'/'checklist')` |
| **Clientes únicos** | `COUNT(DISTINCT getClientKey)` sobre `task_followups` filtrado |
| **Prospects abertos** | `COUNT(tasks)` com `sales_type='prospect'` e sem `sales_confirmed` |
| **Vendas totais (ganhas)** | `tasks.sales_type='ganho'` — count + `SUM(sales_value)` |
| **Vendas parciais** | `tasks.sales_type='parcial'` — count + `SUM(partial_sales_value)` |
| **Vendas perdidas** | `tasks.sales_type='perdido'` |
| **Taxa de conversão** | `(vendasGanhas + vendasParciais) / totalAtividades * 100` |

---

## 3. Plano de padronização (Fase 3)

Telas que **já estão em conformidade** (após Fase 2):
- ✅ CRM Agenda, Carteira, Gerencial
- ✅ `useConsolidatedSalesMetrics` (V2)
- ✅ Performance por Filial / Vendedor (V2)

Telas que **precisam ser migradas**:

| Tela | Mudança necessária |
|------|--------------------|
| **Dashboard › Funil** (`SalesFunnel.tsx`) | Substituir leitura direta de `tasks`+`opportunities` por `get_activity_metrics_v2` para contagens; manter `opportunities` apenas para o pipeline visual. Remover corte de 90 dias. |
| **Dashboard › Clientes** | Migrar para `task_followups` + `getClientKey`. |
| **Dashboard › Tarefas** | Trocar `created_at` por `activity_date` (via `task_followups`). |
| **Reports** | Trocar `start_date` por `activity_date` nas RPCs analíticas; criar `get_task_type_counts_v2`, `get_sales_breakdown_v2` lendo `task_followups` + `tasks`. |
| **Management** (`useManagementData`) | Padronizar `p_filial` → `p_filial_id` (uuid) e basear contagens operacionais em `task_followups`. |
| **`useInfiniteSalesData`** | Remover floor de 90 dias; aceitar NULL. |

### Contrato único das RPCs `_v2`

Todas as RPCs analíticas devem aceitar exatamente esta assinatura:

```
p_start_date         date | null
p_end_date           date | null
p_filial_id          uuid | null
p_responsible_user_id uuid | null
```

Sem overload, sem variantes por texto.

---

## 4. Critério de aceite

Após Fase 3, executar a auditoria cruzada:

> Para o mesmo período (ex.: 01/05–31/05) e o mesmo `filial_id`,
> os números de **atividades**, **visitas**, **ligações**, **checklists** e
> **clientes únicos** devem ser **idênticos** em:
>
> CRM Agenda · CRM Gerencial · Dashboard Funil · Dashboard Clientes · Reports · Performance por Filial · Performance por Vendedor

Se algum número divergir, é bug de tela — não de banco.
