# Meu Dia — Filial Ativa (proposta final, aguardando autorização)

Incorpora os dois ajustes: assinatura única de `my_day_assert_target` (sem overload) e `effective_filial_ids` como autoridade única da Filial Ativa.

## 1. Assinaturas atuais em pg_proc (levantadas)

- `my_day_assert_target(p_user_id uuid)` — única assinatura existente.
- `get_my_day_team_summary(p_filial_id uuid, p_role text, p_user_id uuid)` — única.
- `get_my_day_user_summary(p_user_id uuid)` — única.
- `get_my_day_user_details(p_user_id uuid, p_block text, p_bucket text, p_limit integer, p_offset integer)` — única.
- `my_day_scope()`, `my_day_scope_v2()`, `my_day_context()`, `my_day_summary_build(uuid,text)`, `my_day_details_build(uuid,text,text,integer,integer)`, `my_day_role_of(uuid)` — existem e NÃO serão alteradas.

## 2. Consumidores de my_day_assert_target

Consulta em `pg_proc` (definições de todas as funções do schema public) e busca em todo o `src/`:
- Banco: somente `get_my_day_user_summary` e `get_my_day_user_details`.
- Frontend: nenhuma chamada direta (apenas a entrada gerada em `types.ts`, regenerada pela migração).

Nenhum outro consumidor existe; a assinatura antiga pode ser removida com segurança.

## 3. SQL final proposto

```sql
-- 3.1 my_day_assert_target — assinatura única (uuid, uuid DEFAULT NULL)
DROP FUNCTION public.my_day_assert_target(uuid);

CREATE FUNCTION public.my_day_assert_target(p_user_id uuid, p_filial_id uuid DEFAULT NULL)
 RETURNS TABLE(user_id uuid, role text, filial_id uuid, is_self boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  s        record;
  v_filial uuid;
  v_found  boolean;
  v_eff    uuid[];
BEGIN
  SELECT * INTO s FROM public.my_day_scope();

  -- 1) Filial Ativa informada é validada ANTES de qualquer retorno:
  --    effective_filial_ids lança 42501 para filial não autorizada/inexistente,
  --    inclusive quando o alvo é o próprio usuário.
  IF p_filial_id IS NOT NULL THEN
    v_eff := public.effective_filial_ids(p_filial_id);
  END IF;

  -- 2) Caso self (com p_filial_id NULL) preservado exatamente como hoje.
  IF p_user_id IS NULL OR p_user_id = s.user_id THEN
    RETURN QUERY SELECT s.user_id, s.role, s.filial_id, true;
    RETURN;
  END IF;

  IF s.scope = 'self' THEN
    RAISE EXCEPTION 'Acesso negado: sem permissão para consultar outros colaboradores' USING ERRCODE = '42501';
  END IF;

  SELECT p.filial_id, true INTO v_filial, v_found
  FROM public.profiles p
  WHERE p.user_id = p_user_id
    AND p.approval_status = 'approved'
    AND p.employment_status = 'active';

  IF NOT COALESCE(v_found, false) THEN
    RAISE EXCEPTION 'Acesso negado: colaborador inexistente, não aprovado ou inativo' USING ERRCODE = '42501';
  END IF;

  -- 3) Não-self: resolve a Filial Ativa efetiva (se p_filial_id era NULL,
  --    não-global resolve para a principal; global para '{}'::uuid[] = sem restrição).
  IF v_eff IS NULL THEN
    v_eff := public.effective_filial_ids(NULL);
  END IF;
  IF array_length(v_eff, 1) IS NOT NULL
     AND (v_filial IS NULL OR NOT (v_filial = ANY(v_eff))) THEN
    RAISE EXCEPTION 'Acesso negado: colaborador de outra filial' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT p_user_id, public.my_day_role_of(p_user_id), v_filial, false;
END;
$function$;
```

Comportamento: self → sempre OK (intacto); consultor comum (`self` scope) → 42501; supervisor/admin/manager → o colaborador precisa pertencer à(s) filial(is) efetiva(s) resolvida(s) por `effective_filial_ids(p_filial_id)`; não autorizada → 42501. Nunca principal + adicionais: `effective_filial_ids` devolve no máximo UMA filial para não-global.

```sql
-- 3.2 get_my_day_team_summary — mesma assinatura e mesmo retorno;
--     apenas a resolução da filial muda (linha v_filial := ...).
CREATE OR REPLACE FUNCTION public.get_my_day_team_summary(
  p_filial_id uuid DEFAULT NULL, p_role text DEFAULT NULL, p_user_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  s            record;
  v_today      date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_week_start date;
  v_week_end   date;
  v_is_weekend boolean;
  v_month_start date;
  v_month_end   date;
  v_win_start   date;
  v_win_end     date;
  v_elapsed_wd  integer;
  v_elapsed_all integer;
  v_total_wd    integer;
  v_total_all   integer;
  v_filial     uuid;
  v_role       text := NULLIF(btrim(COALESCE(p_role, '')), '');
  v_rows       jsonb;
  v_kpi        jsonb;
BEGIN
  SELECT * INTO s FROM public.my_day_scope();

  IF s.scope = 'self' THEN
    RAISE EXCEPTION 'Acesso negado: sem permissão para visão de equipe' USING ERRCODE = '42501';
  END IF;

  -- ÚNICA ALTERAÇÃO FUNCIONAL: supervisor resolve a Filial Ativa via
  -- effective_filial_ids (NULL → somente a principal; informada → validada, senão 42501).
  -- Global (admin/manager) mantém o comportamento atual: NULL = todas, informada = somente ela.
  v_filial := CASE
    WHEN s.scope = 'global' THEN p_filial_id
    ELSE (public.effective_filial_ids(p_filial_id))[1]
  END;

  -- >>> Daqui em diante o corpo é IDÊNTICO ao atual (janelas, CTEs
  -- membros/filtrados/metas/agg, metas diárias e semanais, KPIs e RETURN),
  -- sem nenhuma outra mudança. <<<
  ... (corpo atual preservado byte a byte)
END;
$function$;
```

```sql
-- 3.3 get_my_day_user_summary — sem overload: drop da antiga, nova com p_filial_id
DROP FUNCTION public.get_my_day_user_summary(uuid);

CREATE FUNCTION public.get_my_day_user_summary(p_user_id uuid, p_filial_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM public.my_day_assert_target(p_user_id, p_filial_id);
  RETURN public.my_day_summary_build(t.user_id, t.role);
END;
$function$;

-- 3.4 get_my_day_user_details — idem
DROP FUNCTION public.get_my_day_user_details(uuid, text, text, integer, integer);

CREATE FUNCTION public.get_my_day_user_details(
  p_user_id uuid, p_block text, p_bucket text,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_filial_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM public.my_day_assert_target(p_user_id, p_filial_id);
  RETURN public.my_day_details_build(t.user_id, p_block, p_bucket, p_limit, p_offset);
END;
$function$;
```

Conferência pós-migração (pg_proc): cada função com exatamente UMA assinatura — `my_day_assert_target(uuid, uuid)`, `get_my_day_user_summary(uuid, uuid)`, `get_my_day_user_details(uuid, text, text, integer, integer, uuid)`, `get_my_day_team_summary(uuid, text, uuid)`. Sem overload e sem caminho antigo.

`my_day_scope()` intacta. `my_day_scope_v2()` não é usada (não cria segunda lógica de decisão). Meu Dia pessoal (`get_my_day_summary`, `get_my_day_details`, `my_day_context`, builders) 100% intacto. Nenhuma RLS, cargo, matrícula ou vínculo é tocado.

## 4. Alterações exatas no frontend

**`src/hooks/useMyDay.ts`** — apenas os hooks de equipe/individual:
- `useMyDayUserSummary(userId, filialId, enabled)`: queryKey vira `['my-day-user-summary', userId, filialId]`; RPC recebe `{ p_user_id: userId, p_filial_id: filialId }`.
- `useMyDayUserDetails(userId, block, bucket, page, pageSize, filialId, enabled)`: queryKey vira `['my-day-user-details', userId, filialId, block, bucket, page, pageSize]`; RPC recebe `p_filial_id` adicional.
- `useMyDayTeamSummary`: sem mudança de código (já envia `p_filial_id` e já tem `filialId` na queryKey).
- `useMyDaySummary` e `useMyDayDetails` (pessoais): intocados, mesmas queryKeys.

**`src/pages/MyDay.tsx`**:
- `useActiveFilialFilter()` passa a desestruturar também `isScopeReady`.
- `useMyDayTeamSummary(teamFilters, showTeam && tab === 'team' && isScopeReady)` — não-global nunca consulta antes da Filial Ativa resolvida.
- `<UserDayDialog ... filialId={activeScopeFilialId} />`.

**`src/components/myday/UserDayDialog.tsx`**:
- Nova prop `filialId?: string | null`; repassada ao `useMyDayUserSummary(member?.user_id ?? null, filialId ?? null, open)`.

Nenhum outro arquivo. Nenhum filtro local de filial criado. `useMyDayUserDetails` não tem consumidor ativo hoje, mas é atualizado para não ficar como caminho sem filial.

## 5. Garantia de sem-overload / sem-bypass

- As três funções com assinatura antiga são removidas com `DROP FUNCTION` explícito na mesma migração; `CREATE OR REPLACE` só é usado onde a assinatura não muda.
- Para não-global, `effective_filial_ids(NULL)` devolve SOMENTE a filial principal — nunca a união; filial informada fora do escopo → 42501.
- Frontend: não-global só chama equipe/individual com `filialId` resolvido (`isScopeReady`).

## 6. Bateria prevista (após autorização), sem correções automáticas

Formato Teste | Filial Ativa | Obtido | Esperado | Status:
supervisor na principal; supervisor na adicional (somente equipe dela, sem soma); troca e volta sem resíduo; filial não autorizada → 42501; abrir colaborador da filial ativa (OK) e de outra filial (42501); consultor comum na equipe → 42501; admin sem filial → global; admin com filial → somente ela; Meu Dia pessoal idêntico ao atual; troca de filial na tela sem reload/cache residual. Falha → parar e apresentar a causa.

## Fora do escopo

`my_day_scope()`, Meu Dia pessoal, `useTasks`/tarefas/offline, RLS, POPS, CRM/Carteira, Parque, Validação, Regularização.
