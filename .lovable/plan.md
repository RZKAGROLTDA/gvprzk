# Meu Dia — Escopo por Cargo (Pessoal + Equipe)

Objetivo: manter o Meu Dia pessoal como hoje e adicionar, para supervisor/manager/admin, uma visão de equipe agregada, com escopo validado no banco. Nenhuma RLS existente é alterada.

## 1. Regra de escopo (fonte única no banco)

Nova função `public.my_day_scope()` retorna `user_id, role, filial_id, scope`:

| Cargo | scope | O que pode ver |
| --- | --- | --- |
| sales_consultant, consultant, technical_consultant, rac, cpa, csa | `self` | apenas o próprio Meu Dia |
| supervisor | `filial` | o próprio + colaboradores aprovados/ativos da própria filial |
| manager | `global` | o próprio + todos aprovados/ativos, todas as filiais |
| admin | `global` | igual manager |

Regras aplicadas dentro das RPCs (nunca no frontend):
- `scope = self` → visão de equipe levanta exceção `42501`.
- `scope = filial` → `p_filial_id` recebido é **ignorado** e forçado para a filial do supervisor; consulta de colaborador de outra filial levanta `42501`.
- `scope = global` → filtros de filial/cargo/colaborador livres.
- Em todos os casos o alvo precisa estar `approval_status = 'approved'` e `employment_status = 'active'`.

## 2. Novas RPCs (SQL)

Para não duplicar a lógica já validada, o corpo atual de `get_my_day_summary()` e `get_my_day_details()` é movido para builders internos que recebem o usuário-alvo. As assinaturas públicas existentes continuam idênticas (sem overloading).

```sql
-- 2.1 Escopo
CREATE OR REPLACE FUNCTION public.my_day_scope()
RETURNS TABLE(user_id uuid, role text, filial_id uuid, scope text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_role text; v_filial uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado' USING ERRCODE='42501';
  END IF;
  SELECT p.filial_id INTO v_filial FROM public.profiles p
   WHERE p.user_id = v_uid AND p.approval_status='approved' AND p.employment_status='active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso negado: usuário não aprovado ou inativo' USING ERRCODE='42501';
  END IF;
  v_role := public.get_user_role();
  RETURN QUERY SELECT v_uid, v_role, v_filial,
    CASE WHEN v_role IN ('admin','manager') THEN 'global'
         WHEN v_role = 'supervisor' THEN 'filial'
         ELSE 'self' END;
END; $$;

-- 2.2 Builders internos (corpo atual, parametrizado por usuário-alvo)
CREATE OR REPLACE FUNCTION public.my_day_summary_build(p_user_id uuid, p_role text, p_today date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
-- idêntico ao corpo atual de get_my_day_summary(), trocando c.user_id/c.role
-- por p_user_id/p_role e as datas derivadas de p_today (semana ISO seg-dom).
$$;

CREATE OR REPLACE FUNCTION public.my_day_details_build(p_user_id uuid, p_block text, p_bucket text, p_limit int, p_offset int, p_today date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
-- idêntico ao corpo atual de get_my_day_details(), parametrizado pelo alvo.
$$;

-- 2.3 RPCs pessoais (assinatura inalterada, agora delegam ao builder)
CREATE OR REPLACE FUNCTION public.get_my_day_summary() RETURNS jsonb ... -- my_day_context() + builder
CREATE OR REPLACE FUNCTION public.get_my_day_details(p_block text, p_bucket text, p_limit int DEFAULT 50, p_offset int DEFAULT 0) RETURNS jsonb ...

-- 2.4 Detalhe de colaborador (leitura de outro usuário)
CREATE OR REPLACE FUNCTION public.get_my_day_user_summary(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s record; t record; v_today date;
BEGIN
  SELECT * INTO s FROM public.my_day_scope();
  IF p_user_id IS NULL OR p_user_id = s.user_id THEN
    RETURN public.get_my_day_summary();
  END IF;
  IF s.scope = 'self' THEN
    RAISE EXCEPTION 'Acesso negado: sem permissão para visão de equipe' USING ERRCODE='42501';
  END IF;
  SELECT p.user_id, p.filial_id, public.get_user_role(p.user_id) AS role INTO t
    FROM public.profiles p
   WHERE p.user_id = p_user_id AND p.approval_status='approved' AND p.employment_status='active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso negado: colaborador inválido' USING ERRCODE='42501';
  END IF;
  IF s.scope='filial' AND (t.filial_id IS NULL OR t.filial_id <> s.filial_id) THEN
    RAISE EXCEPTION 'Acesso negado: colaborador de outra filial' USING ERRCODE='42501';
  END IF;
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  RETURN public.my_day_summary_build(t.user_id, t.role, v_today);
END; $$;

-- Equivalente para drill-down do colaborador:
-- public.get_my_day_user_details(p_user_id uuid, p_block text, p_bucket text, p_limit int, p_offset int)
-- mesma validação de escopo + my_day_details_build.

-- 2.5 Visão de equipe agregada (1 chamada)
CREATE OR REPLACE FUNCTION public.get_my_day_team_summary(
  p_filial_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s record; v_today date; v_week_start date; v_filial uuid; v_rows jsonb; v_kpi jsonb;
BEGIN
  SELECT * INTO s FROM public.my_day_scope();
  IF s.scope = 'self' THEN
    RAISE EXCEPTION 'Acesso negado: sem permissão para visão de equipe' USING ERRCODE='42501';
  END IF;
  v_filial := CASE WHEN s.scope='filial' THEN s.filial_id ELSE p_filial_id END; -- supervisor: filtro forçado
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_week_start := (v_today - (EXTRACT(ISODOW FROM v_today)::int - 1))::date;

  WITH membros AS (
    SELECT p.user_id, p.name, p.filial_id, fi.nome AS filial_nome,
           COALESCE(ur.role::text, p.role) AS role
      FROM public.profiles p
      LEFT JOIN public.filiais fi ON fi.id = p.filial_id
      LEFT JOIN LATERAL (SELECT r.role FROM public.user_roles r WHERE r.user_id = p.user_id LIMIT 1) ur ON true
     WHERE p.approval_status='approved' AND p.employment_status='active'
       AND (v_filial IS NULL OR p.filial_id = v_filial)
       AND (p_user_id IS NULL OR p.user_id = p_user_id)
  ), filtrados AS (
    SELECT * FROM membros WHERE p_role IS NULL OR role = p_role
  ), metas AS (
    SELECT f.*,
      (SELECT g.target_value FROM public.activity_goal_settings g
        WHERE g.active AND g.activity_type='visita' AND g.role::text=f.role) AS meta_visitas,
      (SELECT g.period_type FROM public.activity_goal_settings g
        WHERE g.active AND g.activity_type='visita' AND g.role::text=f.role) AS visitas_period,
      (SELECT g.target_value FROM public.activity_goal_settings g
        WHERE g.active AND g.activity_type='ligacao' AND g.role::text=f.role) AS meta_ligacoes
    FROM filtrados f
  ), agg AS (
    SELECT m.*,
      -- realizado (agregação única por LATERAL, sem N chamadas)
      (SELECT count(*)::int FROM public.tasks t
        WHERE t.created_by=m.user_id AND t.task_type IN ('visita','technical_visit')
          AND t.start_date >= CASE WHEN m.visitas_period='weekly' THEN v_week_start ELSE v_today END
          AND t.start_date <= v_today) AS visitas_realizado,
      (SELECT count(*)::int FROM public.tasks t
        WHERE t.created_by=m.user_id AND t.task_type IN ('ligacao','prospection')
          AND t.start_date = v_today) AS ligacoes_realizado,
      (SELECT count(*)::int FROM public.visit_schedules vs
        WHERE vs.seller_id=m.user_id AND vs.status='planejado' AND vs.planned_date < v_today) AS visitas_atrasadas,
      (SELECT count(*)::int FROM public.task_followups f
        WHERE f.responsible_user_id=m.user_id AND f.followup_status='pendente'
          AND f.next_return_date IS NOT NULL AND f.next_return_date < v_today) AS retornos_atrasados,
      (SELECT count(*)::int FROM public.trainings tr
        WHERE tr.user_id=m.user_id AND tr.status='pendente' AND tr.training_date <= v_today) AS treinamentos_pendentes,
      (SELECT count(*)::int FROM public.tasks t
        WHERE t.created_by=m.user_id AND t.next_action_date IS NOT NULL
          AND COALESCE(t.status,'pending') NOT IN ('closed','completed')
          AND t.next_action_date < v_today) AS acoes_atrasadas
    FROM metas m
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', user_id, 'name', name, 'role', role,
      'filial_id', filial_id, 'filial_nome', filial_nome,
      'visitas_realizado', visitas_realizado, 'visitas_meta', meta_visitas,
      'ligacoes_realizado', ligacoes_realizado, 'ligacoes_meta', meta_ligacoes,
      'visitas_atrasadas', visitas_atrasadas, 'retornos_atrasados', retornos_atrasados,
      'treinamentos_pendentes', treinamentos_pendentes, 'acoes_atrasadas', acoes_atrasadas
    ) ORDER BY name), '[]'::jsonb),
    jsonb_build_object(
      'colaboradores', count(*),
      'com_pendencias', count(*) FILTER (WHERE visitas_atrasadas+retornos_atrasados+treinamentos_pendentes+acoes_atrasadas > 0),
      'meta_nao_atingida', count(*) FILTER (WHERE (meta_visitas IS NOT NULL AND visitas_realizado < meta_visitas)
                                              OR (meta_ligacoes IS NOT NULL AND ligacoes_realizado < meta_ligacoes)),
      'visitas_atrasadas', COALESCE(sum(visitas_atrasadas),0),
      'retornos_atrasados', COALESCE(sum(retornos_atrasados),0),
      'treinamentos_pendentes', COALESCE(sum(treinamentos_pendentes),0),
      'acoes_atrasadas', COALESCE(sum(acoes_atrasadas),0)
    )
  INTO v_rows, v_kpi FROM agg;

  RETURN jsonb_build_object(
    'scope', s.scope, 'today', v_today, 'week_start', v_week_start,
    'filters', jsonb_build_object('filial_id', v_filial, 'role', p_role, 'user_id', p_user_id),
    'kpis', v_kpi, 'rows', v_rows
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.get_my_day_team_summary(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_day_user_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_day_user_details(uuid, text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_day_scope() TO authenticated;
```

Nenhum `CREATE TABLE`, nenhum `ALTER POLICY`, nenhum `UPDATE`/`INSERT` de dados.

## 3. Filtros da interface

- Supervisor: sem seletor de filial (fixa na própria); filtros de cargo e colaborador limitados à filial.
- Manager/Admin: filtros de filial, cargo e colaborador.
- Valores "Todos" são convertidos para `NULL` antes da chamada (padrão do projeto).

## 4. Frontend alterado

| Arquivo | Mudança |
| --- | --- |
| `src/components/myday/MyDayLanding.tsx` | `/` redireciona sempre para `/meu-dia` (remove lógica de primeiro acesso da sessão) |
| `src/pages/MyDay.tsx` | Abas "Minha visão" / "Minha equipe" (só para supervisor/manager/admin) |
| `src/components/myday/TeamOverview.tsx` (novo) | KPIs da equipe + tabela por colaborador (cards no mobile) |
| `src/components/myday/TeamFilters.tsx` (novo) | Filtros filial/cargo/colaborador conforme escopo |
| `src/components/myday/UserDayDialog.tsx` (novo) | Meu Dia do colaborador em modo somente leitura (sem ações de edição) |
| `src/hooks/useMyDay.ts` | `useMyDayTeamSummary(filters)` e `useMyDayUserSummary(userId)` (`enabled` apenas ao abrir) |
| `src/lib/myDay.ts` | Tipos `MyDayTeamSummary`, `MyDayTeamRow` e helpers de escopo |

Reaproveita `ExecutionCards`/`PendingBlock` para o detalhe do colaborador, em modo leitura.

## 5. Performance

- Meu Dia pessoal: 1 chamada (`get_my_day_summary`), inalterada (~0,5 ms).
- Visão de equipe: 1 única chamada agregada; subqueries por colaborador resolvidas no mesmo plano (sem N chamadas do frontend). Índices já existentes em `tasks(created_by)`, `visit_schedules(seller_id)`, `task_followups(responsible_user_id)`, `trainings(user_id)` são reutilizados; se o `EXPLAIN ANALYZE` mostrar custo alto, reporto antes de criar índice novo.
- Detalhe de colaborador: só ao clicar na linha; `staleTime` 5 min, sem refetch em foco.

## 6. Validação de acesso fora do escopo (após aplicar)

1. Operacional chamando `get_my_day_team_summary()` → `42501`.
2. Supervisor enviando `p_filial_id` de outra filial → retorno restrito à própria filial.
3. Supervisor chamando `get_my_day_user_summary()` de outra filial → `42501`.
4. Manager/Admin com filtros de filial/cargo/colaborador → resultados coerentes.
5. Usuário pendente/rejeitado/inativo → bloqueado em todas as RPCs.
6. Conferência de que colaborador inativo não aparece na lista de equipe.
7. Meu Dia pessoal com números idênticos ao baseline atual (208 próximas ações).
