# Acesso Multi-Filial Controlado

Objetivo: um usuário mantém **1 filial principal** (`profiles.filial_id`) e pode receber **0..N filiais adicionais** explicitamente habilitadas. Nada de acesso global. Role permanece intocada — multi-filial é apenas escopo.

## 1. Levantamento — o que hoje usa filial única

Funções auxiliares (fonte de verdade do escopo hoje):
- `get_user_filial_id()` — retorna `profiles.filial_id` do usuário logado.
- `get_supervisor_filial_id(uuid)` — filial do supervisor aprovado.
- `user_same_filial(uuid)` — compara `filial_id` de dois perfis.
- `pops_scope()` — devolve `{scope, filial_id}` (uma filial só).
- `my_day_scope()` — devolve `filial_id` única.

RPCs que dependem dessas funções ou de `p.filial_id`:
- Métricas/relatórios: `get_activity_metrics_v2`, `get_funnel_metrics_v2`, `get_tasks_metrics_v2`, `get_reports_dataset_v2`, `get_performance_by_filial_v2`, `get_performance_by_seller_v2`, `get_consolidated_sales_counts_v2`, `get_sales_breakdown`, `get_sales_funnel_counts`, `get_prospects_aggregate`.
- Gerencial: `get_management_seller_summary`, `get_management_client_details`, `get_management_product_analysis`, `get_service_opportunities_summary`, `get_service_opportunities_details`.
- Tarefas/clientes: `get_tasks_optimized`, `get_secure_tasks_paginated(_filtered)`, `get_secure_tasks_enhanced`, `get_secure_task_by_id`, `get_secure_clients_*`, `get_secure_customer_data_*`, `get_completely_secure_tasks`, `get_supervisor_filial_tasks`, `can_access_task_related_data`, `can_access_customer_data`, `can_access_media_object`.
- Parque: `get_equipment_park_paginated`, `get_equipment_park_kpis`, `get_equipment_validation_summary`, `search_client_equipment` (leitura já global via `can_view_equipment_park`).
- Regularização: `equipment_regularization_pending_kpis/clients/machines`, `equipment_regularization_create_batch`, `..._get_batch`.
- POPS: `pops_scope`, `pops_can_read_machine`, `pops_portfolio_clients`, `pops_portfolio_client_machines`, `pops_goal_summary`, `pops_executor_results`, `pops_import_distribution`.
- Meu Dia: `my_day_scope`, `my_day_summary_build`, `my_day_details_build`, `get_my_day_team_summary`.
- CRM/agenda/treinos/férias: `get_weekly_followups_agenda`, `get_trainings_stats`, `trainings_enforce_snapshot`, `can_insert_vacation`, `get_filial_users`, `get_filial_user_counts`, `get_secure_user_directory`.

RLS que filtram por filial (via `get_supervisor_filial_id` / join em `profiles`): `campaign_clients`, `clients`, `opportunities`, `opportunity_items`, `pops_machines`, `pops_client_assignments`, `pops_import_rows`, `special_conditions`, `task_followups`, `trainings`, `team_vacations`, `client_equipment`, `equipment_regularization_*`, `visit_schedules`.

Frontend que usa `profile.filial_id` como filtro único: `useProfile`, `useFilteredConsultants`, `useVacations`, `useTrainings`, `useVisitSchedules`, `useWeeklyAgenda`, `useMyDay`, `usePops`, `useClientEquipment`, `useEquipmentRegularization`, `useServiceOpportunities`, `useManagementData`, `useConsolidatedSalesMetrics`, além das telas `MyDay`, `Pops`, `Management`, `Vacations`, `Campaigns`, `CreateTask`, `CRM` (Carteira/Agenda/Treinamentos), `Equipamentos`, `Users`, `FilialUsersDialog`, `TeamFilters`, `VisitScheduleForm`, `SpecialConditionsTab`.

## 2. Estrutura proposta (migration)

```sql
create table public.user_filiais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  filial_id uuid not null references public.filiais(id) on delete cascade,
  active boolean not null default true,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, filial_id)
);
grant select on public.user_filiais to authenticated;
grant all on public.user_filiais to service_role;
alter table public.user_filiais enable row level security;
-- leitura: o próprio usuário vê suas filiais; gestor/admin veem todas
-- escrita: somente manager/admin (via has_role)
```

Decisão sobre `is_primary`: **não incluir**. A principal continua exclusivamente em `profiles.filial_id` (compatibilidade total e evita duas fontes de verdade divergindo). `user_filiais` guarda apenas as adicionais; um trigger impede inserir a filial principal como adicional.

## 3. Funções auxiliares novas

```sql
-- todas as filiais do usuário: principal + adicionais ativas
create function public.get_user_filial_ids(p_user_id uuid default auth.uid())
returns uuid[] language sql stable security definer set search_path = public;

create function public.user_has_filial(p_filial_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public;

-- versão por nome (tasks.filial é texto) usando LOWER(TRIM())
create function public.user_has_filial_nome(p_filial_nome text)
returns boolean language sql stable security definer set search_path = public;
```

Compatibilidade: `get_user_filial_id()` e `get_supervisor_filial_id()` continuam existindo e retornando a principal (nada quebra). `pops_scope()` e `my_day_scope()` passam a expor também `filial_ids` (array), mantendo `filial_id` para não quebrar consumidores atuais.

## 4. RLS a alterar

Padrão de troca: `filial_id = get_supervisor_filial_id(auth.uid())` → `public.user_has_filial(filial_id)`; comparações por nome (`t.filial = f.nome`) → `public.user_has_filial_nome(t.filial)`. Tabelas afetadas: `campaign_clients`, `clients`, `opportunities`, `opportunity_items`, `special_conditions`, `task_followups`, `trainings`, `team_vacations`, `visit_schedules`, `pops_machines`, `pops_client_assignments`, `pops_import_rows`, `equipment_regularization_*`. `client_equipment` já é global em leitura — sem mudança.

Como `user_has_filial` é STABLE/SECURITY DEFINER e devolve boolean, o custo por linha fica equivalente ao atual (mesma estratégia de InitPlan já aplicada).

## 5. Telas afetadas

- **Gerenciar Usuários** (`src/pages/Users.tsx`): nova coluna/ação "Filiais" abrindo modal com filial principal (select atual) + lista de checkboxes das filiais adicionais. Salvar via RPC `set_user_filiais(target_user_id, filial_ids[])` (somente manager/admin, com log em `security_audit_log`).
- Filtros de filial passam de valor único para lista permitida: `MyDay`, `Pops`, `Management`, `Reports`, `PerformanceByFilial/Seller`, `CRM` (Carteira, Agenda, Treinamentos, Programação), `Equipamentos` (Validação e Regularização), `Campaigns`, `Vacations`, `CreateTask` (filial atendida).
- Novo hook `useUserFiliais()` (React Query, staleTime 10m) devolvendo `{ primaryFilialId, filialIds, filiais }`; hooks listados no item 1 passam a consumi-lo em vez de `profile.filial_id`.
- Quando o usuário tem mais de uma filial, os selects de filial passam a listar as filiais permitidas com opção "Todas as minhas filiais".

## 6. Configuração no cadastro do usuário

Fluxo: Gerenciar Usuários → usuário → "Filiais" → seleciona principal + marca adicionais → salvar. Remover uma adicional é desmarcar o checkbox (o registro fica `active = false`, preservando histórico de quem habilitou e quando). Nenhuma role é tocada em nenhum momento.

## 7. Consolidação das contas do Diogo (etapa separada, após aprovação)

Situação atual:
- `diogo.silva@rzkagro.com.br` — RAC, filial Caiapônia, `rejected` + `inactive`, conta banida em `auth.users`.
- `diogosilvacpa451@gmail.com` — RAC, filial Planalto Verde, aprovada e ativa.

Plano proposto: manter a conta **corporativa** como oficial (reativar, `approved`/`active`, remover ban, role `rac`, principal = Caiapônia, adicional = Planalto Verde) e reatribuir o histórico da conta pessoal para ela — `tasks.created_by`, `task_followups`, `visit_schedules`, `trainings`, `opportunities` (via tasks), `pops_machines.responsible_user_id`, `pops_client_assignments.rac_user_id`, `special_conditions`, `client_equipment.created_by/validated_by`. Depois a conta pessoal é desativada (soft delete, `historical_users` preserva o rastro). Nada disso entra na migration multi-filial: vira um script de dados revisado com você antes de rodar.

## Ordem de execução após aprovação

1. Migration: tabela `user_filiais` + grants + RLS + funções auxiliares + `set_user_filiais`.
2. Atualização das RLS/RPCs de escopo (lote único, sem mudança de comportamento para quem tem só 1 filial).
3. Frontend: `useUserFiliais` + tela administrativa + filtros.
4. Script de consolidação do Diogo.
