CREATE OR REPLACE FUNCTION public.my_day_summary_build(p_user_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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
  g_vis        record;
  g_lig        record;
  v_vis_done   integer := 0;
  v_lig_done   integer := 0;
  v_vis_target integer;
  v_lig_target integer;
  v_vis_today  integer := 0;
  v_lig_today  integer := 0;
  v_vis_week   integer := 0;
  v_lig_week   integer := 0;
  v_vis_acc    integer;
  v_lig_acc    integer;
  v_vis_pend   integer;
  v_lig_pend   integer;
  v_vis_meta_hoje integer;
  v_lig_meta_hoje integer;
  v_sched      jsonb;
  v_ret        jsonb;
  v_trn        jsonb;
  v_tasks      jsonb;
BEGIN
  v_week_start := (v_today - (EXTRACT(ISODOW FROM v_today)::int - 1))::date;
  v_week_end   := (v_week_start + 6)::date;
  v_is_weekend := EXTRACT(ISODOW FROM v_today)::int >= 6;

  -- Janela de apuracao semanal, truncada pelo mes corrente (sem deficit entre meses)
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

  -- Realizado de HOJE
  SELECT count(*)::int INTO v_vis_today
  FROM public.tasks t
  WHERE t.created_by = p_user_id
    AND t.task_type IN ('visita', 'technical_visit')
    AND t.start_date = v_today;

  v_lig_today := v_lig_done;

  -- Realizado da SEMANA (janela truncada pelo mes)
  SELECT count(*)::int INTO v_vis_week
  FROM public.tasks t
  WHERE t.created_by = p_user_id
    AND t.task_type IN ('visita', 'technical_visit')
    AND t.start_date >= v_win_start
    AND t.start_date <= v_today;

  SELECT count(*)::int INTO v_lig_week
  FROM public.tasks t
  WHERE t.created_by = p_user_id
    AND t.task_type IN ('ligacao', 'prospection')
    AND t.start_date >= v_win_start
    AND t.start_date <= v_today;

  v_vis_target := CASE
    WHEN g_vis.target_value IS NULL THEN NULL
    WHEN g_vis.weekdays_only AND v_is_weekend THEN 0
    ELSE g_vis.target_value END;

  v_lig_target := CASE
    WHEN g_lig.target_value IS NULL THEN NULL
    WHEN g_lig.weekdays_only AND v_is_weekend THEN 0
    ELSE g_lig.target_value END;

  -- Meta de HOJE existe apenas para metas diarias
  v_vis_meta_hoje := CASE WHEN g_vis.period_type = 'daily' THEN v_vis_target ELSE NULL END;
  v_lig_meta_hoje := CASE WHEN g_lig.period_type = 'daily' THEN v_lig_target ELSE NULL END;

  -- Meta acumulada da semana ate hoje
  v_vis_acc := CASE
    WHEN g_vis.target_value IS NULL THEN NULL
    WHEN g_vis.period_type = 'weekly' THEN
      CASE WHEN COALESCE(CASE WHEN g_vis.weekdays_only THEN v_total_wd ELSE v_total_all END, 0) = 0 THEN 0
           ELSE CEIL(g_vis.target_value::numeric
                     * (CASE WHEN g_vis.weekdays_only THEN v_elapsed_wd ELSE v_elapsed_all END)
                     / (CASE WHEN g_vis.weekdays_only THEN v_total_wd ELSE v_total_all END))::int END
    ELSE g_vis.target_value * (CASE WHEN g_vis.weekdays_only THEN v_elapsed_wd ELSE v_elapsed_all END)
  END;

  v_lig_acc := CASE
    WHEN g_lig.target_value IS NULL THEN NULL
    WHEN g_lig.period_type = 'weekly' THEN
      CASE WHEN COALESCE(CASE WHEN g_lig.weekdays_only THEN v_total_wd ELSE v_total_all END, 0) = 0 THEN 0
           ELSE CEIL(g_lig.target_value::numeric
                     * (CASE WHEN g_lig.weekdays_only THEN v_elapsed_wd ELSE v_elapsed_all END)
                     / (CASE WHEN g_lig.weekdays_only THEN v_total_wd ELSE v_total_all END))::int END
    ELSE g_lig.target_value * (CASE WHEN g_lig.weekdays_only THEN v_elapsed_wd ELSE v_elapsed_all END)
  END;

  v_vis_pend := CASE WHEN v_vis_acc IS NULL THEN NULL ELSE GREATEST(v_vis_acc - v_vis_week, 0) END;
  v_lig_pend := CASE WHEN v_lig_acc IS NULL THEN NULL ELSE GREATEST(v_lig_acc - v_lig_week, 0) END;

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
    'week_window', jsonb_build_object(
      'start', v_win_start, 'end', v_win_end,
      'elapsed_days', v_elapsed_all, 'elapsed_weekdays', v_elapsed_wd,
      'total_days', v_total_all, 'total_weekdays', v_total_wd,
      'month_crossing', (v_win_start <> v_week_start OR v_win_end <> v_week_end)
    ),
    'goals', jsonb_build_object(
      'visitas', jsonb_build_object(
        'meta', v_vis_target, 'realizado', v_vis_done,
        'faltam',   CASE WHEN v_vis_target IS NULL THEN NULL ELSE GREATEST(v_vis_target - v_vis_done, 0) END,
        'atingida', CASE WHEN v_vis_target IS NULL THEN NULL ELSE (v_vis_done >= v_vis_target) END,
        'period_type', g_vis.period_type, 'weekdays_only', g_vis.weekdays_only,
        'sem_meta_hoje', COALESCE(g_vis.weekdays_only AND v_is_weekend, false),
        'realizado_hoje', v_vis_today,
        'meta_hoje', v_vis_meta_hoje,
        'realizado_semana', v_vis_week,
        'meta_acumulada_semana', v_vis_acc,
        'pendencia_semana', v_vis_pend
      ),
      'ligacoes', jsonb_build_object(
        'meta', v_lig_target, 'realizado', v_lig_done,
        'faltam',   CASE WHEN v_lig_target IS NULL THEN NULL ELSE GREATEST(v_lig_target - v_lig_done, 0) END,
        'atingida', CASE WHEN v_lig_target IS NULL THEN NULL ELSE (v_lig_done >= v_lig_target) END,
        'period_type', g_lig.period_type, 'weekdays_only', g_lig.weekdays_only,
        'sem_meta_hoje', COALESCE(g_lig.weekdays_only AND v_is_weekend, false),
        'realizado_hoje', v_lig_today,
        'meta_hoje', v_lig_meta_hoje,
        'realizado_semana', v_lig_week,
        'meta_acumulada_semana', v_lig_acc,
        'pendencia_semana', v_lig_pend
      )
    ),
    'visit_schedules', v_sched,
    'returns',         v_ret,
    'trainings',       v_trn,
    'open_tasks',      v_tasks
  );
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

  v_filial := CASE WHEN s.scope = 'filial' THEN s.filial_id ELSE p_filial_id END;

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