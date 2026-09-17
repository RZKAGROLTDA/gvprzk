# Multi-Filial — Filial Ativa como filial efetiva (diagnóstico, sem implementação)

## 1. Causa raiz

Hoje existem apenas duas noções no banco:

- `profiles.filial_id` — filial principal (usada por funções antigas).
- `get_user_filial_ids_internal(user)` — **união** de principal + adicionais ativas (M2).

Não existe no banco a noção de **Filial Ativa**. A Filial Ativa vive só no frontend
(`sessionStorage`, `useUserFiliais` / `useActiveFilialFilter`) e é enviada apenas às
consultas que já possuem um parâmetro de filial. Consequências:

1. Onde a RPC/consulta **tem** parâmetro (`p_filial_id`), a troca funciona.
2. Onde a RPC/consulta **não tem** parâmetro, o resultado volta pela RLS/escopo do
   banco, que devolve a **união das duas filiais** (Caiapônia + Planalto Verde) —
   exatamente o efeito indesejado.
3. Funções que ainda leem `profiles.filial_id` devolvem **sempre Caiapônia**, mesmo
   com Planalto Verde selecionada (ex.: rótulo/escopo de `pops_scope`,
   `my_day_scope`, `get_supervisor_filial_id`, `get_user_filial_id`).

Ou seja: temos "permissão para 2 filiais", não "atuar como usuário da filial escolhida".

## 2. Pontos afetados

### Banco — funções de escopo
| Função | Comportamento hoje | Problema |
| --- | --- | --- |
| `get_user_filial_id()` | principal | ignora Filial Ativa |
| `get_supervisor_filial_id(user)` | principal | ignora Filial Ativa |
| `get_user_filial_ids_internal(user)` | união principal+adicionais | mistura as filiais |
| `user_same_filial`, `pops_scope`, `my_day_scope_v2`, `can_insert_vacation` | união (M2) | mistura as filiais |
| `pops_scope().filial_id`, `my_day_scope().filial_id` | principal | rótulo/escopo errado |

### Banco — RLS
33 policies dependem de filial e hoje resolvem pela união:
`pops_machines`, `pops_client_assignments`, `client_equipment` (via funções),
`tasks`, `task_followups`, `task_equipment`, `task_access_metadata`, `visit_schedules`,
`trainings`, `opportunities`, `opportunity_items`, `products`, `clients`,
`campaign_clients`, `special_conditions`, `profiles`, `team_vacations`.

### Banco — RPCs sem parâmetro de filial (resultado = união)
`get_my_day_summary`, `get_my_day_details`, `get_equipment_validation_summary`,
`get_equipment_validators`, `pops_scope`, `my_day_scope*`, além das leituras diretas
por tabela (Parque, Regularização, Campanhas, Tarefas, Retornos, Treinamentos).

### Frontend — dependência da filial principal
`CreateTask.tsx`, `TechnicalVisitForm.tsx`, `VisitScheduleForm.tsx`,
`SpecialConditionsTab.tsx`, `Campaigns.tsx` (filial padrão), `Vacations.tsx`
(`lockedFilialId`), `Management.tsx` (supervisor → `profile.filial_id`),
`useConsolidatedSalesMetrics`, `useTrainings`, `useWeeklyAgenda`/`useVisitSchedules`
(criação), `useManagementData`.

## 3. Arquitetura proposta

Separar formalmente as duas regras, com a Filial Ativa **conhecida pelo banco**:

1. **Escopo autorizado** — permanece `get_user_filial_ids()` (M1/M2). Define o que o
   usuário pode selecionar. Nada muda.
2. **Filial efetiva** — nova camada:
   - tabela `public.user_active_filial (user_id, filial_id, updated_at)`, 1 linha por usuário;
   - RPC `set_active_filial(p_filial_id uuid)` — valida contra o escopo autorizado e
     grava; `NULL` = "todas as permitidas" (padrão de admin/manager);
   - função `effective_filial_ids(user)`: se houver filial ativa válida → **apenas ela**;
     senão → escopo autorizado completo (retrocompatível);
   - função `effective_filial_id(user)`: filial ativa válida, senão a principal.
3. **Reapontar** todas as funções de escopo e as 33 policies para
   `effective_filial_ids()`, e os rótulos (`pops_scope.filial_id`, `my_day_scope*`)
   para `effective_filial_id()`.
4. **Frontend**: `useUserFiliais.setActiveFilialId` passa a chamar `set_active_filial`
   e invalidar o cache do React Query; os formulários de criação passam a usar a
   filial efetiva em vez de `profile.filial_id`.

Garantias: usuário com 1 filial não muda nada (ativa = principal = união);
admin/manager continuam globais enquanto não escolherem uma filial; nenhum acesso novo
é concedido, porque a filial ativa é sempre validada contra o escopo autorizado.

## 4. Alterações necessárias (por etapas, uma aprovação por etapa)

- **E1 — Base de filial efetiva (SQL):** tabela + RLS + `set_active_filial` +
  `effective_filial_id(s)`, sem reapontar nada ainda.
- **E2 — Funções de escopo:** `user_same_filial`, `pops_scope`, `my_day_scope_v2`,
  `get_supervisor_filial_id`, `get_user_filial_id`, `can_insert_vacation`.
- **E3 — RLS:** as 33 policies dependentes de filial.
- **E4 — RPCs de agregação sem parâmetro:** Meu Dia, Parque/Validação, POPS, KPIs.
- **E5 — Frontend leitura:** trocar `setActiveFilialId` para a RPC + invalidação de cache.
- **E6 — Frontend criação/operação:** tarefas, visitas, checklists, campanhas,
  condições especiais, férias, Análise Gerencial usarem a filial efetiva.

## 5. Plano de testes (tudo com `BEGIN/ROLLBACK`, sem vínculo permanente)

1. Single-filial (Jhonatan/Canarana): todos os números iguais ao baseline atual.
2. Diogo com Caiapônia+Planalto Verde: ativa = Caiapônia → números idênticos ao
   baseline single-filial de Caiapônia (sem soma).
3. Ativa = Planalto Verde → dados exclusivamente de Planalto Verde em POPS
   (clientes, máquinas, serviços, contadores, Excel), Parque, Validação,
   Regularização, CRM, Meu Dia, visitas/retornos, campanhas, KPIs/relatórios.
4. Voltar para Caiapônia → retorno exato aos valores do teste 2.
5. Terceira filial não autorizada: `set_active_filial` recusa (`42501`) e nenhum dado.
6. Admin/manager sem filial ativa → global; com filial ativa → apenas aquela.
7. Desativar o vínculo adicional com Planalto Verde ativa → cai para a principal.
8. Auditoria de `set_active_filial` registrada; nenhuma alteração em cadastro,
   cargos, matrícula PM ou Excel POPS.

Resultados serão apresentados como `Teste | Obtido | Esperado | Status`.
