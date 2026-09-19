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

  IF p_filial_id IS NOT NULL THEN
    v_eff := public.effective_filial_ids(p_filial_id);
  END IF;

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

CREATE OR REPLACE FUNCTION public.get_my_day_team_summary(p_filial_id uuid DEFAULT NULL::uuid, p_role text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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

  v_filial := CASE
    WHEN s.scope = 'global' THEN p_filial_id
    ELSE (public.effective_filial_ids(p_filial_id))[1]
  END;

  v_week_start := (v_today - (EXTRACT(ISODOW FROM v_today)::int - 1))::date;
  v_week_end   := (v_week_start + 6)::date;
  v_is_weekend := EXTRACT(ISODOW FROM v_today)::int >= 6;

  v_month_start := date_trunc('month', v_today)::date;
  v_month_end   := (v_month_start + interval '1 month - 1 day')::date;
  v_win_start   := GREATEST(v_week_start, v_month_start);
  v_win_end     := LEAST(v_week_end, v_month_end);

  SELECT count(*) FILTER (WHERE EXTRACT(ISODOW FROM d)::int <= 5)::int, count(*)::int
    INTO v_elapsed_wd, v_elapsed_all
  FROM generate_series(v_win_start::timestamp, v_today::timestamp, interval '1 day') d;

  SELECT count(*) FILTER (WHERE EXTRACT(ISODOW FROM d)::int <= 5)::int, count(*)::int
    INTO v_total_wd, v_total_all
  FROM generate_series(v_win_start::timestamp, v_win_end::timestamp, interval '1 day') d;

  WITH membros AS (
    SELECT p.user_id, p.name, p.filial_id, fi.nome AS filial_nome,
           public.my_day_role_of(p.user_id) AS role
    FROM public.profiles p
    LEFT JOIN public.filiais fi ON fi.id = p.filial_id
    WHERE p.approval_status = 'approved'
      AND p.employment_status = 'active'
      AND (v_filial IS NULL OR p.filial_id = v_filial)
      AND (p_user_id IS NULL OR p.user_id = p_user_id)
      AND p.user_id <> s.user_id
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
           gl.period_type   AS ligacoes_period,
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
           CASE WHEN m.meta_visitas IS NULL OR m.visitas_period <> 'daily' THEN NULL
                WHEN m.visitas_weekdays_only AND v_is_weekend THEN 0
                ELSE m.meta_visitas END AS meta_visitas_hoje,
           CASE WHEN m.meta_ligacoes IS NULL OR m.ligacoes_period <> 'daily' THEN NULL
                WHEN m.ligacoes_weekdays_only AND v_is_weekend THEN 0
                ELSE m.meta_ligacoes END AS meta_ligacoes_hoje,
           CASE WHEN m.meta_visitas IS NULL THEN NULL
                WHEN m.visitas_period = 'weekly' THEN
                  CASE WHEN COALESCE(CASE WHEN m.visitas_weekdays_only THEN v_total_wd ELSE v_total_all END, 0) = 0 THEN 0
                       ELSE CEIL(m.meta_visitas::numeric
                                 * (CASE WHEN m.visitas_weekdays_only THEN v_elapsed_wd ELSE v_elapsed_all END)
                                 / (CASE WHEN m.visitas_weekdays_only THEN v_total_wd ELSE v_total_all END))::int END
                ELSE m.meta_visitas * (CASE WHEN m.visitas_weekdays_only THEN v_elapsed_wd ELSE v_elapsed_all END)
           END AS meta_visitas_semana,
           CASE WHEN m.meta_ligacoes IS NULL THEN NULL
                WHEN m.ligacoes_period = 'weekly' THEN
                  CASE WHEN COALESCE(CASE WHEN m.ligacoes_weekdays_only THEN v_total_wd ELSE v_total_all END, 0) = 0 THEN 0
                       ELSE CEIL(m.meta_ligacoes::numeric
                                 * (CASE WHEN m.ligacoes_weekdays_only THEN v_elapsed_wd ELSE v_elapsed_all END)
                                 / (CASE WHEN m.ligacoes_weekdays_only THEN v_total_wd ELSE v_total_all END))::int END
                ELSE m.meta_ligacoes * (CASE WHEN m.ligacoes_weekdays_only THEN v_elapsed_wd ELSE v_elapsed_all END)
           END AS meta_ligacoes_semana,
           (SELECT count(*)::int FROM public.tasks t
             WHERE t.created_by = m.user_id
               AND t.task_type IN ('visita', 'technical_visit')
               AND t.start_date >= CASE WHEN m.visitas_period = 'weekly' THEN v_week_start ELSE v_today END
               AND t.start_date <= v_today) AS visitas_realizado,
           (SELECT count(*)::int FROM public.tasks t
             WHERE t.created_by = m.user_id
               AND t.task_type IN ('ligacao', 'prospection')
               AND t.start_date = v_today) AS ligacoes_realizado,
           (SELECT count(*)::int FROM public.tasks t
             WHERE t.created_by = m.user_id
               AND t.task_type IN ('visita', 'technical_visit')
               AND t.start_date = v_today) AS visitas_hoje,
           (SELECT count(*)::int FROM public.tasks t
             WHERE t.created_by = m.user_id
               AND t.task_type IN ('ligacao', 'prospection')
               AND t.start_date = v_today) AS ligacoes_hoje,
           (SELECT count(*)::int FROM public.tasks t
             WHERE t.created_by = m.user_id
               AND t.task_type IN ('visita', 'technical_visit')
               AND t.start_date >= v_win_start
               AND t.start_date <= v_today) AS visitas_semana,
           (SELECT count(*)::int FROM public.tasks t
             WHERE t.created_by = m.user_id
               AND t.task_type IN ('ligacao', 'prospection')
               AND t.start_date >= v_win_start
               AND t.start_date <= v_today) AS ligacoes_semana,
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
      'visitas_hoje', visitas_hoje, 'visitas_meta_hoje', meta_visitas_hoje,
      'ligacoes_hoje', ligacoes_hoje, 'ligacoes_meta_hoje', meta_ligacoes_hoje,
      'visitas_semana', visitas_semana, 'visitas_meta_semana', meta_visitas_semana,
      'ligacoes_semana', ligacoes_semana, 'ligacoes_meta_semana', meta_ligacoes_semana,
      'visitas_pendencia_semana', CASE WHEN meta_visitas_semana IS NULL THEN NULL
                                       ELSE GREATEST(meta_visitas_semana - visitas_semana, 0) END,
      'ligacoes_pendencia_semana', CASE WHEN meta_ligacoes_semana IS NULL THEN NULL
                                        ELSE GREATEST(meta_ligacoes_semana - ligacoes_semana, 0) END,
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
      'acoes_atrasadas',        COALESCE(sum(acoes_atrasadas), 0),
      'visitas_pendencia_semana',  COALESCE(sum(GREATEST(COALESCE(meta_visitas_semana, 0) - visitas_semana, 0)), 0),
      'ligacoes_pendencia_semana', COALESCE(sum(GREATEST(COALESCE(meta_ligacoes_semana, 0) - ligacoes_semana, 0)), 0)
    )
  INTO v_rows, v_kpi
  FROM agg;

  RETURN jsonb_build_object(
    'scope', s.scope,
    'viewer', jsonb_build_object('user_id', s.user_id, 'role', s.role, 'filial_id', s.filial_id),
    'today', v_today, 'week_start', v_week_start, 'week_end', v_week_end, 'is_weekend', v_is_weekend,
    'week_window', jsonb_build_object('start', v_win_start, 'end', v_win_end,
      'elapsed_days', v_elapsed_all, 'elapsed_weekdays', v_elapsed_wd,
      'total_days', v_total_all, 'total_weekdays', v_total_wd),
    'filters', jsonb_build_object('filial_id', v_filial, 'role', v_role, 'user_id', p_user_id),
    'kpis', v_kpi,
    'rows', v_rows
  );
END;
$function$;

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