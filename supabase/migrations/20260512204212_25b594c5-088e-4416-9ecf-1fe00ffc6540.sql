-- =========================================================================
-- Phase 1 — Unified Analytics RPCs v2
-- Source of truth for operational counts: task_followups
-- Source for financial values: tasks + opportunities (joined via task_id)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) get_activity_metrics_v2 — global metrics for a filter slice
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_activity_metrics_v2(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL,
  p_responsible_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_manager boolean := has_role(v_uid, 'manager'::app_role) OR has_role(v_uid, 'admin'::app_role);
  v_is_supervisor boolean := has_role(v_uid, 'supervisor'::app_role);
  v_supervisor_filial uuid := CASE WHEN v_is_supervisor THEN get_supervisor_filial_id(v_uid) ELSE NULL END;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  WITH scoped_followups AS (
    SELECT
      tf.id,
      tf.task_id,
      tf.activity_type,
      tf.activity_date,
      tf.filial_id,
      tf.responsible_user_id,
      tf.followup_status,
      COALESCE(NULLIF(tf.client_code, ''), LOWER(TRIM(tf.client_name))) AS client_key
    FROM public.task_followups tf
    WHERE
      (p_start_date IS NULL OR tf.activity_date::date >= p_start_date)
      AND (p_end_date IS NULL OR tf.activity_date::date <= p_end_date)
      AND (p_filial_id IS NULL OR tf.filial_id = p_filial_id)
      AND (p_responsible_user_id IS NULL OR tf.responsible_user_id = p_responsible_user_id)
      AND (
        v_is_manager
        OR tf.responsible_user_id = v_uid
        OR (v_is_supervisor AND tf.filial_id = v_supervisor_filial)
      )
  ),
  task_finances AS (
    SELECT
      t.id AS task_id,
      t.sales_value,
      t.partial_sales_value,
      t.sales_type,
      t.sales_confirmed,
      t.is_prospect
    FROM public.tasks t
    WHERE t.id IN (SELECT DISTINCT task_id FROM scoped_followups WHERE task_id IS NOT NULL)
  )
  SELECT jsonb_build_object(
    'total_activities', (SELECT COUNT(*) FROM scoped_followups),
    'visitas',          (SELECT COUNT(*) FROM scoped_followups WHERE activity_type::text = 'visita'),
    'ligacoes',         (SELECT COUNT(*) FROM scoped_followups WHERE activity_type::text = 'ligacao'),
    'checklists',       (SELECT COUNT(*) FROM scoped_followups WHERE activity_type::text = 'checklist'),
    'prospections',     (SELECT COUNT(*) FROM scoped_followups WHERE activity_type::text = 'prospection'),
    'unique_clients',   (SELECT COUNT(DISTINCT client_key) FROM scoped_followups WHERE client_key IS NOT NULL AND client_key <> ''),
    'concluidos',       (SELECT COUNT(*) FROM scoped_followups WHERE followup_status::text = 'concluido'),
    'pendentes',        (SELECT COUNT(*) FROM scoped_followups WHERE followup_status::text = 'pendente'),
    'sales_total_count',   (SELECT COUNT(*) FROM task_finances WHERE sales_confirmed = true AND sales_type = 'ganho'),
    'sales_total_value',   (SELECT COALESCE(SUM(sales_value), 0) FROM task_finances WHERE sales_confirmed = true AND sales_type = 'ganho'),
    'sales_partial_count', (SELECT COUNT(*) FROM task_finances WHERE sales_confirmed = true AND sales_type = 'parcial'),
    'sales_partial_value', (SELECT COALESCE(SUM(partial_sales_value), 0) FROM task_finances WHERE sales_confirmed = true AND sales_type = 'parcial'),
    'sales_lost_count',    (SELECT COUNT(*) FROM task_finances WHERE sales_type = 'perdido'),
    'sales_lost_value',    (SELECT COALESCE(SUM(sales_value), 0) FROM task_finances WHERE sales_type = 'perdido'),
    'prospect_open_count', (SELECT COUNT(*) FROM task_finances WHERE is_prospect = true AND (sales_confirmed IS NULL OR sales_confirmed = false)),
    'prospect_open_value', (SELECT COALESCE(SUM(sales_value), 0) FROM task_finances WHERE is_prospect = true AND (sales_confirmed IS NULL OR sales_confirmed = false))
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- -------------------------------------------------------------------------
-- 2) get_performance_by_filial_v2
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_performance_by_filial_v2(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_responsible_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  filial_id uuid,
  filial_nome text,
  total_activities bigint,
  visitas bigint,
  ligacoes bigint,
  checklists bigint,
  prospections bigint,
  unique_clients bigint,
  sales_total_count bigint,
  sales_total_value numeric,
  sales_partial_count bigint,
  sales_partial_value numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_manager boolean := has_role(v_uid, 'manager'::app_role) OR has_role(v_uid, 'admin'::app_role);
  v_is_supervisor boolean := has_role(v_uid, 'supervisor'::app_role);
  v_supervisor_filial uuid := CASE WHEN v_is_supervisor THEN get_supervisor_filial_id(v_uid) ELSE NULL END;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT
      tf.id,
      tf.task_id,
      tf.filial_id,
      tf.activity_type,
      COALESCE(NULLIF(tf.client_code, ''), LOWER(TRIM(tf.client_name))) AS client_key
    FROM public.task_followups tf
    WHERE
      (p_start_date IS NULL OR tf.activity_date::date >= p_start_date)
      AND (p_end_date IS NULL OR tf.activity_date::date <= p_end_date)
      AND (p_responsible_user_id IS NULL OR tf.responsible_user_id = p_responsible_user_id)
      AND (
        v_is_manager
        OR tf.responsible_user_id = v_uid
        OR (v_is_supervisor AND tf.filial_id = v_supervisor_filial)
      )
  ),
  finance AS (
    SELECT
      tf.filial_id,
      t.sales_value,
      t.partial_sales_value,
      t.sales_type,
      t.sales_confirmed
    FROM scoped tf
    JOIN public.tasks t ON t.id = tf.task_id
  )
  SELECT
    s.filial_id,
    f.nome AS filial_nome,
    COUNT(*)::bigint AS total_activities,
    COUNT(*) FILTER (WHERE s.activity_type::text = 'visita')::bigint AS visitas,
    COUNT(*) FILTER (WHERE s.activity_type::text = 'ligacao')::bigint AS ligacoes,
    COUNT(*) FILTER (WHERE s.activity_type::text = 'checklist')::bigint AS checklists,
    COUNT(*) FILTER (WHERE s.activity_type::text = 'prospection')::bigint AS prospections,
    COUNT(DISTINCT s.client_key) FILTER (WHERE s.client_key IS NOT NULL AND s.client_key <> '')::bigint AS unique_clients,
    (SELECT COUNT(*) FROM finance fi WHERE fi.filial_id = s.filial_id AND fi.sales_confirmed = true AND fi.sales_type = 'ganho')::bigint AS sales_total_count,
    (SELECT COALESCE(SUM(fi.sales_value), 0) FROM finance fi WHERE fi.filial_id = s.filial_id AND fi.sales_confirmed = true AND fi.sales_type = 'ganho')::numeric AS sales_total_value,
    (SELECT COUNT(*) FROM finance fi WHERE fi.filial_id = s.filial_id AND fi.sales_confirmed = true AND fi.sales_type = 'parcial')::bigint AS sales_partial_count,
    (SELECT COALESCE(SUM(fi.partial_sales_value), 0) FROM finance fi WHERE fi.filial_id = s.filial_id AND fi.sales_confirmed = true AND fi.sales_type = 'parcial')::numeric AS sales_partial_value
  FROM scoped s
  LEFT JOIN public.filiais f ON f.id = s.filial_id
  GROUP BY s.filial_id, f.nome
  ORDER BY total_activities DESC;
END;
$$;

-- -------------------------------------------------------------------------
-- 3) get_performance_by_seller_v2
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_performance_by_seller_v2(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL
)
RETURNS TABLE (
  responsible_user_id uuid,
  responsible_name text,
  filial_id uuid,
  filial_nome text,
  total_activities bigint,
  visitas bigint,
  ligacoes bigint,
  checklists bigint,
  prospections bigint,
  unique_clients bigint,
  sales_total_count bigint,
  sales_total_value numeric,
  sales_partial_count bigint,
  sales_partial_value numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_manager boolean := has_role(v_uid, 'manager'::app_role) OR has_role(v_uid, 'admin'::app_role);
  v_is_supervisor boolean := has_role(v_uid, 'supervisor'::app_role);
  v_supervisor_filial uuid := CASE WHEN v_is_supervisor THEN get_supervisor_filial_id(v_uid) ELSE NULL END;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT
      tf.id,
      tf.task_id,
      tf.responsible_user_id,
      tf.filial_id,
      tf.activity_type,
      COALESCE(NULLIF(tf.client_code, ''), LOWER(TRIM(tf.client_name))) AS client_key
    FROM public.task_followups tf
    WHERE
      (p_start_date IS NULL OR tf.activity_date::date >= p_start_date)
      AND (p_end_date IS NULL OR tf.activity_date::date <= p_end_date)
      AND (p_filial_id IS NULL OR tf.filial_id = p_filial_id)
      AND (
        v_is_manager
        OR tf.responsible_user_id = v_uid
        OR (v_is_supervisor AND tf.filial_id = v_supervisor_filial)
      )
  ),
  finance AS (
    SELECT
      tf.responsible_user_id,
      t.sales_value,
      t.partial_sales_value,
      t.sales_type,
      t.sales_confirmed
    FROM scoped tf
    JOIN public.tasks t ON t.id = tf.task_id
  )
  SELECT
    s.responsible_user_id,
    p.name AS responsible_name,
    s.filial_id,
    f.nome AS filial_nome,
    COUNT(*)::bigint AS total_activities,
    COUNT(*) FILTER (WHERE s.activity_type::text = 'visita')::bigint AS visitas,
    COUNT(*) FILTER (WHERE s.activity_type::text = 'ligacao')::bigint AS ligacoes,
    COUNT(*) FILTER (WHERE s.activity_type::text = 'checklist')::bigint AS checklists,
    COUNT(*) FILTER (WHERE s.activity_type::text = 'prospection')::bigint AS prospections,
    COUNT(DISTINCT s.client_key) FILTER (WHERE s.client_key IS NOT NULL AND s.client_key <> '')::bigint AS unique_clients,
    (SELECT COUNT(*) FROM finance fi WHERE fi.responsible_user_id = s.responsible_user_id AND fi.sales_confirmed = true AND fi.sales_type = 'ganho')::bigint,
    (SELECT COALESCE(SUM(fi.sales_value), 0) FROM finance fi WHERE fi.responsible_user_id = s.responsible_user_id AND fi.sales_confirmed = true AND fi.sales_type = 'ganho')::numeric,
    (SELECT COUNT(*) FROM finance fi WHERE fi.responsible_user_id = s.responsible_user_id AND fi.sales_confirmed = true AND fi.sales_type = 'parcial')::bigint,
    (SELECT COALESCE(SUM(fi.partial_sales_value), 0) FROM finance fi WHERE fi.responsible_user_id = s.responsible_user_id AND fi.sales_confirmed = true AND fi.sales_type = 'parcial')::numeric
  FROM scoped s
  LEFT JOIN public.profiles p ON p.user_id = s.responsible_user_id
  LEFT JOIN public.filiais f ON f.id = s.filial_id
  GROUP BY s.responsible_user_id, p.name, s.filial_id, f.nome
  ORDER BY total_activities DESC;
END;
$$;

-- -------------------------------------------------------------------------
-- 4) get_consolidated_sales_counts_v2 — replaces legacy consolidated counts
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_consolidated_sales_counts_v2(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL,
  p_responsible_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_activity_metrics_v2(p_start_date, p_end_date, p_filial_id, p_responsible_user_id);
$$;

-- -------------------------------------------------------------------------
-- Grants
-- -------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_activity_metrics_v2(date, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_performance_by_filial_v2(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_performance_by_seller_v2(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_consolidated_sales_counts_v2(date, date, uuid, uuid) TO authenticated;