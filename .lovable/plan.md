# Acesso Multi-Filial Controlado (funcionalidade geral)

Multi-filial = **escopo de dados**. Não cria role, não dá acesso global. Todo usuário tem 1 filial principal (`profiles.filial_id`) e 0..N filiais adicionais habilitadas pelo administrador.

## 1. Desenho final da arquitetura

```text
profiles.filial_id  ──┐
                      ├──> get_user_filial_ids(user_id) -> uuid[]   (fonte única de verdade)
user_filiais(active) ─┘         │
                                ├──> user_can_access_filial(filial_id, user_id) -> boolean
                                └──> user_can_access_filial_nome(nome text) -> boolean  (tasks.filial é texto)
```

Toda RLS/RPC que hoje compara `filial_id = <filial do usuário>` passa a chamar `user_can_access_filial(...)`. Nenhum módulo implementa lógica própria. Usuários com direito global (admin/manager) continuam decidindo por `has_role`, antes e independentemente dessas funções.

## 2. Estrutura exata da tabela + Migration M1 (completa)

```sql
-- 1) Tabela
create table public.user_filiais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  filial_id uuid not null references public.filiais(id) on delete cascade,
  active boolean not null default true,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  deactivated_by uuid,
  unique (user_id, filial_id)
);

-- 2) Grants
grant select on public.user_filiais to authenticated;
grant all on public.user_filiais to service_role;

-- 3) RLS
alter table public.user_filiais enable row level security;

create policy user_filiais_select_self_or_admin on public.user_filiais
  for select to authenticated
  using (user_id = (select auth.uid())
         or public.has_role((select auth.uid()),'manager')
         or public.has_role((select auth.uid()),'admin'));

create policy user_filiais_write_admin on public.user_filiais
  for all to authenticated
  using (public.has_role((select auth.uid()),'manager') or public.has_role((select auth.uid()),'admin'))
  with check (public.has_role((select auth.uid()),'manager') or public.has_role((select auth.uid()),'admin'));

create index user_filiais_user_active_idx on public.user_filiais (user_id) where active;

-- 4) Trigger de auditoria + bloqueio da filial principal
create or replace function public.user_filiais_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_primary uuid;
begin
  select filial_id into v_primary from public.profiles where user_id = new.user_id;
  if new.active and new.filial_id = v_primary then
    raise exception 'Filial principal não pode ser cadastrada como adicional' using errcode='23514';
  end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if old.active and not new.active then
      new.deactivated_at := now(); new.deactivated_by := auth.uid();
    elsif not old.active and new.active then
      new.deactivated_at := null; new.deactivated_by := null;
      new.created_at := old.created_at; new.created_by := old.created_by; -- preserva origem
    end if;
  end if;
  return new;
end $$;

create trigger user_filiais_guard_trg before insert or update on public.user_filiais
  for each row execute function public.user_filiais_guard();

-- 5) Troca de filial principal: desativa vínculo adicional duplicado
create or replace function public.profiles_sync_primary_filial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.filial_id is not null and new.filial_id is distinct from old.filial_id then
    update public.user_filiais
       set active = false
     where user_id = new.user_id and filial_id = new.filial_id and active;
  end if;
  return new;
end $$;

create trigger profiles_sync_primary_filial_trg after update of filial_id on public.profiles
  for each row execute function public.profiles_sync_primary_filial();

-- 6) Funções centrais
create or replace function public.get_user_filial_ids(p_user_id uuid default auth.uid())
returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare v_ids uuid[];
begin
  if p_user_id is distinct from auth.uid()
     and not (public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'admin')) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  select array_remove(array_agg(distinct fid), null) into v_ids from (
    select p.filial_id as fid from public.profiles p
      where p.user_id = p_user_id and p.approval_status='approved' and p.employment_status='active'
    union
    select uf.filial_id from public.user_filiais uf
      join public.profiles p2 on p2.user_id = uf.user_id
      where uf.user_id = p_user_id and uf.active
        and p2.approval_status='approved' and p2.employment_status='active'
  ) s;
  return coalesce(v_ids, '{}'::uuid[]);
end $$;

create or replace function public.user_can_access_filial(p_filial_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select p_filial_id is not null
     and p_filial_id = any (public.get_user_filial_ids(p_user_id));
$$;

-- Por nome: resolve para filial_id; ambíguo ou inexistente => false
create or replace function public.user_can_access_filial_nome(p_nome text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_id uuid; v_count int;
begin
  if p_nome is null or btrim(p_nome) = '' then return false; end if;
  select count(*), min(f.id) into v_count, v_id from public.filiais f
   where lower(btrim(f.nome)) = lower(btrim(p_nome));
  if v_count <> 1 then return false; end if;
  return public.user_can_access_filial(v_id);
end $$;

-- 7) RPC administrativa
create or replace function public.set_user_filiais(target_user_id uuid, filial_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_primary uuid;
begin
  if not (public.has_role(auth.uid(),'manager') or public.has_role(auth.uid(),'admin')) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  select filial_id into v_primary from public.profiles where user_id = target_user_id;

  update public.user_filiais set active = false
   where user_id = target_user_id and active
     and filial_id <> all (coalesce(filial_ids,'{}'::uuid[]));

  insert into public.user_filiais (user_id, filial_id, active, created_by)
  select target_user_id, fid, true, auth.uid()
    from unnest(coalesce(filial_ids,'{}'::uuid[])) fid
   where fid is distinct from v_primary
  on conflict (user_id, filial_id)
    do update set active = true, updated_at = now();

  insert into public.security_audit_log (event_type, user_id, target_user_id, metadata)
  values ('user_filiais_updated', auth.uid(), target_user_id,
          jsonb_build_object('filial_ids', filial_ids, 'primary', v_primary));

  return jsonb_build_object('success', true,
    'filial_ids', public.get_user_filial_ids(target_user_id));
end $$;

grant execute on function public.set_user_filiais(uuid, uuid[]) to authenticated;
grant execute on function public.get_user_filial_ids(uuid) to authenticated;
grant execute on function public.user_can_access_filial(uuid, uuid) to authenticated;
grant execute on function public.user_can_access_filial_nome(text) to authenticated;
```

Notas:
- **Sem `is_primary`**: a principal fica exclusivamente em `profiles.filial_id`.
- Remover acesso = `active = false` com `deactivated_at`/`deactivated_by`; reativar limpa esses campos e preserva `created_at`/`created_by`.
- `get_user_filial_ids(p_user_id)` só aceita outro usuário se o chamador for manager/admin (item 5 da sua lista); funções internas SECURITY DEFINER usam a forma sem argumento.
- Débito técnico registrado: migrar `tasks.filial` (texto) para `tasks.filial_id`.


## 4. Funções existentes: substituídas ou adaptadas

| Função | Ação |
|---|---|
| `get_user_filial_id()` | **mantida** — passa a significar explicitamente "filial principal" |
| `get_supervisor_filial_id(uuid)` | **mantida** para compatibilidade, mas deixa de ser usada em RLS de escopo |
| `user_same_filial(uuid)` | **adaptada** — passa a testar interseção de `get_user_filial_ids` dos dois usuários |
| `pops_scope()` | **adaptada** — adiciona `filial_ids` (array) mantendo `filial_id` |
| `my_day_scope()` | **adaptada** — adiciona coluna `filial_ids` mantendo `filial_id` |

## 5. RPCs afetadas

Escopo por filial (passam a usar as funções centrais):
- Métricas/relatórios: `get_activity_metrics_v2`, `get_funnel_metrics_v2`, `get_tasks_metrics_v2`, `get_reports_dataset_v2`, `get_performance_by_filial_v2`, `get_performance_by_seller_v2`, `get_consolidated_sales_counts_v2`, `get_sales_breakdown`, `get_sales_funnel_counts`, `get_prospects_aggregate`, `get_task_type_counts`.
- Gestão: `get_management_seller_summary`, `get_management_client_details`, `get_management_product_analysis`, `get_service_opportunities_summary`, `get_service_opportunities_details`.
- Tarefas/clientes/mídia: `get_tasks_optimized`, `get_secure_tasks_paginated`, `get_secure_tasks_paginated_filtered`, `get_secure_tasks_enhanced`, `get_secure_task_by_id`, `get_completely_secure_tasks`, `get_supervisor_filial_tasks`, `get_secure_clients_enhanced`, `get_secure_clients_with_masking`, `get_secure_customer_data_*`, `can_access_task_related_data`, `can_access_customer_data`, `can_access_media_object`, `get_secure_task_media`.
- CRM/agenda/treinos/férias: `get_weekly_followups_agenda`, `get_trainings_stats`, `trainings_enforce_snapshot`, `can_insert_vacation`, `get_filial_users`, `get_filial_user_counts`, `get_secure_user_directory`, `get_user_directory_with_fallback`.
- POPS: `pops_scope`, `pops_can_read_machine`, `pops_portfolio_clients`, `pops_portfolio_client_machines`, `pops_goal_summary`, `pops_executor_results`, `pops_import_distribution`.
- Meu Dia: `my_day_scope`, `my_day_summary_build`, `my_day_details_build`, `get_my_day_team_summary`.
- Regularização: `equipment_regularization_pending_kpis/clients/machines`, `..._create_batch`, `..._get_batch`.

## 6. RLS afetadas

`campaign_clients`, `clients`, `opportunities`, `opportunity_items`, `special_conditions`, `task_followups`, `trainings`, `team_vacations`, `visit_schedules`, `pops_machines`, `pops_client_assignments`, `pops_import_rows`, `equipment_regularization_batches/items`.

Padrão de troca:
```sql
-- antes
filial_id = get_supervisor_filial_id(auth.uid())
-- depois
public.user_can_access_filial(filial_id)

-- antes (por nome)
t.filial = f.nome
-- depois
public.user_can_access_filial_nome(t.filial)
```

## 7. Classificação A / B / C

**A. Precisa ser alterado** (restringe a uma filial que deveria ser escopo):
`user_same_filial`, `pops_scope`, `my_day_scope`, `pops_can_read_machine`, RLS das tabelas do item 6, RPCs de escopo do item 5 (métricas, gestão, tarefas, clientes, CRM, POPS, Meu Dia, Regularização).

**B. Pode ser mantido** (representa a filial principal, não o escopo):
`get_user_filial_id()`, `get_supervisor_filial_id()`, `create_secure_profile`, `update_user_filial_secure`, `secure_update_profile`, `get_filiais_for_registration`, `special_conditions_status_guard` (guarda de status), gravação de `filial_id` no cadastro de tarefas/treinos/férias (default vem da principal), `mask_customer_*`.

**C. Não deve ser alterado** (já global ou regra independente):
`can_view_equipment_park` e todo o Parque de Máquinas (`get_equipment_park_paginated`, `get_equipment_park_kpis`, `get_equipment_validation_summary`, `search_client_equipment`, `can_edit_client_equipment`), `has_role` e demais funções de RBAC, `can_perform_admin_action`, `can_modify_user_role`, todo o subsistema de auditoria/segurança (`security_audit_log`, `check_*`), `clients_master`/`search_clients` (base mestre global), `filiais` (catálogo público interno).

## 8. Impacto no frontend

- Novo hook `useUserFiliais()` (React Query, staleTime 10m): `{ primaryFilialId, filialIds, filiais, hasMulti }`.
- Hooks que hoje leem `profile.filial_id` passam a consumir `filialIds`: `useFilteredConsultants`, `useVacations`, `useTrainings`, `useVisitSchedules`, `useWeeklyAgenda`, `useMyDay`, `usePops`, `useClientEquipment`, `useEquipmentRegularization`, `useServiceOpportunities`, `useManagementData`, `useConsolidatedSalesMetrics`.
- Telas com filtro de filial passam a listar as filiais permitidas + "Todas as minhas filiais": `MyDay`, `Pops`, `Management`, `Reports`, `PerformanceByFilial/Seller`, `CRM` (Carteira, Agenda, Programação, Treinamentos), `Equipamentos` (Validação e Regularização), `Campaigns`, `Vacations`, `CreateTask` (filial atendida, default = principal).
- **Gerenciar Usuários**: modal "Filiais" com select da principal + checkboxes múltiplos das adicionais. Exibição na tabela: `Filial principal: Caiapônia` / `Acesso adicional: Planalto Verde` ou `Somente filial principal`.
- **Revogação imediata de cache**: após `set_user_filiais` (ou troca da principal), a UI executa uma invalidação ampla — `user-filiais`, `profile`, `tasks`, `taskDetails`, `crm*`, `visit-schedules`, `weekly-agenda`, `trainings`, `followups`, `pops*`, `my-day*`, `reports*`, `management*`, `equipment*`, `regularization*`, `campaigns`, `special-conditions`, `vacations` — via helper único `invalidateFilialScopedQueries()` em `useSecurityCache`. O staleTime de 10m continua valendo para navegação normal, mas nunca depois de uma alteração administrativa.


## 9. Retrocompatibilidade

`get_user_filial_ids` retorna `[filial principal]` quando não há linha ativa em `user_filiais` — comportamento idêntico ao atual para 100% dos usuários hoje. A migration não insere nenhuma linha em `user_filiais`. Funções antigas continuam existindo com a mesma assinatura.

## 10. Estratégia para usuários globais

Verificado no banco (não apenas no código): as únicas roles globais são **admin** e **manager**. Roles existentes em `user_roles`: sales_consultant (49), supervisor (18), rac (14), manager (11), csa (3), admin (2). Nenhuma policy concede escopo global a outra role (as policies só citam admin, manager e supervisor — este último sempre restrito à filial). Em toda função alterada, o ramo global é avaliado **primeiro** e permanece intocado; `user_can_access_filial` só é consultada quando o usuário não é global.

## 11. Plano de implementação por etapas

1. **M1** — tabela `user_filiais` + grants + RLS + trigger + funções centrais + `set_user_filiais`. Zero mudança de comportamento.
2. **M2** — adaptar `user_same_filial`, `pops_scope`, `my_day_scope` e as RLS do item 6.
3. **M3** — adaptar as RPCs de escopo do item 5.
4. **F1** — `useUserFiliais` + tela administrativa em Gerenciar Usuários.
5. **F2** — filtros multi-filial nas telas afetadas.
6. **V1** — validação com o caso Diogo (RAC, principal Caiapônia, adicional Planalto Verde). Consolidação das duas contas fica para etapa posterior, com script de histórico revisado.

## 12. Testes necessários

| Cenário | Esperado |
|---|---|
| Usuário com 1 filial (qualquer role não global) | Resultados idênticos aos de hoje em Tarefas, CRM, POPS, Meu Dia, Relatórios, Regularização |
| Usuário com 2 filiais | Vê dados das duas em todos os módulos; filtro oferece as duas |
| Terceira filial não vinculada | RPC direta e SELECT direto retornam vazio / erro de permissão (teste feito com token autenticado, não só pela UI) |
| Remoção da adicional | Acesso à filial removida cessa na próxima consulta, sem apagar histórico |
| Admin/manager | Continua global, sem influência de `user_filiais` |
| Escrita em `user_filiais` por não-gestor | Bloqueado por RLS e pela RPC |
| Performance | `get_equipment_park_paginated` e listagens principais mantêm os tempos atuais (comparar antes/depois) |
| Troca de filial principal | Vínculo adicional igual à nova principal é desativado automaticamente, sem duplicação |
| Antiga adicional vira principal | `get_user_filial_ids` não retorna duplicata; `user_filiais` fica sem linha ativa para ela |
| Remoção pelo admin | Acesso backend cessa na consulta seguinte e a filial deixa de ser oferecida na UI após a invalidação |
| `tasks.filial` inválido/ambíguo | `user_can_access_filial_nome` retorna false (não libera acesso) |
| Usuário comum consultando outro `p_user_id` | `get_user_filial_ids` levanta erro 42501 |
| Reativação de vínculo | `deactivated_at`/`deactivated_by` limpos, `created_at`/`created_by` originais preservados |
