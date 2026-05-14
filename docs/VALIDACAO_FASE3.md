# Validação Fase 3 — Padronização Operacional Global

## Status das telas

| Tela | Hook/RPC oficial | Fonte operacional | Fonte comercial |
|---|---|---|---|
| CRM Agenda | `get_weekly_followups_agenda` | `task_followups` | — |
| Dashboard › Funil (cards) | `useConsolidatedSalesMetrics` → `get_activity_metrics_v2` | `task_followups` | `tasks` |
| Dashboard › Clientes | `useClientsOverviewV2` → `get_clients_overview_v2` | `task_followups` | `opportunities` |
| Dashboard › Tarefas (histórico) | `useReportsDatasetV2` → `get_reports_dataset_v2` | `task_followups` | `tasks` + `opportunities` |
| Reports | `get_funnel_metrics_v2` (cards) | `task_followups` | `tasks` |
| Performance Filial / Vendedor | RPCs `_v2` (Fase 2) | `task_followups` | `tasks` |
| Gerencial | `useManagementData` (filtros LOWER(TRIM)) | `task_followups` | `tasks` |

## Contrato único (todas as RPCs `_v2`)

```
(p_start_date date, p_end_date date, p_filial_id uuid, p_responsible_user_id uuid)
```

- `NULL` em qualquer parâmetro = sem filtro.
- Sem fallback hardcoded de 90 dias.
- Cliente único: `COALESCE(NULLIF(client_code,''), LOWER(TRIM(client_name)))`.

## Queries de validação cruzada

Substituir `:start`, `:end`, `:filial`, `:user` antes de executar.

### A) Atividades totais — Dashboard vs CRM

```sql
SELECT
  (SELECT COUNT(*) FROM task_followups
    WHERE activity_date::date BETWEEN :start AND :end
      AND filial_id = :filial) AS via_followups,
  ((get_activity_metrics_v2(:start, :end, :filial, NULL))->>'total_activities')::int AS via_v2_activity,
  ((get_funnel_metrics_v2(:start, :end, :filial, NULL))->>'total_activities')::int AS via_v2_funnel;
```

Esperado: três colunas idênticas.

### B) Visitas / Ligações / Checklists — Funil vs Reports

```sql
SELECT
  (get_activity_metrics_v2(:start, :end, :filial, NULL))->>'visitas'    AS visitas_dashboard,
  (get_funnel_metrics_v2  (:start, :end, :filial, NULL))->>'visitas'    AS visitas_reports,
  (get_activity_metrics_v2(:start, :end, :filial, NULL))->>'ligacoes'   AS lig_dashboard,
  (get_funnel_metrics_v2  (:start, :end, :filial, NULL))->>'ligacoes'   AS lig_reports,
  (get_activity_metrics_v2(:start, :end, :filial, NULL))->>'checklists' AS chk_dashboard,
  (get_funnel_metrics_v2  (:start, :end, :filial, NULL))->>'checklists' AS chk_reports;
```

### C) Vendas — Reports vs Performance

```sql
SELECT
  (get_funnel_metrics_v2(:start, :end, :filial, NULL))->>'sales_total_value'   AS ganhas,
  (get_funnel_metrics_v2(:start, :end, :filial, NULL))->>'sales_partial_value' AS parciais,
  (get_funnel_metrics_v2(:start, :end, :filial, NULL))->>'sales_lost_value'    AS perdidas;
```

Comparar com Performance por Filial e Performance por Vendedor para o mesmo período.

### D) Clientes únicos — Clientes vs CRM Gerencial

```sql
SELECT
  ((get_clients_overview_v2(:start, :end, :filial, NULL, NULL, 1, 0))->>'total')::int AS clientes_v2,
  COUNT(DISTINCT COALESCE(NULLIF(client_code,''), LOWER(TRIM(client_name)))) AS clientes_direct
FROM task_followups
WHERE activity_date::date BETWEEN :start AND :end
  AND filial_id = :filial;
```

## Critério de aceite

Para o **mesmo período + filial + vendedor**, todos os números operacionais devem
bater **exatamente** entre Dashboard, Funil, Reports, CRM Agenda, Gerencial,
Performance por Filial e Performance por Vendedor. Divergência = bug de tela
(filtro/ordem), nunca de banco.

## Hooks/RPCs deprecated (mantidos por compatibilidade)

- `useAllSalesData` (`@deprecated`) → casca fina sobre `useConsolidatedSalesMetrics`.
- `useSalesFunnelMetrics` (`@deprecated`) → idem.
- `get_task_type_counts`, `get_prospects_aggregate`, `get_sales_breakdown` —
  ainda existem no banco; não devem ser usados em novo código.

Plano de remoção: após 2 ciclos de release sem regressão reportada.
