CREATE OR REPLACE FUNCTION public.client_filter_match(p_client_code text, p_client_name text, v_code text, v_name text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN NULLIF(btrim(COALESCE(p_client_code,'')),'') IS NULL AND NULLIF(btrim(COALESCE(p_client_name,'')),'') IS NULL THEN true
    ELSE (NULLIF(btrim(COALESCE(p_client_code,'')),'') IS NOT NULL AND lower(btrim(COALESCE(v_code,''))) = lower(btrim(p_client_code)))
      OR (NULLIF(btrim(COALESCE(p_client_code,'')),'') IS NULL AND NULLIF(btrim(COALESCE(p_client_name,'')),'') IS NOT NULL
          AND lower(btrim(COALESCE(v_name,''))) = lower(btrim(p_client_name)))
      OR (NULLIF(btrim(COALESCE(p_client_code,'')),'') IS NOT NULL AND NULLIF(btrim(COALESCE(v_code,'')),'') IS NULL
          AND NULLIF(btrim(COALESCE(p_client_name,'')),'') IS NOT NULL AND lower(btrim(COALESCE(v_name,''))) = lower(btrim(p_client_name)))
  END
$$;
GRANT EXECUTE ON FUNCTION public.client_filter_match(text,text,text,text) TO authenticated, service_role;

DO $cf$
DECLARE
  r record; v_def text; v_new text;
  v_tf text := ' AND public.client_filter_match(p_client_code, p_client_name, tf.client_code, tf.client_name)';
  v_t  text := ' AND public.client_filter_match(p_client_code, p_client_name, t.clientcode, t.client)';
  v_f  text := ' AND public.client_filter_match(p_client_code, p_client_name, f.client_code, f.client_name)';
  v_sig text; v_cnt int; v_add text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('get_activity_metrics_v2', 'AND (v_target IS NULL OR public.resolve_primary_user_id(tf.responsible_user_id) = v_target)', 'tf', 1),
    ('get_funnel_metrics_v2', 'AND (p_responsible_user_id IS NULL OR tf.responsible_user_id = p_responsible_user_id)', 'tf', 1),
    ('get_reports_dataset_v2', 'AND (p_responsible_user_id IS NULL OR tf.responsible_user_id = p_responsible_user_id)', 'tf', 1),
    ('get_weekly_followups_agenda', 'AND (p_responsible_user_id IS NULL OR f.responsible_user_id = p_responsible_user_id)', 'f', 1),
    ('get_management_seller_summary', 'AND (p_task_types IS NULL OR tf.activity_type::text = ANY(p_task_types))', 'tf', 1),
    ('get_management_seller_summary', 't.start_date <= p_end_date)', 't', 1),
    ('get_management_client_details', 'AND (p_task_types IS NULL OR tf.activity_type::text = ANY(p_task_types))', 'tf', 1),
    ('get_management_client_details', 't.start_date <= p_end_date)', 't', 1),
    ('get_management_product_analysis', 't.start_date <= p_end_date)', 't', 3)
  ) AS x(fn, anchor, kind, expected)
  LOOP
    SELECT p.oid::regprocedure::text, pg_get_functiondef(p.oid) INTO v_sig, v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF v_def IS NULL THEN RAISE EXCEPTION 'CF: funcao % nao encontrada', r.fn; END IF;
    v_add := CASE r.kind WHEN 'tf' THEN v_tf WHEN 't' THEN v_t ELSE v_f END;
    v_cnt := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    IF v_cnt <> r.expected THEN
      RAISE EXCEPTION 'CF: ancora em % encontrada % vezes (esperado %)', r.fn, v_cnt, r.expected;
    END IF;
    v_new := replace(v_def, r.anchor, r.anchor || v_add);
    IF position('p_client_code' in split_part(v_new, 'RETURNS', 1)) = 0 THEN
      v_new := regexp_replace(v_new, '\)\s*\n\s*RETURNS',
        ', p_client_code text DEFAULT NULL::text, p_client_name text DEFAULT NULL::text)' || E'\n RETURNS');
    END IF;
    EXECUTE 'DROP FUNCTION ' || v_sig;
    EXECUTE v_new;
  END LOOP;
END
$cf$;

GRANT EXECUTE ON FUNCTION public.get_activity_metrics_v2(date,date,uuid,uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_funnel_metrics_v2(date,date,uuid,uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_reports_dataset_v2(date,date,uuid,uuid,integer,integer,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_management_seller_summary(date,date,uuid,text,uuid,text[],text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_management_client_details(date,date,uuid,text,uuid,text[],text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_management_product_analysis(date,date,uuid,text[],text,text,text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_weekly_followups_agenda(date,date,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_weekly_followups_agenda(date,date,uuid,uuid,text,text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_scoped_clients(p_query text, p_filial_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 15)
RETURNS TABLE(client_code text, client_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_manager boolean := has_role(v_uid, 'manager'::app_role) OR has_role(v_uid, 'admin'::app_role);
  v_is_supervisor boolean := has_role(v_uid, 'supervisor'::app_role);
  v_filiais uuid[];
  v_q text := btrim(COALESCE(p_query, ''));
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 15), 15));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF length(v_q) < 2 THEN RETURN; END IF;
  v_filiais := public.effective_filial_ids(p_filial_id);

  RETURN QUERY
  WITH src AS (
    SELECT NULLIF(btrim(tf.client_code), '') AS code, btrim(tf.client_name) AS name, tf.activity_date AS dt
    FROM public.task_followups tf
    WHERE (cardinality(v_filiais) = 0 OR tf.filial_id = ANY(v_filiais))
      AND (v_is_manager OR tf.responsible_user_id = v_uid OR (v_is_supervisor AND tf.filial_id = ANY(v_filiais)))
      AND (tf.client_name ILIKE '%' || v_q || '%' OR tf.client_code ILIKE '%' || v_q || '%')
    UNION ALL
    SELECT NULLIF(btrim(vs.client_code), ''), btrim(vs.client_name), vs.planned_date::timestamptz
    FROM public.visit_schedules vs
    WHERE (cardinality(v_filiais) = 0 OR vs.filial_id = ANY(v_filiais))
      AND (v_is_manager OR vs.seller_id = v_uid OR (v_is_supervisor AND vs.filial_id = ANY(v_filiais)))
      AND (vs.client_name ILIKE '%' || v_q || '%' OR vs.client_code ILIKE '%' || v_q || '%')
  ),
  d AS (
    SELECT DISTINCT ON (COALESCE(lower(code), lower(name))) code, name,
           (lower(COALESCE(code,'')) = lower(v_q)) AS exact
    FROM src WHERE name IS NOT NULL AND name <> ''
    ORDER BY COALESCE(lower(code), lower(name)), dt DESC
  )
  SELECT d.code, d.name FROM d ORDER BY d.exact DESC, d.name LIMIT v_limit;
END
$$;
REVOKE EXECUTE ON FUNCTION public.search_scoped_clients(text,uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_scoped_clients(text,uuid,integer) TO authenticated, service_role;