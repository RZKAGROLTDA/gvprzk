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
  filtered AS (
    SELECT * FROM scoped s
    WHERE s.client_key IS NOT NULL AND s.client_key <> ''
      AND (p_search IS NULL OR p_search = '' OR LOWER(s.client_name) LIKE '%' || LOWER(p_search) || '%')
  ),
  opp AS (
    SELECT f.client_key, MAX(o.data_criacao) AS last_opportunity_date
    FROM filtered f
    JOIN public.opportunities o ON o.task_id = f.task_id
    GROUP BY f.client_key
  ),
  latest AS (
    SELECT DISTINCT ON (f.client_key)
      f.client_key, f.client_name, f.client_code, f.filial_id, f.responsible_user_id
    FROM filtered f
    ORDER BY f.client_key, f.activity_date DESC NULLS LAST, f.task_id
  ),
  agg AS (
    SELECT
      f.client_key,
      MAX(f.activity_date) AS last_activity_date,
      MAX(CASE WHEN f.activity_type::text = 'visita' THEN f.activity_date END) AS last_visit_date,
      COUNT(*) AS total_activities
    FROM filtered f
    GROUP BY f.client_key
  ),
  final AS (
    SELECT
      a.client_key,
      l.client_name,
      l.client_code,
      l.filial_id,
      l.responsible_user_id,
      a.last_activity_date,
      a.last_visit_date,
      a.total_activities,
      op.last_opportunity_date
    FROM agg a
    JOIN latest l ON l.client_key = a.client_key
    LEFT JOIN opp op ON op.client_key = a.client_key
  )
  SELECT
    (SELECT COUNT(*) FROM final),
    COALESCE((
      SELECT jsonb_agg(row_to_json(r))
      FROM (
        SELECT * FROM final
        ORDER BY last_activity_date DESC NULLS LAST, client_key
        LIMIT p_limit OFFSET p_offset
      ) r
    ), '[]'::jsonb)
  INTO v_total, v_rows;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$function$;