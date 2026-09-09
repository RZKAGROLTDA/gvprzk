CREATE OR REPLACE FUNCTION public.get_clients_overview_v2(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_filial_id uuid DEFAULT NULL::uuid, p_responsible_user_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_manager boolean := has_role(v_uid, 'manager'::app_role) OR has_role(v_uid, 'admin'::app_role);
  v_is_supervisor boolean := has_role(v_uid, 'supervisor'::app_role);
  v_supervisor_filial uuid := CASE WHEN v_is_supervisor THEN get_supervisor_filial_id(v_uid) ELSE NULL END;
  v_total integer;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  WITH scoped AS (
    SELECT
      COALESCE(NULLIF(tf.client_code,''), LOWER(TRIM(tf.client_name))) AS client_key,
      tf.client_name, tf.client_code, tf.task_id, tf.filial_id,
      tf.responsible_user_id, tf.activity_type, tf.activity_date
    FROM public.task_followups tf
    WHERE (p_start_date IS NULL OR tf.activity_date::date >= p_start_date)
      AND (p_end_date IS NULL OR tf.activity_date::date <= p_end_date)
      AND (p_filial_id IS NULL OR tf.filial_id = p_filial_id)
      AND (p_responsible_user_id IS NULL OR tf.responsible_user_id = p_responsible_user_id)
      AND (v_is_manager OR tf.responsible_user_id = v_uid OR (v_is_supervisor AND tf.filial_id = v_supervisor_filial))
  ),
  opp AS (
    SELECT s.client_key, MAX(o.data_criacao) AS last_opportunity_date
    FROM scoped s
    JOIN public.opportunities o ON o.task_id = s.task_id
    GROUP BY s.client_key
  ),
  agg AS (
    SELECT
      s.client_key,
      MAX(s.client_name) AS client_name,
      MAX(s.client_code) AS client_code,
      MAX(s.filial_id)   AS filial_id,
      MAX(s.responsible_user_id) AS responsible_user_id,
      MAX(s.activity_date) AS last_activity_date,
      MAX(CASE WHEN s.activity_type::text = 'visita' THEN s.activity_date END) AS last_visit_date,
      COUNT(*) AS total_activities,
      MAX(op.last_opportunity_date) AS last_opportunity_date
    FROM scoped s
    LEFT JOIN opp op ON op.client_key = s.client_key
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

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$function$;