# M2 — Escopo multi-filial nas funções-base e nas RLS mapeadas (desenho, não executado)

Princípio: onde hoje existe **uma** filial (`profiles.filial_id`), passa a existir o **conjunto** `get_user_filial_ids()` (principal + adicionais ativas). Admin e manager continuam globais e são avaliados **antes** de qualquer verificação de filial. Nenhuma role muda, nenhum acesso global novo é criado. Para quem tem só a filial principal, o conjunto tem 1 elemento — resultado idêntico ao atual.

## 1. Funções-base — versão final

```sql
-- user_same_filial: interseção de conjuntos em vez de igualdade
CREATE OR REPLACE FUNCTION public.user_same_filial(target_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT target_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM unnest(public.get_user_filial_ids(auth.uid())) a(fid)
       WHERE a.fid = ANY (public.get_user_filial_ids_internal(target_user_id))
     );
$$;

-- helper interno: mesma lógica de get_user_filial_ids, SEM a checagem de chamador
-- (necessário porque user_same_filial precisa ler o conjunto de OUTRO usuário)
CREATE OR REPLACE FUNCTION public.get_user_filial_ids_internal(p_user_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_remove(array_agg(DISTINCT fid), NULL), '{}'::uuid[])
  FROM (
    SELECT p.filial_id AS fid FROM public.profiles p
     WHERE p.user_id = p_user_id AND p.approval_status='approved' AND p.employment_status='active'
    UNION
    SELECT uf.filial_id FROM public.user_filiais uf
      JOIN public.profiles p2 ON p2.user_id = uf.user_id
     WHERE uf.user_id = p_user_id AND uf.active
       AND p2.approval_status='approved' AND p2.employment_status='active'
  ) s;
$$;
REVOKE EXECUTE ON FUNCTION public.get_user_filial_ids_internal(uuid) FROM PUBLIC;
-- NÃO concedido a authenticated: uso apenas interno por outras funções SECURITY DEFINER.

-- pops_scope: acrescenta filial_ids, mantém filial_id (principal) para compatibilidade
CREATE OR REPLACE FUNCTION public.pops_scope()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := (SELECT auth.uid()); v_enabled boolean; v_filial uuid;
        v_scope text := 'none'; v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('scope','none','filial_id',NULL,'filial_ids','[]'::jsonb,'user_id',NULL);
  END IF;
  SELECT (p.approval_status='approved' AND p.employment_status='active'), p.filial_id
    INTO v_enabled, v_filial FROM public.profiles p WHERE p.user_id = v_uid;
  IF COALESCE(v_enabled,false) = false THEN
    RETURN jsonb_build_object('scope','none','filial_id',NULL,'filial_ids','[]'::jsonb,'user_id',v_uid);
  END IF;
  IF public.has_role(v_uid,'admin') OR public.has_role(v_uid,'manager') THEN v_scope := 'global';
  ELSIF public.has_role(v_uid,'supervisor') OR public.has_role(v_uid,'rac')
     OR public.has_role(v_uid,'cpa')       OR public.has_role(v_uid,'csa') THEN v_scope := 'filial';
  END IF;
  v_ids := public.get_user_filial_ids_internal(v_uid);
  RETURN jsonb_build_object('scope',v_scope,'filial_id',v_filial,
                            'filial_ids', to_jsonb(v_ids), 'user_id', v_uid);
END $$;

-- my_day_scope: acrescenta coluna filial_ids, mantém filial_id
CREATE OR REPLACE FUNCTION public.my_day_scope()
RETURNS TABLE(user_id uuid, role text, filial_id uuid, filial_ids uuid[], scope text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_role text; v_filial uuid; v_found boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Acesso negado: usuário não autenticado' USING ERRCODE='42501'; END IF;
  SELECT p.filial_id, true INTO v_filial, v_found FROM public.profiles p
   WHERE p.user_id = v_uid AND p.approval_status='approved' AND p.employment_status='active';
  IF NOT COALESCE(v_found,false) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não aprovado ou inativo' USING ERRCODE='42501';
  END IF;
  v_role := public.get_user_role();
  RETURN QUERY SELECT v_uid, v_role, v_filial,
    public.get_user_filial_ids_internal(v_uid),
    CASE WHEN v_role IN ('admin','manager') THEN 'global'
         WHEN v_role = 'supervisor' THEN 'filial' ELSE 'self' END;
END $$;
```

Ponto de atenção: `my_day_scope()` muda de assinatura de retorno (nova coluna). Como o retorno é `TABLE`, é preciso `DROP FUNCTION public.my_day_scope()` antes do `CREATE`, e recriar na mesma migration todas as funções que fazem `SELECT * FROM my_day_scope()` — serão revisadas e recriadas com `SELECT` de colunas nomeadas para não quebrar. Alternativa mais segura, a decidir: **não** alterar `my_day_scope()` na M2 e criar `my_day_scope_v2()` , deixando a troca dos consumidores para a M3. Recomendação: seguir a alternativa v2.

## 2, 3. RLS alteradas — regra antiga x regra nova

| Tabela / policy | Regra antiga | Regra nova |
|---|---|---|
| `campaign_clients` select/insert/update | `supervisor AND filial_id = get_supervisor_filial_id(auth.uid())` | `supervisor AND user_can_access_filial(filial_id)` |
| `special_conditions` select/insert/update/delete | idem | idem |
| `visit_schedules` select/insert/update/delete | idem | idem |
| `task_followups` select/insert/update | idem (com `(SELECT auth.uid())`) | `supervisor AND user_can_access_filial(filial_id)` (mantendo o wrapper `(SELECT ...)`) |
| `trainings` select/update/delete | `supervisor AND NOT (filial_id IS DISTINCT FROM get_supervisor_filial_id(...))` | `supervisor AND user_can_access_filial(filial_id)` |
| `clients` select/update | `EXISTS(profiles viewer/p1 … viewer.filial_id = filial do criador)` | `supervisor AND user_can_access_filial((SELECT filial_id FROM profiles WHERE user_id = clients.created_by))` |
| `opportunities` select/insert | `supervisor AND EXISTS(profiles JOIN filiais … t.filial = f.nome)` | `supervisor AND user_can_access_filial_nome(t.filial)` (para `opportunities.filial` no select, idem sobre a própria coluna) |
| `opportunity_items` (ALL) + insert | idem via join tasks/filiais | `supervisor AND user_can_access_filial_nome(t.filial)` |
| `pops_machines` select | `pops_filial_id = (pops_scope()->>'filial_id')::uuid` | `pops_filial_id IS NOT NULL AND user_can_access_filial(pops_filial_id)` (ramo `global` inalterado) |
| `pops_client_assignments` select | subquery com `e.filial_id = (pops_scope()->>'filial_id')::uuid` | mesma subquery com `user_can_access_filial(e.filial_id)` |
| `team_vacations` insert | `can_insert_vacation(filial_id)` compara `p.filial_id = p_filial_id` | função adaptada: `user_can_access_filial(p_filial_id)` no ramo não-global |
| `equipment_regularization_batches/items` | já usam `can_view_equipment_park()` / `can_*_equipment_regularization()`, sem filtro por filial | **sem alteração** (classe C do plano) |
| `pops_import_rows` | `pops_is_manager()` | **sem alteração** |
| `profiles_select_supervisor_filial`, `secure_task_select_enhanced`, `task_equipment`, `task_access_metadata`, `can_view_opportunity` | comparações de filial única | **fora da M2** — dependem de `tasks.filial` texto e de RPCs; entram na M3 junto com os consumidores |

Funções auxiliares também adaptadas na M2 (usadas dentro das RLS acima): `can_insert_vacation`, `user_same_filial`.
`get_supervisor_filial_id` e `get_user_filial_id` **permanecem** intactas (passam a significar "filial principal").

## 4. Impacto esperado por módulo

| Módulo | Antes | Depois |
|---|---|---|
| Campanhas / Condições Especiais | supervisor vê só a filial principal | vê todas as filiais habilitadas |
| CRM (programação de visitas, retornos, treinamentos) | idem | idem |
| Clientes / Oportunidades | supervisor vê criadores da mesma filial | vê criadores de qualquer filial habilitada |
| POPS | escopo `filial` = 1 filial | escopo `filial` = conjunto de filiais |
| Férias | inserção só na filial principal | inserção em qualquer filial habilitada |
| Meu Dia | inalterado nesta etapa (`my_day_scope_v2` criada, consumidores na M3) | — |
| Parque / Regularização / Relatórios / Tarefas | **inalterados** (M3) | — |
| Admin/Manager | global | global, sem qualquer mudança |

## 5. Testes de segurança e regressão (executados em `BEGIN … ROLLBACK`)

| Teste | Esperado |
|---|---|
| Usuário com 1 filial (rac/supervisor/csa) | contagem de linhas visíveis em cada tabela do item 2 idêntica ao baseline pré-M2 |
| Usuário com 2 filiais (vínculo criado só dentro da transação) | passa a ver linhas das duas filiais; `user_can_access_filial` true para ambas |
| Terceira filial não vinculada | `user_can_access_filial` false; SELECT direto retorna 0 linhas; INSERT com aquela `filial_id` recusado |
| Admin/manager | contagens globais idênticas ao baseline, indiferentes a `user_filiais` |
| Forçar filial não autorizada | INSERT/UPDATE em `campaign_clients`, `visit_schedules`, `special_conditions`, `team_vacations` com `filial_id` alheio → violação de RLS |
| `user_same_filial` | true entre usuários que compartilham qualquer filial; false quando não há interseção |
| `pops_scope` / `my_day_scope_v2` | `scope` inalterado por role; `filial_ids` contém principal + adicionais; `filial_id` continua sendo a principal |
| Vínculo desativado no meio da transação | acesso cessa na consulta seguinte |
| Performance | `EXPLAIN ANALYZE` das listagens de `visit_schedules`, `task_followups` e `pops_machines` sem degradação relevante |

## 6. Fora do escopo da M2

RPCs da M3, qualquer alteração de frontend, configuração multi-filial do Diogo, e qualquer nova permissão global.

## 7. Entregável antes da execução

A migration M2 completa (funções + `DROP/CREATE POLICY` de cada policy da tabela do item 2, em um único bloco) será apresentada para aprovação antes de qualquer execução, junto com a decisão sobre `my_day_scope` v2 vs. alteração in-place.
