# Meu Dia — Escopo por Cargo (SQL completo, sem aplicar)

Regra de escopo (validada SEMPRE no banco):

| Cargo | scope | Alcance |
| --- | --- | --- |
| sales_consultant, consultant, technical_consultant, rac, cpa, csa | `self` | somente o próprio Meu Dia |
| supervisor | `filial` | o próprio + aprovados/ativos da própria filial |
| manager | `global` | o próprio + todos os aprovados/ativos, todas as filiais |
| admin | `global` | igual manager |

Sem `CREATE TABLE`, sem `ALTER POLICY`, sem `INSERT/UPDATE/DELETE`. As regras já validadas do Meu Dia pessoal são preservadas byte a byte — apenas movidas para builders parametrizados pelo usuário-alvo.

---

## SQL completo

```sql
-- =====================================================================
-- 1) ESCOPO DO USUÁRIO AUTENTICADO
-- =====================================================================
CREATE OR REPLACE FUNCTION public.my_day_scope()
RETURNS TABLE(user_id uuid, role text, filial_id uuid, scope text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_role   text;
  v_filial uuid;
  v_found  boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT p.filial_id, true INTO v_filial, v_found
  FROM public.profiles p
  WHERE p.user_id = v_uid
    AND p.approval_status = 'approved'
    AND p.employment_status = 'active';

  IF NOT COALESCE(v_found, false) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não aprovado ou inativo' USING ERRCODE = '42501';
  END IF;

  v_role := public.get_user_role();

  RETURN QUERY
  SELECT v_uid, v_role, v_filial,
         CASE
           WHEN v_role IN ('admin', 'manager') THEN 'global'
           WHEN v_role = 'supervisor'          THEN 'filial'
           ELSE 'self'
         END;
END;
$function$;

-- =====================================================================
-- 2) CARGO PRINCIPAL DE UM USUÁRIO ALVO (mesma prioridade de get_user_role)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.my_day_role_of(p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    CASE
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin')                THEN 'admin'
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'manager')              THEN 'manager'
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'supervisor')           THEN 'supervisor'
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'rac')                  THEN 'rac'
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'cpa')                  THEN 'cpa'
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'csa')                  THEN 'csa'
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'consultant')           THEN 'consultant'
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'sales_consultant')     THEN 'sales_consultant'
      WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'technical_consultant') THEN 'technical_consultant'
      ELSE 'none'
    END, 'none');
$function$;

-- =====================================================================
-- 3) VALIDAÇÃO DE ALVO (nunca confia no user_id do frontend)
--    Retorna o usuário-alvo autorizado ou levanta 42501.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.my_day_assert_target(p_user_id uuid)
RETURNS TABLE(user_id uuid, role text, filial_id uuid, is_self boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  s        record;
  v_filial uuid;
  v_found  boolean;
BEGIN
  SELECT * INTO s FROM public.my_day_scope();

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

  IF s.scope = 'filial' AND (v_filial IS NULL OR s.filial_id IS NULL OR v_filial <> s.filial_id) THEN
    RAISE EXCEPTION 'Acesso negado: colaborador de outra filial' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT p_user_id, public.my_day_role_of(p_user_id), v_filial, false;
END;
$function$;

-- =====================================================================
-- 4) BUILDER DO RESUMO (corpo já validado, parametrizado pelo alvo)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.my_day_summary_build(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_today      date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_week_start date;
  v_week_end   date;
  v_is_weekend boolean;
  g_vis        record;
  g_lig        record;
  v_vis_done   integer := 0;
  v_lig_done   integer := 0;
  v_vis_target integer;
  v_lig_target integer;
  v_sched      jsonb;
  v_ret        jsonb;
  v_trn        jsonb;
  v_tasks      jsonb;
BEGIN
  v_week_start := (v_today - (EXTRACT(ISODOW FROM v_today)::int - 1))::date;
  v_week_end   := (v_week_start + 6)::date;
  v_is_weekend := EXTRACT(ISODOW FROM v_today)::int >= 6;

  SELECT target_value, period_type, weekdays_only INTO g_vis
  FROM public.activity_goal_settings
  WHERE active AND activity_type = 'visita' AND role::text = p_role;

  SELECT target_value, period_type, weekdays_only INTO g_lig
  FROM public.activity_goal_settings
  WHERE active AND activity_type = 'ligacao' AND role::text = p_role;

  IF g_vis.period_type = 'weekly' THEN
    SELECT count(*)::int INTO v_vis_done
    FROM public.tasks t
    WHERE t.created_by = p_user_id
      AND t.task_type IN ('visita', 'technical_visit')
      AND t.start_date >= v_week_start
      AND t.start_date <= v_today;
  ELSE
    SELECT count(*)::int INTO v_vis_done
    FROM public.tasks t
    WHERE t.created_by = p_user_id
      AND t.task_type IN ('visita', 'technical_visit')
      AND t.start_date = v_today;
  END IF;

  SELECT count(*)::int INTO v_lig_done
  FROM public.tasks t
  WHERE t.created_by = p_user_id
    AND t.task_type IN ('ligacao', 'prospection')
    AND t.start_date = v_today;

  v_vis_target := CASE
    WHEN g_vis.target_value IS NULL THEN NULL
    WHEN g_vis.weekdays_only AND v_is_weekend THEN 0
    ELSE g_vis.target_value END;

  v_lig_target := CASE
    WHEN g_lig.target_value IS NULL THEN NULL
    WHEN g_lig.weekdays_only AND v_is_weekend THEN 0
    ELSE g_lig.target_value END;

  -- Programação de visitas
  WITH s AS (
    SELECT vs.id, vs.planned_date, vs.client_name, vs.client_code, vs.observation,
           CASE WHEN vs.planned_date < v_today THEN 'overdue'
                WHEN vs.planned_date = v_today THEN 'today'
                ELSE 'upcoming' END AS bucket
    FROM public.visit_schedules vs
    WHERE vs.seller_id = p_user_id
      AND vs.status = 'planejado'
      AND vs.planned_date <= v_today + 7
  ), ranked AS (
    SELECT s.*, row_number() OVER (PARTITION BY bucket ORDER BY planned_date, client_name) AS rn FROM s
  )
  SELECT jsonb_build_object(
    'overdue_count',  count(*) FILTER (WHERE bucket = 'overdue'),
    'today_count',    count(*) FILTER (WHERE bucket = 'today'),
    'upcoming_count', count(*) FILTER (WHERE bucket = 'upcoming'),
    'overdue_preview',  COALESCE(jsonb_agg(item ORDER BY planned_date) FILTER (WHERE bucket='overdue'  AND rn <= 5), '[]'::jsonb),
    'today_preview',    COALESCE(jsonb_agg(item ORDER BY planned_date) FILTER (WHERE bucket='today'    AND rn <= 5), '[]'::jsonb),
    'upcoming_preview', COALESCE(jsonb_agg(item ORDER BY planned_date) FILTER (WHERE bucket='upcoming' AND rn <= 5), '[]'::jsonb)
  ) INTO v_sched
  FROM (
    SELECT bucket, planned_date, rn,
           jsonb_build_object('id', id, 'planned_date', planned_date,
                              'client_name', client_name, 'client_code', client_code,
                              'observation', left(COALESCE(observation, ''), 160)) AS item
    FROM ranked
  ) x;

  -- Retornos
  WITH r AS (
    SELECT f.id, f.client_name, f.client_code, f.next_return_date, f.return_notes, f.filial_id,
           CASE WHEN f.next_return_date < v_today THEN 'overdue'
                WHEN f.next_return_date = v_today THEN 'today'
                ELSE 'upcoming' END AS bucket
    FROM public.task_followups f
    WHERE f.responsible_user_id = p_user_id
      AND f.followup_status = 'pendente'
      AND f.next_return_date IS NOT NULL
      AND f.next_return_date <= v_today + 7
  ), ranked AS (
    SELECT r.*, row_number() OVER (PARTITION BY bucket ORDER BY next_return_date, client_name) AS rn FROM r
  )
  SELECT jsonb_build_object(
    'overdue_count',  count(*) FILTER (WHERE bucket = 'overdue'),
    'today_count',    count(*) FILTER (WHERE bucket = 'today'),
    'upcoming_count', count(*) FILTER (WHERE bucket = 'upcoming'),
    'overdue_preview',  COALESCE(jsonb_agg(item ORDER BY next_return_date) FILTER (WHERE bucket='overdue'  AND rn <= 5), '[]'::jsonb),
    'today_preview',    COALESCE(jsonb_agg(item ORDER BY next_return_date) FILTER (WHERE bucket='today'    AND rn <= 5), '[]'::jsonb),
    'upcoming_preview', COALESCE(jsonb_agg(item ORDER BY next_return_date) FILTER (WHERE bucket='upcoming' AND rn <= 5), '[]'::jsonb)
  ) INTO v_ret
  FROM (
    SELECT bucket, next_return_date, rn,
           jsonb_build_object('id', id, 'client_name', client_name, 'client_code', client_code,
                              'next_return_date', next_return_date, 'filial_id', filial_id,
                              'notes', left(COALESCE(return_notes, ''), 160)) AS item
    FROM ranked
  ) x;

  -- Treinamentos
  WITH t AS (
    SELECT tr.id, tr.name, tr.training_date, tr.training_time, tr.hours,
           CASE WHEN tr.training_date < v_today THEN 'overdue'
                WHEN tr.training_date = v_today THEN 'today'
                ELSE 'upcoming' END AS bucket
    FROM public.trainings tr
    WHERE tr.user_id = p_user_id
      AND tr.status = 'pendente'
      AND tr.training_date <= v_today + 30
  ), ranked AS (
    SELECT t.*, row_number() OVER (PARTITION BY bucket ORDER BY training_date, training_time) AS rn FROM t
  )
  SELECT jsonb_build_object(
    'overdue_count',  count(*) FILTER (WHERE bucket = 'overdue'),
    'today_count',    count(*) FILTER (WHERE bucket = 'today'),
    'upcoming_count', count(*) FILTER (WHERE bucket = 'upcoming'),
    'overdue_preview',  COALESCE(jsonb_agg(item ORDER BY training_date) FILTER (WHERE bucket='overdue'  AND rn <= 5), '[]'::jsonb),
    'today_preview',    COALESCE(jsonb_agg(item ORDER BY training_date) FILTER (WHERE bucket='today'    AND rn <= 5), '[]'::jsonb),
    'upcoming_preview', COALESCE(jsonb_agg(item ORDER BY training_date) FILTER (WHERE bucket='upcoming' AND rn <= 5), '[]'::jsonb)
  ) INTO v_trn
  FROM (
    SELECT bucket, training_date, rn,
           jsonb_build_object('id', id, 'name', name, 'training_date', training_date,
                              'training_time', training_time, 'hours', hours) AS item
    FROM ranked
  ) x;

  -- Próximas ações (regra validada: next_action_date)
  WITH a AS (
    SELECT t.id, t.task_type, t.client, t.clientcode, t.name,
           t.start_date, t.end_date, t.next_action, t.next_action_date,
           CASE WHEN t.next_action_date <  v_today     THEN 'overdue'
                WHEN t.next_action_date =  v_today     THEN 'today'
                WHEN t.next_action_date <= v_today + 7 THEN 'upcoming'
                ELSE NULL END AS bucket
    FROM public.tasks t
    WHERE t.created_by = p_user_id
      AND t.next_action_date IS NOT NULL
      AND COALESCE(t.status, 'pending') NOT IN ('closed', 'completed')
  ), f AS (
    SELECT * FROM a WHERE bucket IS NOT NULL
  ), ranked AS (
    SELECT f.*, row_number() OVER (PARTITION BY bucket ORDER BY next_action_date, client) AS rn FROM f
  )
  SELECT jsonb_build_object(
    'overdue_count',  count(*) FILTER (WHERE bucket = 'overdue'),
    'today_count',    count(*) FILTER (WHERE bucket = 'today'),
    'upcoming_count', count(*) FILTER (WHERE bucket = 'upcoming'),
    'overdue_preview',  COALESCE(jsonb_agg(item ORDER BY next_action_date) FILTER (WHERE bucket='overdue'  AND rn <= 5), '[]'::jsonb),
    'today_preview',    COALESCE(jsonb_agg(item ORDER BY next_action_date) FILTER (WHERE bucket='today'    AND rn <= 5), '[]'::jsonb),
    'upcoming_preview', COALESCE(jsonb_agg(item ORDER BY next_action_date) FILTER (WHERE bucket='upcoming' AND rn <= 5), '[]'::jsonb)
  ) INTO v_tasks
  FROM (
    SELECT bucket, rn, next_action_date,
           jsonb_build_object('id', id, 'task_type', task_type, 'client', client,
                              'clientcode', clientcode, 'title', name,
                              'start_date', start_date, 'end_date', end_date,
                              'next_action', left(COALESCE(next_action, ''), 160),
                              'next_action_date', next_action_date) AS item
    FROM ranked
  ) x;

  RETURN jsonb_build_object(
    'user', jsonb_build_object(
      'user_id', p_user_id, 'role', p_role, 'today', v_today,
      'week_start', v_week_start, 'week_end', v_week_end, 'is_weekend', v_is_weekend
    ),
    'goals', jsonb_build_object(
      'visitas', jsonb_build_object(
        'meta', v_vis_target, 'realizado', v_vis_done,
        'faltam',   CASE WHEN v_vis_target IS NULL THEN NULL ELSE GREATEST(v_vis_target - v_vis_done, 0) END,
        'atingida', CASE WHEN v_vis_target IS NULL THEN NULL ELSE (v_vis_done >= v_vis_target) END,
        'period_type', g_vis.period_type, 'weekdays_only', g_vis.weekdays_only,
        'sem_meta_hoje', COALESCE(g_vis.weekdays_only AND v_is_weekend, false)
      ),
      'ligacoes', jsonb_build_object(
        'meta', v_lig_target, 'realizado', v_lig_done,
        'faltam',   CASE WHEN v_lig_target IS NULL THEN NULL ELSE GREATEST(v_lig_target - v_lig_done, 0) END,
        'atingida', CASE WHEN v_lig_target IS NULL THEN NULL ELSE (v_lig_done >= v_lig_target) END,
        'period_type', g_lig.period_type, 'weekdays_only', g_lig.weekdays_only,
        'sem_meta_hoje', COALESCE(g_lig.weekdays_only AND v_is_weekend, false)
      )
    ),
    'visit_schedules', v_sched,
    'returns',         v_ret,
    'trainings',       v_trn,
    'open_tasks',      v_tasks
  );
END;
$function$;

-- =====================================================================
-- 5) BUILDER DO DRILL-DOWN (corpo já validado, parametrizado pelo alvo)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.my_day_details_build(
  p_user_id uuid, p_block text, p_bucket text, p_limit integer, p_offset integer
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_today  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_total  integer := 0;
  v_items  jsonb   := '[]'::jsonb;
BEGIN
  IF p_block NOT IN ('visit_schedules', 'returns', 'trainings', 'open_tasks') THEN
    RAISE EXCEPTION 'p_block inválido: %', p_block USING ERRCODE = '22023';
  END IF;
  IF p_bucket NOT IN ('overdue', 'today', 'upcoming') THEN
    RAISE EXCEPTION 'p_bucket inválido: %', p_bucket USING ERRCODE = '22023';
  END IF;

  IF p_block = 'visit_schedules' THEN
    WITH s AS (
      SELECT vs.id, vs.planned_date, vs.client_name, vs.client_code, vs.observation
      FROM public.visit_schedules vs
      WHERE vs.seller_id = p_user_id
        AND vs.status = 'planejado'
        AND (
          (p_bucket = 'overdue'  AND vs.planned_date <  v_today) OR
          (p_bucket = 'today'    AND vs.planned_date =  v_today) OR
          (p_bucket = 'upcoming' AND vs.planned_date >  v_today AND vs.planned_date <= v_today + 7)
        )
    ), cnt AS (SELECT count(*)::int n FROM s),
    page AS (SELECT * FROM s ORDER BY planned_date, client_name LIMIT v_limit OFFSET v_offset)
    SELECT (SELECT n FROM cnt),
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', id, 'planned_date', planned_date, 'client_name', client_name,
              'client_code', client_code, 'observation', left(COALESCE(observation,''),160)
            ) ORDER BY planned_date) FROM page), '[]'::jsonb)
      INTO v_total, v_items;

  ELSIF p_block = 'returns' THEN
    WITH r AS (
      SELECT f.id, f.client_name, f.client_code, f.next_return_date, f.return_notes, f.filial_id
      FROM public.task_followups f
      WHERE f.responsible_user_id = p_user_id
        AND f.followup_status = 'pendente'
        AND f.next_return_date IS NOT NULL
        AND (
          (p_bucket = 'overdue'  AND f.next_return_date <  v_today) OR
          (p_bucket = 'today'    AND f.next_return_date =  v_today) OR
          (p_bucket = 'upcoming' AND f.next_return_date >  v_today AND f.next_return_date <= v_today + 7)
        )
    ), cnt AS (SELECT count(*)::int n FROM r),
    page AS (SELECT * FROM r ORDER BY next_return_date, client_name LIMIT v_limit OFFSET v_offset)
    SELECT (SELECT n FROM cnt),
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', id, 'client_name', client_name, 'client_code', client_code,
              'next_return_date', next_return_date, 'filial_id', filial_id,
              'notes', left(COALESCE(return_notes,''),160)
            ) ORDER BY next_return_date) FROM page), '[]'::jsonb)
      INTO v_total, v_items;

  ELSIF p_block = 'trainings' THEN
    WITH t AS (
      SELECT tr.id, tr.name, tr.training_date, tr.training_time, tr.hours
      FROM public.trainings tr
      WHERE tr.user_id = p_user_id
        AND tr.status = 'pendente'
        AND (
          (p_bucket = 'overdue'  AND tr.training_date <  v_today) OR
          (p_bucket = 'today'    AND tr.training_date =  v_today) OR
          (p_bucket = 'upcoming' AND tr.training_date >  v_today AND tr.training_date <= v_today + 30)
        )
    ), cnt AS (SELECT count(*)::int n FROM t),
    page AS (SELECT * FROM t ORDER BY training_date, training_time LIMIT v_limit OFFSET v_offset)
    SELECT (SELECT n FROM cnt),
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', id, 'name', name, 'training_date', training_date,
              'training_time', training_time, 'hours', hours
            ) ORDER BY training_date) FROM page), '[]'::jsonb)
      INTO v_total, v_items;

  ELSE
    WITH f AS (
      SELECT t.id, t.task_type, t.client, t.clientcode, t.name,
             t.start_date, t.end_date, t.next_action, t.next_action_date
      FROM public.tasks t
      WHERE t.created_by = p_user_id
        AND t.next_action_date IS NOT NULL
        AND COALESCE(t.status, 'pending') NOT IN ('closed', 'completed')
        AND (
          (p_bucket = 'overdue'  AND t.next_action_date <  v_today) OR
          (p_bucket = 'today'    AND t.next_action_date =  v_today) OR
          (p_bucket = 'upcoming' AND t.next_action_date >  v_today AND t.next_action_date <= v_today + 7)
        )
    ), cnt AS (SELECT count(*)::int n FROM f),
    page AS (SELECT * FROM f ORDER BY next_action_date, client LIMIT v_limit OFFSET v_offset)
    SELECT (SELECT n FROM cnt),
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', id, 'task_type', task_type, 'client', client, 'clientcode', clientcode,
              'title', name, 'start_date', start_date, 'end_date', end_date,
              'next_action', left(COALESCE(next_action,''),160),
              'next_action_date', next_action_date
            ) ORDER BY next_action_date) FROM page), '[]'::jsonb)
      INTO v_total, v_items;
  END IF;

  RETURN jsonb_build_object(
    'block', p_block, 'bucket', p_bucket, 'today', v_today,
    'limit', v_limit, 'offset', v_offset,
    'total_count', v_total, 'items', v_items
  );
END;
$function$;

-- =====================================================================
-- 6) RPCs PESSOAIS (assinaturas inalteradas — apenas delegam)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_my_day_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM public.my_day_context();
  RETURN public.my_day_summary_build(c.user_id, c.role);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_day_details(
  p_block text, p_bucket text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM public.my_day_context();
  RETURN public.my_day_details_build(c.user_id, p_block, p_bucket, p_limit, p_offset);
END;
$function$;

-- =====================================================================
-- 7) DETALHE DE COLABORADOR (somente sob demanda, escopo revalidado)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_my_day_user_summary(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM public.my_day_assert_target(p_user_id);
  RETURN public.my_day_summary_build(t.user_id, t.role);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_day_user_details(
  p_user_id uuid, p_block text, p_bucket text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t record;
BEGIN
  SELECT * INTO t FROM public.my_day_assert_target(p_user_id);
  RETURN public.my_day_details_build(t.user_id, p_block, p_bucket, p_limit, p_offset);
END;
$function$;

-- =====================================================================
-- 8) VISÃO DE EQUIPE — UMA ÚNICA CHAMADA AGREGADA
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_my_day_team_summary(
  p_filial_id uuid DEFAULT NULL,
  p_role      text DEFAULT NULL,
  p_user_id   uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  s            record;
  v_today      date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_week_start date;
  v_is_weekend boolean;
  v_filial     uuid;
  v_role       text := NULLIF(btrim(COALESCE(p_role, '')), '');
  v_rows       jsonb;
  v_kpi        jsonb;
BEGIN
  SELECT * INTO s FROM public.my_day_scope();

  IF s.scope = 'self' THEN
    RAISE EXCEPTION 'Acesso negado: sem permissão para visão de equipe' USING ERRCODE = '42501';
  END IF;

  -- Supervisor: filial forçada, qualquer parâmetro recebido é ignorado.
  v_filial := CASE WHEN s.scope = 'filial' THEN s.filial_id ELSE p_filial_id END;

  v_week_start := (v_today - (EXTRACT(ISODOW FROM v_today)::int - 1))::date;
  v_is_weekend := EXTRACT(ISODOW FROM v_today)::int >= 6;

  WITH membros AS (
    SELECT p.user_id, p.name, p.filial_id, fi.nome AS filial_nome,
           public.my_day_role_of(p.user_id) AS role
    FROM public.profiles p
    LEFT JOIN public.filiais fi ON fi.id = p.filial_id
    WHERE p.approval_status = 'approved'
      AND p.employment_status = 'active'
      AND (v_filial IS NULL OR p.filial_id = v_filial)
      AND (p_user_id IS NULL OR p.user_id = p_user_id)
      -- Supervisor nunca aparece na própria equipe
      AND p.user_id <> s.user_id
      -- Visão de equipe = supervisores + cargos operacionais; manager/admin nunca entram na tabela
      AND public.my_day_role_of(p.user_id) IN ('supervisor', 'sales_consultant', 'consultant',
                                               'technical_consultant', 'rac', 'cpa', 'csa')
  ), filtrados AS (
    SELECT * FROM membros WHERE v_role IS NULL OR role = v_role
  ), metas AS (
    SELECT f.*,
           gv.target_value  AS meta_visitas,
           gv.period_type   AS visitas_period,
           gv.weekdays_only AS visitas_weekdays_only,
           gl.target_value  AS meta_ligacoes,
           gl.weekdays_only AS ligacoes_weekdays_only
    FROM filtrados f
    LEFT JOIN public.activity_goal_settings gv
           ON gv.active AND gv.activity_type = 'visita'  AND gv.role::text = f.role
    LEFT JOIN public.activity_goal_settings gl
           ON gl.active AND gl.activity_type = 'ligacao' AND gl.role::text = f.role
  ), agg AS (
    SELECT m.user_id, m.name, m.role, m.filial_id, m.filial_nome,
           CASE WHEN m.meta_visitas IS NULL THEN NULL
                WHEN m.visitas_weekdays_only AND v_is_weekend THEN 0
                ELSE m.meta_visitas END AS meta_visitas,
           CASE WHEN m.meta_ligacoes IS NULL THEN NULL
                WHEN m.ligacoes_weekdays_only AND v_is_weekend THEN 0
                ELSE m.meta_ligacoes END AS meta_ligacoes,
           (SELECT count(*)::int FROM public.tasks t
             WHERE t.created_by = m.user_id
               AND t.task_type IN ('visita', 'technical_visit')
               AND t.start_date >= CASE WHEN m.visitas_period = 'weekly' THEN v_week_start ELSE v_today END
               AND t.start_date <= v_today) AS visitas_realizado,
           (SELECT count(*)::int FROM public.tasks t
             WHERE t.created_by = m.user_id
               AND t.task_type IN ('ligacao', 'prospection')
               AND t.start_date = v_today) AS ligacoes_realizado,
           (SELECT count(*)::int FROM public.visit_schedules vs
             WHERE vs.seller_id = m.user_id
               AND vs.status = 'planejado'
               AND vs.planned_date < v_today) AS visitas_atrasadas,
           (SELECT count(*)::int FROM public.task_followups f2
             WHERE f2.responsible_user_id = m.user_id
               AND f2.followup_status = 'pendente'
               AND f2.next_return_date IS NOT NULL
               AND f2.next_return_date < v_today) AS retornos_atrasados,
           (SELECT count(*)::int FROM public.trainings tr
             WHERE tr.user_id = m.user_id
               AND tr.status = 'pendente'
               AND tr.training_date <= v_today) AS treinamentos_pendentes,
           (SELECT count(*)::int FROM public.tasks t
             WHERE t.created_by = m.user_id
               AND t.next_action_date IS NOT NULL
               AND COALESCE(t.status, 'pending') NOT IN ('closed', 'completed')
               AND t.next_action_date < v_today) AS acoes_atrasadas
    FROM metas m
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', user_id, 'name', name, 'role', role,
      'filial_id', filial_id, 'filial_nome', filial_nome,
      'visitas_realizado', visitas_realizado, 'visitas_meta', meta_visitas,
      'ligacoes_realizado', ligacoes_realizado, 'ligacoes_meta', meta_ligacoes,
      'visitas_atrasadas', visitas_atrasadas,
      'retornos_atrasados', retornos_atrasados,
      'treinamentos_pendentes', treinamentos_pendentes,
      'acoes_atrasadas', acoes_atrasadas,
      'total_pendencias', visitas_atrasadas + retornos_atrasados + treinamentos_pendentes + acoes_atrasadas,
      'meta_atingida', CASE
        WHEN meta_visitas IS NULL AND meta_ligacoes IS NULL THEN NULL
        ELSE COALESCE(visitas_realizado >= meta_visitas, true)
         AND COALESCE(ligacoes_realizado >= meta_ligacoes, true) END
    ) ORDER BY name), '[]'::jsonb),
    jsonb_build_object(
      'colaboradores', count(*),
      'com_pendencias', count(*) FILTER (
        WHERE visitas_atrasadas + retornos_atrasados + treinamentos_pendentes + acoes_atrasadas > 0),
      'meta_nao_atingida', count(*) FILTER (
        WHERE (meta_visitas  IS NOT NULL AND visitas_realizado  < meta_visitas)
           OR (meta_ligacoes IS NOT NULL AND ligacoes_realizado < meta_ligacoes)),
      'visitas_atrasadas',      COALESCE(sum(visitas_atrasadas), 0),
      'retornos_atrasados',     COALESCE(sum(retornos_atrasados), 0),
      'treinamentos_pendentes', COALESCE(sum(treinamentos_pendentes), 0),
      'acoes_atrasadas',        COALESCE(sum(acoes_atrasadas), 0)
    )
  INTO v_rows, v_kpi
  FROM agg;

  RETURN jsonb_build_object(
    'scope', s.scope,
    'viewer', jsonb_build_object('user_id', s.user_id, 'role', s.role, 'filial_id', s.filial_id),
    'today', v_today, 'week_start', v_week_start, 'is_weekend', v_is_weekend,
    'filters', jsonb_build_object('filial_id', v_filial, 'role', v_role, 'user_id', p_user_id),
    'kpis', v_kpi,
    'rows', v_rows
  );
END;
$function$;

-- =====================================================================
-- 9) GRANTS DE EXECUÇÃO (apenas usuários autenticados)
-- =====================================================================
REVOKE ALL ON FUNCTION public.my_day_summary_build(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_day_details_build(uuid, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_day_role_of(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_day_assert_target(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.my_day_scope() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_day_user_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_day_user_details(uuid, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_day_team_summary(uuid, text, uuid) TO authenticated;
```

Observação de segurança: os builders (`my_day_summary_build`, `my_day_details_build`, `my_day_role_of`, `my_day_assert_target`) não recebem `GRANT` para `authenticated` — só são alcançáveis pelas RPCs públicas, que sempre validam o escopo antes.

---

## 10) Rota "/" → "/meu-dia" (não há SQL envolvido)

O roteamento é 100% frontend (React Router); nenhuma função de banco participa. O gate de autenticado/aprovado/ativo já existe no `AuthProvider`/`Layout` e continua igual. A mudança é substituir todo o corpo de `MyDayLanding` por um redirecionamento incondicional:

```tsx
// src/components/myday/MyDayLanding.tsx
import React from 'react';
import { Navigate } from 'react-router-dom';

/** Rota "/" — todos os cargos vão para /meu-dia. Sem regra de primeiro acesso. */
export const MyDayLanding: React.FC = () => <Navigate to="/meu-dia" replace />;
```

`shouldLandOnMyDay` deixa de ser usado e é removido de `src/lib/myDay.ts`. Navegação manual para qualquer outra rota continua normal (nenhum redirect global).

## Frontend a alterar

| Arquivo | Mudança |
| --- | --- |
| `src/components/myday/MyDayLanding.tsx` | `/` sempre redireciona para `/meu-dia`; remove `landingRedirectDone` e `shouldLandOnMyDay` |
| `src/lib/myDay.ts` | tipos `MyDayTeamSummary`, `MyDayTeamRow`, `MyDayScope` + helper `canSeeTeam(role)` |
| `src/hooks/useMyDay.ts` | `useMyDayTeamSummary(filters)` (1 chamada) e `useMyDayUserSummary(userId, enabled)` / `useMyDayUserDetails(...)` sob demanda |
| `src/pages/MyDay.tsx` | abas "Minha visão" / "Minha equipe" (aba de equipe só para supervisor/manager/admin) |
| `src/components/myday/TeamOverview.tsx` (novo) | 6 KPIs no topo + tabela por colaborador (cards no mobile), linha clicável |
| `src/components/myday/TeamFilters.tsx` (novo) | filtros filial/cargo/colaborador; supervisor sem seletor de filial; "Todos" → `NULL`; opções de cargo limitadas a supervisor + cargos operacionais (manager/admin não são selecionáveis) |
| `src/components/myday/UserDayDialog.tsx` (novo) | Meu Dia do colaborador em modo somente leitura (reutiliza `ExecutionCards` e `PendingBlock`, sem navegação de edição) |

Nenhuma alteração em RLS, dados, ou nas regras do Meu Dia pessoal.

## Performance

- Meu Dia pessoal: 1 chamada, comportamento e custo atuais (~0,5 ms).
- Visão de equipe: 1 chamada agregada; contagens por colaborador resolvidas em subqueries no mesmo plano (nenhuma chamada por usuário). Reaproveita índices existentes em `tasks(created_by)`, `visit_schedules(seller_id)`, `task_followups(responsible_user_id)`, `trainings(user_id)`. Rodo `EXPLAIN ANALYZE` após aplicar e só proponho índice novo se houver evidência.
- Detalhe de colaborador: apenas ao clicar (`enabled` no React Query), `staleTime` 5 min, sem refetch em foco.

## Validação prevista após aplicar

1. Operacional chamando `get_my_day_team_summary()` → erro `42501`.
2. Operacional chamando `get_my_day_user_summary(<outro>)` → erro `42501`.
3. Supervisor passando `p_filial_id` de outra filial → resultado limitado à própria filial.
4. Supervisor chamando `get_my_day_user_summary(<outra filial>)` → erro `42501`.
5. Manager/Admin com filtros de filial, cargo e colaborador → contagens coerentes.
6. Colaborador inativo/pendente não aparece na equipe e permanece bloqueado.
7. Meu Dia pessoal idêntico ao baseline (208 próximas ações).
