# Auditoria de acesso à tabela `tasks`

Mapeamento de onde a tabela `tasks` é acessada e status de otimização.

## ✅ Já otimizados (RPC)

| Arquivo | Uso | Status |
|---------|-----|--------|
| `useTasksOptimized` | Carregamento principal | RPC `get_secure_tasks_paginated` |
| `useTaskDetails` | Detalhes de 1 task | RPC `get_secure_task_by_id` |
| `useInfiniteSalesData` | Relatório paginado | RPC `get_secure_tasks_paginated_filtered` |
| `useConsolidatedSalesMetrics` | Métricas do dashboard | RPC `get_consolidated_sales_counts` (novo) |
| `PerformanceByFilial` | Performance por filial | RPC `get_performance_by_filial` |
| `PerformanceBySeller` | Performance por vendedor | RPC `get_performance_by_seller` |

## ⚠️ Acesso direto restante

### Escritas (insert/update/delete) — aceitável
- `useTasksOptimized` — insert, update
- `useTasks` — update
- `CreateTask` — insert
- `TaskManager` — update
- `SalesFunnel` — delete (handleDeleteTask)
- `useOffline` — sync
- `useTaskEditData` — update
- `OpportunityDetailsModal` — update
- `TaskCard` — update
- `EmergencyDataAccess` — (verificar uso)
- `delete-user` (Edge Function) — delete

### Leituras que podem ser pesadas
- `TaskDetailsModal` — realtime subscription + select em UPDATE (1 linha por evento)
- `OpportunityDetailsModal` — select tasks (verificar contexto)
- `useOpportunityManager` — select tasks (verificar)
- `useTaskEditData` — select tasks
- `useSalesFunnelMetrics` — **legado**, preferir useConsolidatedSalesMetrics
- `useTasks` — **legado**, preferir useTasksOptimized

## Impacto do carregamento do dashboard

**Antes:** 6+ queries paralelas em `tasks` (counts + fetches) a cada acesso.
**Depois:** 1 RPC `get_consolidated_sales_counts` que faz agregação no banco.

## Próximos passos (opcional)

1. Verificar se `useSalesFunnelMetrics` ainda é usado — remover se obsoleto.
2. Verificar se `useTasks` ainda é usado — remover se obsoleto.
3. `TaskDetailsModal` realtime: o select em 1 linha por evento é leve; manter.
4. `useOpportunityManager` e `useTaskEditData`: avaliar se podem usar RPCs.
