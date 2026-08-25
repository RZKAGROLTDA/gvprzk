CREATE OR REPLACE FUNCTION public.my_day_context()
RETURNS TABLE (
  user_id     uuid,
  role        text,
  today       date,
  week_start  date,
  week_end    date,
  is_weekend  boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_today date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = v_uid
      AND p.approval_status = 'approved'
      AND p.employment_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não aprovado ou inativo' USING ERRCODE = '42501';
  END IF;

  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  RETURN QUERY
  SELECT
    v_uid,
    public.get_user_role(),
    v_today,
    (v_today - ((EXTRACT(ISODOW FROM v_today)::int - 1)))::date,
    (v_today - ((EXTRACT(ISODOW FROM v_today)::int - 1)) + 6)::date,
    EXTRACT(ISODOW FROM v_today)::int >= 6;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_day_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c              record;
  g_vis          record;
  g_lig          record;
  v_vis_done     integer := 0;
  v_lig_done     integer := 0;
  v_vis_target   integer;
  v_lig_target   integer;
  v_result       jsonb;
  v_sched        jsonb;
  v_ret          jsonb;
  v_trn          jsonb;
  v_tasks        jsonb;
BEGIN
  SELECT * INTO c FROM public.my_day_context();

  SELECT target_value, period_type, weekdays_only INTO g_vis
  FROM public.activity_goal_settings
  WHERE active AND activity_type = 'visita' AND role::text = c.role;

  SELECT target_value, period_type, weekdays_only INTO g_lig
  FROM public.activity_goal_settings
  WHERE active AND activity_type = 'ligacao' AND role::text = c.role;

  IF g_vis.period_type = 'weekly' THEN
    SELECT count(*)::int INTO v_vis_done
    FROM public.tasks t
    WHERE t.created_by = c.user_id
      AND t.task_type IN ('visita', 'technical_visit')
      AND t.start_date >= c.week_start
      AND t.start_date <= c.today;
  ELSE
    SELECT count(*)::int INTO v_vis_done
    FROM public.tasks t
    WHERE t.created_by = c.user_id
      AND t.task_type IN ('visita', 'technical_visit')
      AND t.start_date = c.today;
  END IF;

  SELECT count(*)::int INTO v_lig_done
  FROM public.tasks t
  WHERE t.created_by = c.user_id
    AND t.task_type IN ('ligacao', 'prospection')
    AND t.start_date = c.today;

  v_vis_target := CASE
    WHEN g_vis.target_value IS NULL THEN NULL
    WHEN g_vis.weekdays_only AND c.is_weekend THEN 0
    ELSE g_vis.target_value END;

  v_lig_target := CASE
    WHEN g_lig.target_value IS NULL THEN NULL
    WHEN g_lig.weekdays_only AND c.is_weekend THEN 0
    ELSE g_lig.target_value END;

  WITH s AS (
    SELECT vs.id, vs.planned_date, vs.client_name, vs.client_code, vs.observation,
           CASE
             WHEN vs.planned_date <  c.today THEN 'overdue'
             WHEN vs.planned_date =  c.today THEN 'today'
             ELSE 'upcoming'
           END AS bucket
    FROM public.visit_schedules vs
    WHERE vs.seller_id = c.user_id
      AND vs.status = 'planejado'
      AND vs.planned_date <= c.today + 7
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
           CASE
             WHEN f.next_return_date <  c.today THEN 'overdue'
             WHEN f.next_return_date =  c.today THEN 'today'
             ELSE 'upcoming'
           END AS bucket
    FROM public.task_followups f
    WHERE f.responsible_user_id = c.user_id
      AND f.followup_status = 'pendente'
      AND f.next_return_date IS NOT NULL
      AND f.next_return_date <= c.today + 7
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
           CASE
             WHEN tr.training_date <  c.today THEN 'overdue'
             WHEN tr.training_date =  c.today THEN 'today'
             ELSE 'upcoming'
           END AS bucket
    FROM public.trainings tr
    WHERE tr.user_id = c.user_id
      AND tr.status = 'pendente'
      AND tr.training_date <= c.today + 30
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
           CASE
             WHEN t.next_action_date <  c.today THEN 'overdue'
             WHEN t.next_action_date =  c.today THEN 'today'
             WHEN t.next_action_date <= c.today + 7 THEN 'upcoming'
             ELSE NULL
           END AS bucket
    FROM public.tasks t
    WHERE t.created_by = c.user_id
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

  v_result := jsonb_build_object(
    'user', jsonb_build_object(
      'user_id', c.user_id, 'role', c.role, 'today', c.today,
      'week_start', c.week_start, 'week_end', c.week_end, 'is_weekend', c.is_weekend
    ),
    'goals', jsonb_build_object(
      'visitas', jsonb_build_object(
        'meta', v_vis_target, 'realizado', v_vis_done,
        'faltam',  CASE WHEN v_vis_target IS NULL THEN NULL ELSE GREATEST(v_vis_target - v_vis_done, 0) END,
        'atingida', CASE WHEN v_vis_target IS NULL THEN NULL ELSE (v_vis_done >= v_vis_target) END,
        'period_type', g_vis.period_type, 'weekdays_only', g_vis.weekdays_only,
        'sem_meta_hoje', COALESCE(g_vis.weekdays_only AND c.is_weekend, false)
      ),
      'ligacoes', jsonb_build_object(
        'meta', v_lig_target, 'realizado', v_lig_done,
        'faltam',  CASE WHEN v_lig_target IS NULL THEN NULL ELSE GREATEST(v_lig_target - v_lig_done, 0) END,
        'atingida', CASE WHEN v_lig_target IS NULL THEN NULL ELSE (v_lig_done >= v_lig_target) END,
        'period_type', g_lig.period_type, 'weekdays_only', g_lig.weekdays_only,
        'sem_meta_hoje', COALESCE(g_lig.weekdays_only AND c.is_weekend, false)
      )
    ),
    'visit_schedules', v_sched,
    'returns',         v_ret,
    'trainings',       v_trn,
    'open_tasks',      v_tasks
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_day_details(
  p_block  text,
  p_bucket text,
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c        record;
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

  SELECT * INTO c FROM public.my_day_context();

  IF p_block = 'visit_schedules' THEN
    WITH s AS (
      SELECT vs.id, vs.planned_date, vs.client_name, vs.client_code, vs.observation
      FROM public.visit_schedules vs
      WHERE vs.seller_id = c.user_id
        AND vs.status = 'planejado'
        AND (
          (p_bucket = 'overdue'  AND vs.planned_date <  c.today) OR
          (p_bucket = 'today'    AND vs.planned_date =  c.today) OR
          (p_bucket = 'upcoming' AND vs.planned_date >  c.today AND vs.planned_date <= c.today + 7)
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
      WHERE f.responsible_user_id = c.user_id
        AND f.followup_status = 'pendente'
        AND f.next_return_date IS NOT NULL
        AND (
          (p_bucket = 'overdue'  AND f.next_return_date <  c.today) OR
          (p_bucket = 'today'    AND f.next_return_date =  c.today) OR
          (p_bucket = 'upcoming' AND f.next_return_date >  c.today AND f.next_return_date <= c.today + 7)
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
      WHERE tr.user_id = c.user_id
        AND tr.status = 'pendente'
        AND (
          (p_bucket = 'overdue'  AND tr.training_date <  c.today) OR
          (p_bucket = 'today'    AND tr.training_date =  c.today) OR
          (p_bucket = 'upcoming' AND tr.training_date >  c.today AND tr.training_date <= c.today + 30)
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
      WHERE t.created_by = c.user_id
        AND t.next_action_date IS NOT NULL
        AND COALESCE(t.status, 'pending') NOT IN ('closed', 'completed')
        AND (
          (p_bucket = 'overdue'  AND t.next_action_date <  c.today) OR
          (p_bucket = 'today'    AND t.next_action_date =  c.today) OR
          (p_bucket = 'upcoming' AND t.next_action_date >  c.today AND t.next_action_date <= c.today + 7)
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
    'block', p_block, 'bucket', p_bucket, 'today', c.today,
    'limit', v_limit, 'offset', v_offset,
    'total_count', v_total, 'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.my_day_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_day_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_day_details(text, text, integer, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.my_day_context() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_day_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_day_details(text, text, integer, integer) TO authenticated, service_role;