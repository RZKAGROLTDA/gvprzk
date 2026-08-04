CREATE OR REPLACE FUNCTION public.get_secure_tasks_paginated(
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, name text, client text, clientcode text, property text, filial text,
  filial_atendida text, email text, phone text, responsible text,
  start_date text, end_date text, start_time text, end_time text,
  status text, priority text, task_type text, observations text,
  is_prospect boolean, sales_type text, sales_value numeric,
  partial_sales_value numeric, sales_confirmed boolean,
  equipment_quantity integer, family_product text, check_in_location jsonb,
  initial_km integer, final_km integer, propertyhectares numeric,
  prospect_notes text, technical_visit_data jsonb, technical_funnel_stage text,
  created_at timestamptz, updated_at timestamptz, created_by uuid,
  access_level text, is_customer_data_protected boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_user_filial_id uuid;
  v_user_filial_name text;
  v_is_approved boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;

  SELECT p.role, p.filial_id, f.nome,
         (p.approval_status = 'approved' AND p.employment_status = 'active')
  INTO v_user_role, v_user_filial_id, v_user_filial_name, v_is_approved
  FROM public.profiles p
  LEFT JOIN public.filiais f ON f.id = p.filial_id
  WHERE p.user_id = v_user_id
  LIMIT 1;

  IF NOT COALESCE(v_is_approved, false) THEN RETURN; END IF;

  IF v_user_role IN ('admin', 'manager') THEN
    RETURN QUERY
    SELECT
      t.id, t.name, t.client, t.clientcode, t.property, t.filial, t.filial_atendida,
      t.email, t.phone, t.responsible,
      t.start_date::text, t.end_date::text, t.start_time, t.end_time,
      t.status, t.priority, t.task_type, t.observations,
      t.is_prospect, t.sales_type, t.sales_value, t.partial_sales_value, t.sales_confirmed,
      t.equipment_quantity, t.family_product,
      t.check_in_location, t.initial_km, t.final_km, t.propertyhectares, t.prospect_notes,
      NULL::jsonb, t.technical_funnel_stage,
      t.created_at, t.updated_at, t.created_by,
      'full'::text, false
    FROM public.tasks t
    ORDER BY t.created_at DESC
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  IF v_user_role = 'supervisor' AND v_user_filial_name IS NOT NULL THEN
    RETURN QUERY
    SELECT *
    FROM (
      SELECT
        t.id, t.name, t.client, t.clientcode, t.property, t.filial, t.filial_atendida,
        t.email, t.phone, t.responsible,
        t.start_date::text AS start_date, t.end_date::text AS end_date, t.start_time, t.end_time,
        t.status, t.priority, t.task_type, t.observations,
        t.is_prospect, t.sales_type, t.sales_value, t.partial_sales_value, t.sales_confirmed,
        t.equipment_quantity, t.family_product,
        t.check_in_location, t.initial_km, t.final_km, t.propertyhectares, t.prospect_notes,
        NULL::jsonb AS technical_visit_data, t.technical_funnel_stage,
        t.created_at, t.updated_at, t.created_by,
        'full'::text AS access_level, false AS is_customer_data_protected
      FROM public.tasks t
      WHERE t.created_by = v_user_id

      UNION ALL

      SELECT
        t.id, t.name, t.client, t.clientcode, t.property, t.filial, t.filial_atendida,
        '***@***'::text, '(***)***-****'::text, t.responsible,
        t.start_date::text, t.end_date::text, t.start_time, t.end_time,
        t.status, t.priority, t.task_type, t.observations,
        t.is_prospect, t.sales_type, t.sales_value, t.partial_sales_value, t.sales_confirmed,
        t.equipment_quantity, t.family_product,
        t.check_in_location, t.initial_km, t.final_km, t.propertyhectares, t.prospect_notes,
        NULL::jsonb, t.technical_funnel_stage,
        t.created_at, t.updated_at, t.created_by,
        'supervisor'::text, true
      FROM public.tasks t
      WHERE t.filial = v_user_filial_name
        AND t.created_by != v_user_id
    ) visible_tasks
    ORDER BY visible_tasks.created_at DESC
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id, t.name, t.client, t.clientcode, t.property, t.filial, t.filial_atendida,
    t.email, t.phone, t.responsible,
    t.start_date::text, t.end_date::text, t.start_time, t.end_time,
    t.status, t.priority, t.task_type, t.observations,
    t.is_prospect, t.sales_type, t.sales_value, t.partial_sales_value, t.sales_confirmed,
    t.equipment_quantity, t.family_product,
    t.check_in_location, t.initial_km, t.final_km, t.propertyhectares, t.prospect_notes,
    NULL::jsonb, t.technical_funnel_stage,
    t.created_at, t.updated_at, t.created_by,
    'owner'::text, false
  FROM public.tasks t
  WHERE t.created_by = v_user_id
  ORDER BY t.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_secure_tasks_paginated(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_secure_tasks_paginated(integer, integer) TO authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS idx_client_equipment_model_trgm
  ON public.client_equipment USING gin (model public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_client_equipment_serial_chassis_trgm
  ON public.client_equipment USING gin (serial_chassis public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_client_equipment_client_name_trgm
  ON public.client_equipment USING gin (client_name public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_client_equipment_client_code_trgm
  ON public.client_equipment USING gin (client_code public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_security_audit_login_email_created
  ON public.security_audit_log ((lower(metadata->>'email')), created_at DESC)
  WHERE event_type IN ('login_rate_limit_check', 'login_attempt_failed');
CREATE INDEX IF NOT EXISTS idx_security_audit_login_ip_created
  ON public.security_audit_log (ip_address, created_at DESC)
  WHERE event_type = 'login_rate_limit_check';

CREATE OR REPLACE FUNCTION public.check_login_rate_limit(user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  normalized_email text;
  caller_ip inet;
  failed_attempts integer;
  email_checks integer;
  ip_checks integer;
  last_attempt_time timestamptz;
BEGIN
  normalized_email := lower(trim(COALESCE(user_email, '')));
  caller_ip := inet_client_addr();

  IF length(normalized_email) < 3
     OR length(normalized_email) > 254
     OR normalized_email !~ '^[A-Z0-9._%+''-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' COLLATE "C" THEN
    RETURN false;
  END IF;

  SELECT count(*), max(created_at)
  INTO failed_attempts, last_attempt_time
  FROM public.security_audit_log
  WHERE event_type = 'login_attempt_failed'
    AND lower(metadata->>'email') = normalized_email
    AND created_at > now() - interval '1 hour';

  SELECT count(*)
  INTO email_checks
  FROM public.security_audit_log
  WHERE event_type = 'login_rate_limit_check'
    AND lower(metadata->>'email') = normalized_email
    AND created_at > now() - interval '1 minute';

  SELECT count(*)
  INTO ip_checks
  FROM public.security_audit_log
  WHERE event_type = 'login_rate_limit_check'
    AND ip_address IS NOT DISTINCT FROM caller_ip
    AND created_at > now() - interval '1 minute';

  IF failed_attempts >= 5 OR email_checks >= 10 OR ip_checks >= 30 THEN
    PERFORM public.secure_log_security_event(
      'login_rate_limit_exceeded',
      NULL,
      jsonb_build_object(
        'email', normalized_email,
        'failed_attempts', failed_attempts,
        'email_checks', email_checks,
        'ip_checks', ip_checks,
        'last_attempt', last_attempt_time
      ),
      5
    );
    RETURN false;
  END IF;

  PERFORM public.secure_log_security_event(
    'login_rate_limit_check',
    NULL,
    jsonb_build_object('email', normalized_email),
    1
  );
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_login_rate_limit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_equipment_validation_summary()
RETURNS TABLE(
  total_validated bigint,
  priority_validated bigint,
  non_priority_validated bigint,
  distinct_validated_clients bigint,
  by_filial jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH visible_validated AS (
    SELECT
      ce.validation_priority,
      ce.validated_by,
      ce.filial_id,
      CASE
        WHEN nullif(trim(ce.client_code), '') IS NOT NULL THEN 'c:' || lower(trim(ce.client_code))
        WHEN nullif(trim(ce.client_name), '') IS NOT NULL THEN 'n:' || lower(trim(ce.client_name))
        ELSE NULL
      END AS client_key
    FROM public.client_equipment ce
    WHERE ce.last_validation_at IS NOT NULL
  ), resolved AS (
    SELECT
      vv.validation_priority,
      vv.client_key,
      COALESCE(fv.nome, fe.nome, '—') AS filial_nome
    FROM visible_validated vv
    LEFT JOIN public.profiles p ON p.user_id = vv.validated_by
    LEFT JOIN public.filiais fv ON fv.id = p.filial_id
    LEFT JOIN public.filiais fe ON fe.id = vv.filial_id
  ), filial_counts AS (
    SELECT
      filial_nome,
      count(*) AS validated_count,
      count(*) FILTER (WHERE validation_priority IS TRUE) AS priority_count,
      count(*) FILTER (WHERE validation_priority IS DISTINCT FROM TRUE) AS non_priority_count,
      count(DISTINCT client_key) FILTER (WHERE client_key IS NOT NULL) AS client_count
    FROM resolved
    GROUP BY filial_nome
  )
  SELECT
    (SELECT count(*) FROM resolved),
    (SELECT count(*) FROM resolved WHERE validation_priority IS TRUE),
    (SELECT count(*) FROM resolved WHERE validation_priority IS DISTINCT FROM TRUE),
    (SELECT count(DISTINCT client_key) FROM resolved WHERE client_key IS NOT NULL),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'filial_nome', filial_nome,
        'validated_count', validated_count,
        'priority_count', priority_count,
        'non_priority_count', non_priority_count,
        'client_count', client_count
      ) ORDER BY validated_count DESC) FROM filial_counts),
      '[]'::jsonb
    );
$function$;

REVOKE ALL ON FUNCTION public.get_equipment_validation_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_equipment_validation_summary() TO authenticated, service_role;