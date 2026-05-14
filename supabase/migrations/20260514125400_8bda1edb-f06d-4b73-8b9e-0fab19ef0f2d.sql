
-- =========================================================================
-- Fase 3 — RPCs analíticas v2 (operacional via task_followups,
-- financeiro/comercial via tasks/opportunities). Contrato único:
-- (p_start_date, p_end_date, p_filial_id, p_responsible_user_id)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) get_funnel_metrics_v2
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_funnel_metrics_v2(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL,
  p_responsible_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_manager boolean := has_role(v_uid, 'manager'::app_role) OR has_role(v_uid, 'admin'::app_role);
  v_is_supervisor boolean := has_role(v_uid, 'supervisor'::app_role);
  v_supervisor_filial uuid := CASE WHEN v_is_supervisor THEN get_supervisor_filial_id(v_uid) ELSE NULL END;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  WITH scoped_followups AS (
    SELECT tf.id, tf.task_id, tf.activity_type, tf.activity_date, tf.filial_id,
           tf.responsible_user_id, tf.followup_status,
           COALESCE(NULLIF(tf.client_code, ''), LOWER(TRIM(tf.client_name))) AS client_key
    FROM public.task_followups tf
    WHERE (p_start_date IS NULL OR tf.activity_date::date >= p_start_date)
      AND (p_end_date IS NULL OR tf.activity_date::date <= p_end_date)
      AND (p_filial_id IS NULL OR tf.filial_id = p_filial_id)
      AND (p_responsible_user_id IS NULL OR tf.responsible_user_id = p_responsible_user_id)
      AND (v_is_manager OR tf.responsible_user_id = v_uid OR (v_is_supervisor AND tf.filial_id = v_supervisor_filial))
  ),
  task_finances AS (
    SELECT t.id AS task_id, t.sales_value, t.partial_sales_value, t.sales_type,
           t.sales_confirmed, t.is_prospect
    FROM public.tasks t
    WHERE t.id IN (SELECT DISTINCT task_id FROM scoped_followups WHERE task_id IS NOT NULL)
  ),
  scoped_opps AS (
    SELECT o.id, o.status, o.valor_total_oportunidade, o.valor_venda_fechada
    FROM public.opportunities o
    WHERE o.task_id IN (SELECT DISTINCT task_id FROM scoped_followups WHERE task_id IS NOT NULL)
  )
  SELECT jsonb_build_object(
    'visitas',     (SELECT COUNT(*) FROM scoped_followups WHERE activity_type::text = 'visita'),
    'ligacoes',    (SELECT COUNT(*) FROM scoped_followups WHERE activity_type::text = 'ligacao'),
    'checklists',  (SELECT COUNT(*) FROM scoped_followups WHERE activity_type::text = 'checklist'),
    'prospections',(SELECT COUNT(*) FROM scoped_followups WHERE activity_type::text = 'prospection'),
    'total_activities', (SELECT COUNT(*) FROM scoped_followups),
    'unique_clients',   (SELECT COUNT(DISTINCT client_key) FROM scoped_followups WHERE client_key IS NOT NULL AND client_key <> ''),
    'sales_total_count',   (SELECT COUNT(*) FROM task_finances WHERE sales_confirmed = true AND sales_type = 'ganho'),
    'sales_total_value',   (SELECT COALESCE(SUM(sales_value), 0) FROM task_finances WHERE sales_confirmed = true AND sales_type = 'ganho'),
    'sales_partial_count', (SELECT COUNT(*) FROM task_finances WHERE sales_confirmed = true AND sales_type = 'parcial'),
    'sales_partial_value', (SELECT COALESCE(SUM(partial_sales_value), 0) FROM task_finances WHERE sales_confirmed = true AND sales_type = 'parcial'),
    'sales_lost_count',    (SELECT COUNT(*) FROM task_finances WHERE sales_type = 'perdido'),
    'sales_lost_value',    (SELECT COALESCE(SUM(sales_value), 0) FROM task_finances WHERE sales_type = 'perdido'),
    'prospect_open_count', (SELECT COUNT(*) FROM task_finances WHERE is_prospect = true AND (sales_confirmed IS NULL OR sales_confirmed = false)),
    'prospect_open_value', (SELECT COALESCE(SUM(sales_value), 0) FROM task_finances WHERE is_prospect = true AND (sales_confirmed IS NULL OR sales_confirmed = false)),
    'opp_pipeline', (
      SELECT COALESCE(jsonb_object_agg(status, payload), '{}'::jsonb)
      FROM (
        SELECT status, jsonb_build_object(
          'count', COUNT(*),
          'value_total', COALESCE(SUM(valor_total_oportunidade), 0),
          'value_closed', COALESCE(SUM(valor_venda_fechada), 0)
        ) AS payload
        FROM scoped_opps
        GROUP BY status
      ) s
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_funnel_metrics_v2(date, date, uuid, uuid) TO authenticated;

-- -------------------------------------------------------------------------
-- 2) get_clients_overview_v2
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_clients_overview_v2(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL,
  p_responsible_user_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_manager boolean := has_role(v_uid, 'manager'::app_role) OR has_role(v_uid, 'admin'::app_role);
  v_is_supervisor boolean := has_role(v_uid, 'supervisor'::app_role);
  v_supervisor_filial uuid := CASE WHEN v_is_supervisor THEN get_supervisor_filial_id(v_uid) ELSE NULL END;
  v_total integer;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  CREATE TEMP TABLE _scoped ON COMMIT DROP AS
  SELECT
    COALESCE(NULLIF(tf.client_code,''), LOWER(TRIM(tf.client_name))) AS client_key,
    tf.client_name, tf.client_code, tf.task_id, tf.filial_id,
    tf.responsible_user_id, tf.activity_type, tf.activity_date
  FROM public.task_followups tf
  WHERE (p_start_date IS NULL OR tf.activity_date::date >= p_start_date)
    AND (p_end_date IS NULL OR tf.activity_date::date <= p_end_date)
    AND (p_filial_id IS NULL OR tf.filial_id = p_filial_id)
    AND (p_responsible_user_id IS NULL OR tf.responsible_user_id = p_responsible_user_id)
    AND (v_is_manager OR tf.responsible_user_id = v_uid OR (v_is_supervisor AND tf.filial_id = v_supervisor_filial));

  WITH agg AS (
    SELECT
      s.client_key,
      MAX(s.client_name) AS client_name,
      MAX(s.client_code) AS client_code,
      MAX(s.filial_id)   AS filial_id,
      MAX(s.responsible_user_id) AS responsible_user_id,
      MAX(s.activity_date) AS last_activity_date,
      MAX(CASE WHEN s.activity_type::text = 'visita' THEN s.activity_date END) AS last_visit_date,
      COUNT(*) AS total_activities,
      (SELECT MAX(o.data_criacao)
         FROM public.opportunities o
         WHERE o.task_id IN (SELECT task_id FROM _scoped s2 WHERE s2.client_key = s.client_key)
      ) AS last_opportunity_date
    FROM _scoped s
    WHERE s.client_key IS NOT NULL AND s.client_key <> ''
      AND (p_search IS NULL OR p_search = '' OR LOWER(s.client_name) LIKE '%' || LOWER(p_search) || '%')
    GROUP BY s.client_key
  )
  SELECT COUNT(*), COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO v_total, v_rows
  FROM (
    SELECT * FROM agg
    ORDER BY last_activity_date DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset
  ) r;

  DROP TABLE _scoped;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clients_overview_v2(date, date, uuid, uuid, text, integer, integer) TO authenticated;

-- -------------------------------------------------------------------------
-- 3) get_tasks_metrics_v2
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tasks_metrics_v2(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL,
  p_responsible_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_manager boolean := has_role(v_uid, 'manager'::app_role) OR has_role(v_uid, 'admin'::app_role);
  v_is_supervisor boolean := has_role(v_uid, 'supervisor'::app_role);
  v_supervisor_filial uuid := CASE WHEN v_is_supervisor THEN get_supervisor_filial_id(v_uid) ELSE NULL END;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  WITH s AS (
    SELECT tf.id, tf.task_id, tf.activity_type::text AS atype, tf.followup_status::text AS astatus
    FROM public.task_followups tf
    WHERE (p_start_date IS NULL OR tf.activity_date::date >= p_start_date)
      AND (p_end_date IS NULL OR tf.activity_date::date <= p_end_date)
      AND (p_filial_id IS NULL OR tf.filial_id = p_filial_id)
      AND (p_responsible_user_id IS NULL OR tf.responsible_user_id = p_responsible_user_id)
      AND (v_is_manager OR tf.responsible_user_id = v_uid OR (v_is_supervisor AND tf.filial_id = v_supervisor_filial))
  )
  SELECT jsonb_build_object(
    'total',         (SELECT COUNT(*) FROM s),
    'unique_tasks',  (SELECT COUNT(DISTINCT task_id) FROM s WHERE task_id IS NOT NULL),
    'by_type', (
      SELECT COALESCE(jsonb_object_agg(atype, c), '{}'::jsonb)
      FROM (SELECT atype, COUNT(*) AS c FROM s GROUP BY atype) x
    ),
    'by_status', (
      SELECT COALESCE(jsonb_object_agg(astatus, c), '{}'::jsonb)
      FROM (SELECT astatus, COUNT(*) AS c FROM s GROUP BY astatus) x
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tasks_metrics_v2(date, date, uuid, uuid) TO authenticated;

-- -------------------------------------------------------------------------
-- 4) get_reports_dataset_v2
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_reports_dataset_v2(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL,
  p_responsible_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_manager boolean := has_role(v_uid, 'manager'::app_role) OR has_role(v_uid, 'admin'::app_role);
  v_is_supervisor boolean := has_role(v_uid, 'supervisor'::app_role);
  v_supervisor_filial uuid := CASE WHEN v_is_supervisor THEN get_supervisor_filial_id(v_uid) ELSE NULL END;
  v_total integer;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  WITH s AS (
    SELECT tf.id AS followup_id, tf.task_id, tf.activity_type::text AS activity_type,
           tf.activity_date, tf.followup_status::text AS followup_status,
           tf.client_name, tf.client_code, tf.filial_id, tf.responsible_user_id,
           tf.created_at AS followup_created_at,
           COALESCE(NULLIF(tf.client_code,''), LOWER(TRIM(tf.client_name))) AS client_key
    FROM public.task_followups tf
    WHERE (p_start_date IS NULL OR tf.activity_date::date >= p_start_date)
      AND (p_end_date IS NULL OR tf.activity_date::date <= p_end_date)
      AND (p_filial_id IS NULL OR tf.filial_id = p_filial_id)
      AND (p_responsible_user_id IS NULL OR tf.responsible_user_id = p_responsible_user_id)
      AND (v_is_manager OR tf.responsible_user_id = v_uid OR (v_is_supervisor AND tf.filial_id = v_supervisor_filial))
  ),
  base AS (
    SELECT s.*,
           t.created_at AS task_created_at,
           t.filial AS task_filial,
           t.filial_atendida AS task_filial_atendida,
           t.sales_type, t.sales_value, t.partial_sales_value, t.sales_confirmed, t.is_prospect,
           o.status AS opp_status,
           o.valor_total_oportunidade,
           o.valor_venda_fechada,
           o.data_fechamento AS sale_date,
           o.data_criacao AS opp_created_at
    FROM s
    LEFT JOIN public.tasks t ON t.id = s.task_id
    LEFT JOIN LATERAL (
      SELECT o.* FROM public.opportunities o
      WHERE o.task_id = s.task_id
      ORDER BY o.updated_at DESC LIMIT 1
    ) o ON true
  )
  SELECT COUNT(*) OVER () AS total, jsonb_agg(row_to_json(b))
  INTO v_total, v_rows
  FROM (
    SELECT * FROM base
    ORDER BY activity_date DESC
    LIMIT p_limit OFFSET p_offset
  ) b;

  RETURN jsonb_build_object('total', COALESCE(v_total, 0), 'rows', COALESCE(v_rows, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reports_dataset_v2(date, date, uuid, uuid, integer, integer) TO authenticated;
