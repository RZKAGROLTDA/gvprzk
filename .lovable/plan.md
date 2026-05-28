## Fase 3 — Migração analítica para o padrão `_v2`

Objetivo: garantir que Dashboard › Funil, Clientes, Tarefas e Reports usem `task_followups` como fonte oficial de operação, mantendo `tasks`/`opportunities` apenas para valores e status comerciais. Manter compatibilidade dos hooks/RPCs antigos (deprecated) até validação.

---

### 1. Novas RPCs no banco (Supabase)

Para evitar misturar conceitos (operacional × comercial) e respeitar o contrato único `(p_start_date, p_end_date, p_filial_id, p_responsible_user_id)`:

- **`get_funnel_metrics_v2`** — agrega `task_followups` (visitas, ligações, checklists, prospects) + `opportunities` ligadas via `task_id` para etapas comerciais (abertas, ganhas, parciais, perdidas) e seus valores. Sem corte de 90 dias.
- **`get_clients_overview_v2`** — lista de clientes únicos baseada em `task_followups`, agrupados por `COALESCE(NULLIF(client_code,''), LOWER(TRIM(client_name)))`, com:
  - `last_activity_date` (de `task_followups`)
  - `last_visit_date` (followups tipo visita)
  - `last_opportunity_date` (de `opportunities` via `task_id`)
  - `filial_id`, `responsible_user_id`
- **`get_tasks_metrics_v2`** — métricas de tarefas baseadas em `task_followups.activity_date` (não `tasks.created_at`): contagens por tipo, por status comercial (lookup em `tasks`/`opportunities`).
- **`get_reports_dataset_v2`** — dataset de linhas para Reports (paginação server-side), pivotando `task_followups` + dados financeiros de `tasks`/`opportunities`. Colunas explícitas: `activity_date`, `created_at`, `sale_date`, `filial`, `filial_atendida`.

Todas as RPCs:
- `SECURITY DEFINER`, respeitam roles (manager/admin/supervisor/seller) usando `has_role` + `get_supervisor_filial_id`.
- Aceitam `NULL` em qualquer parâmetro = sem filtro.
- Sem `SELECT *`; colunas explícitas; `LIMIT` em datasets.

---

### 2. Hooks (frontend)

Criar novos hooks consumindo o contrato único, mantendo os antigos com `@deprecated`:

- `src/hooks/useFunnelMetricsV2.ts` (novo) — substitui uso direto de tasks/opportunities em `SalesFunnel.tsx`.
- `src/hooks/useClientsOverviewV2.ts` (novo) — substitui agregação manual em `FunnelClientsOptimized.tsx`.
- `src/hooks/useTasksMetricsV2.ts` (novo) — substitui contagens de `FunnelTasksOptimized.tsx`.
- `src/hooks/useReportsDatasetV2.ts` (novo) — fonte para `Reports.tsx`.

Padrão dos hooks:
- React Query `staleTime: 10*60*1000`, `refetchOnWindowFocus: false`.
- `resolveFilialIdForFilter()` para converter nome→uuid.
- `consultantId === 'all'` → `null`.
- Período `'all'` → `p_start_date=null`, `p_end_date=null` (sem fallback de 90 dias).

---

### 3. Migração das telas

**Dashboard › Funil** (`SalesFunnel.tsx` / `SalesFunnelOptimized.tsx` / `FunnelTasksOptimized.tsx` / `FunnelClientsOptimized.tsx`)
- Substituir leituras diretas por hooks `_v2`.
- Manter pipeline visual de oportunidades como camada complementar (apenas valores/status comerciais).
- Remover hardcoded 90 dias.

**Clientes** (`FunnelClientsOptimized.tsx`)
- Eliminar agregação client-side de `tasks`+`opportunities`.
- Consumir `useClientsOverviewV2`. Chave única: `COALESCE(NULLIF(client_code,''), LOWER(TRIM(client_name)))`.

**Tarefas** (`FunnelTasksOptimized.tsx`)
- Trocar `created_at` por `activity_date` via `useTasksMetricsV2`.

**Reports** (`Reports.tsx`)
- Migrar dataset principal para `useReportsDatasetV2`.
- Colunas explícitas: Data Atividade, Data Criação, Data Venda, Filial Operacional, Filial Atendida.

---

### 4. Clareza visual

Em todas as telas migradas, renomear cabeçalhos e tooltips para deixar explícito:
- "Data da atividade" (operacional, `activity_date`)
- "Data de criação" (`tasks.created_at`)
- "Data da venda/oportunidade" (`opportunities.data_fechamento`)
- "Filial operacional" (`task_followups.filial_id`)
- "Filial atendida" (`tasks.filial_atendida`)

---

### 5. Deprecação controlada

- Adicionar comentário JSDoc `@deprecated — usar X_v2` em:
  - `useAllSalesData` (legado)
  - `get_consolidated_sales_counts` (RPC) → manter no banco, sinalizar no doc.
  - hooks antigos referenciados acima.
- **Não remover** nada nesta fase.

---

### 6. Validação pós-migração

Após o deploy, executar via `supabase--read_query` consultas comparativas para o **mesmo período + filial + vendedor**:

| Métrica | Origem A | Origem B | Esperado |
|---|---|---|---|
| Atividades totais | `get_activity_metrics_v2` | CRM Agenda (`get_weekly_followups_agenda`) | igual |
| Visitas/Ligações/Checklists | Funil v2 | Dashboard (`useConsolidatedSalesMetrics`) | igual |
| Vendas ganhas/parciais/perdidas | Reports v2 | Performance Filial/Vendedor | igual |
| Clientes únicos | Clientes v2 | CRM Gerencial | igual |

Documentar resultados em `docs/VALIDACAO_FASE3.md`.

---

### Detalhes técnicos

- Migração SQL em um único arquivo (4 RPCs + grants).
- `types.ts` será regenerado após a migração.
- Sem alterar RLS de `task_followups`/`tasks`/`opportunities`.
- Sem mudar telas não listadas (CRM Agenda, Performance por Filial/Vendedor já estão no padrão v2).

---

### Ordem de execução

1. Migração SQL (4 RPCs).
2. Novos hooks v2.
3. Refatoração de telas (Funil → Clientes → Tarefas → Reports).
4. Validação comparativa + documento.

Confirma para eu seguir?
