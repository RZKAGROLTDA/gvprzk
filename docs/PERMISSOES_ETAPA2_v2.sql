-- GVPS Etapa 2 - Padronizacao de permissoes (v2) - NAO EXECUTADO
-- v2: diretorio do Supervisor restrito as filiais autorizadas (principal + vinculos ativos)
BEGIN;

-- Helper: cargo efetivo vindo de user_roles, exigindo perfil aprovado e ativo
CREATE OR REPLACE FUNCTION public.gvps_access_role(p_user_id uuid DEFAULT auth.uid())
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_user_id IS NULL THEN 'none'
    WHEN NOT EXISTS (SELECT 1 FROM public.profiles p
                      WHERE p.user_id = p_user_id
                        AND p.approval_status = 'approved'
                        AND p.employment_status = 'active') THEN 'none'
    ELSE COALESCE((
      SELECT ur.role::text FROM public.user_roles ur
       WHERE ur.user_id = p_user_id
       ORDER BY CASE ur.role::text
         WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'supervisor' THEN 3
         WHEN 'rac' THEN 4 WHEN 'cpa' THEN 5 WHEN 'csa' THEN 6
         WHEN 'consultant' THEN 7 WHEN 'sales_consultant' THEN 8
         WHEN 'technical_consultant' THEN 9 ELSE 99 END
       LIMIT 1), 'none')
  END;
$function$;
REVOKE ALL ON FUNCTION public.gvps_access_role(uuid) FROM PUBLIC, anon, authenticated;

-- 1) get_secure_tasks_paginated
CREATE OR REPLACE FUNCTION public.get_secure_tasks_paginated(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_filial_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, client text, clientcode text, property text, filial text, filial_atendida text, email text, phone text, responsible text, start_date text, end_date text, start_time text, end_time text, status text, priority text, task_type text, observations text, is_prospect boolean, sales_type text, sales_value numeric, partial_sales_value numeric, sales_confirmed boolean, equipment_quantity integer, family_product text, check_in_location jsonb, initial_km integer, final_km integer, propertyhectares numeric, prospect_notes text, technical_visit_data jsonb, technical_funnel_stage text, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, access_level text, is_customer_data_protected boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_is_approved boolean;
  v_eff uuid[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;

  v_user_role := public.gvps_access_role(v_user_id);
  IF v_user_role = 'none' THEN RETURN; END IF;

  v_eff := public.effective_filial_ids(p_filial_id);

  IF v_user_role IN ('admin', 'manager') THEN
    RETURN QUERY
    SELECT
      t.id, t.name, t.client, t.clientcode, t.property, t.filial, t.filial_atendida,
      t.email, t.phone, t.responsible,
      t.start_date::text, t.end_date::text, t.start_time, t.end_time,
      t.status, t.priority, t.task_type, t.observations,
      t.is_prospect, t.sales_type, t.sales_value, t.partial_sales_value, t.sales_confirmed,
      t.equipment_quantity, t.family_product,
      t.check_in_location, t.initial_km, t.final_km, t.propertyhectares::numeric, t.prospect_notes,
      NULL::jsonb, t.technical_funnel_stage,
      t.created_at, t.updated_at, t.created_by,
      'full'::text, false
    FROM public.tasks t
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        (SELECT tf.filial_id FROM public.task_followups tf
          WHERE tf.task_id = t.id AND tf.filial_id IS NOT NULL
          ORDER BY tf.created_at DESC, tf.id DESC LIMIT 1),
        (SELECT tam.creator_filial_id FROM public.task_access_metadata tam
          WHERE tam.task_id = t.id LIMIT 1)
      ) AS filial_op
    ) op ON true
    WHERE cardinality(v_eff) = 0 OR op.filial_op = ANY(v_eff)
    ORDER BY t.created_at DESC
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  IF v_user_role = 'supervisor' THEN
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
        t.check_in_location, t.initial_km, t.final_km, t.propertyhectares::numeric AS propertyhectares, t.prospect_notes,
        NULL::jsonb AS technical_visit_data, t.technical_funnel_stage,
        t.created_at, t.updated_at, t.created_by,
        'full'::text AS access_level, false AS is_customer_data_protected
      FROM public.tasks t
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          (SELECT tf.filial_id FROM public.task_followups tf
            WHERE tf.task_id = t.id AND tf.filial_id IS NOT NULL
            ORDER BY tf.created_at DESC, tf.id DESC LIMIT 1),
          (SELECT tam.creator_filial_id FROM public.task_access_metadata tam
            WHERE tam.task_id = t.id LIMIT 1)
        ) AS filial_op
      ) op ON true
      WHERE t.created_by = v_user_id
        AND (cardinality(v_eff) = 0 OR op.filial_op = ANY(v_eff))

      UNION ALL

      SELECT
        t.id, t.name, t.client, t.clientcode, t.property, t.filial, t.filial_atendida,
        '***@***'::text, '(***)***-****'::text, t.responsible,
        t.start_date::text, t.end_date::text, t.start_time, t.end_time,
        t.status, t.priority, t.task_type, t.observations,
        t.is_prospect, t.sales_type, t.sales_value, t.partial_sales_value, t.sales_confirmed,
        t.equipment_quantity, t.family_product,
        t.check_in_location, t.initial_km, t.final_km, t.propertyhectares::numeric, t.prospect_notes,
        NULL::jsonb, t.technical_funnel_stage,
        t.created_at, t.updated_at, t.created_by,
        'supervisor'::text, true
      FROM public.tasks t
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          (SELECT tf.filial_id FROM public.task_followups tf
            WHERE tf.task_id = t.id AND tf.filial_id IS NOT NULL
            ORDER BY tf.created_at DESC, tf.id DESC LIMIT 1),
          (SELECT tam.creator_filial_id FROM public.task_access_metadata tam
            WHERE tam.task_id = t.id LIMIT 1)
        ) AS filial_op
      ) op ON true
      WHERE t.created_by <> v_user_id
        AND (cardinality(v_eff) = 0 OR op.filial_op = ANY(v_eff))
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
    t.check_in_location, t.initial_km, t.final_km, t.propertyhectares::numeric, t.prospect_notes,
    NULL::jsonb, t.technical_funnel_stage,
    t.created_at, t.updated_at, t.created_by,
    'owner'::text, false
  FROM public.tasks t
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      (SELECT tf.filial_id FROM public.task_followups tf
        WHERE tf.task_id = t.id AND tf.filial_id IS NOT NULL
        ORDER BY tf.created_at DESC, tf.id DESC LIMIT 1),
      (SELECT tam.creator_filial_id FROM public.task_access_metadata tam
        WHERE tam.task_id = t.id LIMIT 1)
    ) AS filial_op
  ) op ON true
  WHERE t.created_by = v_user_id
    AND (cardinality(v_eff) = 0 OR op.filial_op = ANY(v_eff))
  ORDER BY t.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- 2) get_secure_task_by_id
CREATE OR REPLACE FUNCTION public.get_secure_task_by_id(p_task_id uuid, p_filial_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, name text, client text, clientcode text, property text, propertyhectares double precision, responsible text, start_date date, end_date date, start_time text, end_time text, priority text, status text, task_type text, observations text, initial_km double precision, final_km double precision, equipment_quantity integer, equipment_list jsonb, family_product text, email text, phone text, filial text, filial_atendida text, is_prospect boolean, prospect_notes text, sales_confirmed boolean, sales_type text, sales_value double precision, partial_sales_value double precision, check_in_location jsonb, checklist_machine jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, access_level text, is_customer_data_protected boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '10s'
AS $function$
DECLARE
  v_user_id uuid; v_user_role text; v_is_approved boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;

  v_user_role := public.gvps_access_role(v_user_id);
  IF v_user_role = 'none' THEN RETURN; END IF;

  IF v_user_role IN ('admin', 'manager') THEN
    RETURN QUERY
    SELECT t.id, t.name, t.client, t.clientcode, t.property,
      t.propertyhectares::double precision, t.responsible,
      t.start_date::date, t.end_date::date, t.start_time, t.end_time,
      t.priority, t.status, t.task_type, t.observations,
      t.initial_km::double precision, t.final_km::double precision,
      t.equipment_quantity::integer, t.equipment_list,
      t.family_product, t.email, t.phone, t.filial, t.filial_atendida,
      t.is_prospect, t.prospect_notes, t.sales_confirmed,
      t.sales_type, t.sales_value::double precision,
      t.partial_sales_value::double precision, t.check_in_location,
      t.checklist_machine, t.created_at, t.updated_at, t.created_by,
      'full'::text, false
    FROM tasks t WHERE t.id = p_task_id LIMIT 1;
    RETURN;
  END IF;

  IF v_user_role = 'supervisor' THEN
    RETURN QUERY
    SELECT t.id, t.name, t.client, t.clientcode, t.property,
      t.propertyhectares::double precision, t.responsible,
      t.start_date::date, t.end_date::date, t.start_time, t.end_time,
      t.priority, t.status, t.task_type, t.observations,
      t.initial_km::double precision, t.final_km::double precision,
      t.equipment_quantity::integer, t.equipment_list,
      t.family_product,
      CASE WHEN t.created_by = v_user_id THEN t.email ELSE '***@***.***' END,
      CASE WHEN t.created_by = v_user_id THEN t.phone ELSE '(**) *****-****' END,
      t.filial, t.filial_atendida, t.is_prospect, t.prospect_notes, t.sales_confirmed,
      t.sales_type, t.sales_value::double precision,
      t.partial_sales_value::double precision, t.check_in_location,
      t.checklist_machine, t.created_at, t.updated_at, t.created_by,
      CASE WHEN t.created_by = v_user_id THEN 'full' ELSE 'filial' END::text,
      (t.created_by != v_user_id)
    FROM tasks t
    WHERE t.id = p_task_id AND public.supervisor_task_filial_ok(t.filial, p_filial_id)
    LIMIT 1;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT t.id, t.name, t.client, t.clientcode, t.property,
    t.propertyhectares::double precision, t.responsible,
    t.start_date::date, t.end_date::date, t.start_time, t.end_time,
    t.priority, t.status, t.task_type, t.observations,
    t.initial_km::double precision, t.final_km::double precision,
    t.equipment_quantity::integer, t.equipment_list,
    t.family_product, t.email, t.phone, t.filial, t.filial_atendida,
    t.is_prospect, t.prospect_notes, t.sales_confirmed,
    t.sales_type, t.sales_value::double precision,
    t.partial_sales_value::double precision, t.check_in_location,
    t.checklist_machine, t.created_at, t.updated_at, t.created_by,
    'full'::text, false
  FROM tasks t WHERE t.id = p_task_id AND t.created_by = v_user_id LIMIT 1;
END;
$function$;

-- 3) get_secure_export_data: cargo por user_roles; escopo proprio (sem depender da funcao legada)
CREATE OR REPLACE FUNCTION public.get_secure_export_data(start_date_param date DEFAULT NULL::date, end_date_param date DEFAULT NULL::date, filial_filter_param text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, name text, responsible text, client text, property text, filial text, email text, phone text, sales_value numeric, start_date date, end_date date, status text, task_type text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_filiais text[];
  v_filter text := NULLIF(LOWER(TRIM(COALESCE(filial_filter_param, ''))), '');
  export_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required for data export' USING ERRCODE = '42501';
  END IF;

  v_role := public.gvps_access_role(v_uid);
  IF v_role NOT IN ('admin', 'manager', 'supervisor') THEN
    RAISE EXCEPTION 'Insufficient permissions for data export' USING ERRCODE = '42501';
  END IF;
  IF v_filter IN ('all', 'todos', 'todas') THEN v_filter := NULL; END IF;

  IF v_role = 'supervisor' THEN
    -- filial principal + vinculos adicionais ativos
    SELECT array_agg(LOWER(TRIM(f.nome))) INTO v_filiais
      FROM public.filiais f
     WHERE f.id = ANY(public.get_user_filial_ids_internal(v_uid));
    IF COALESCE(array_length(v_filiais, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Acesso negado: usuário sem filial autorizada' USING ERRCODE = '42501';
    END IF;
    IF v_filter IS NOT NULL AND NOT (v_filter = ANY(v_filiais)) THEN
      RAISE EXCEPTION 'Acesso negado: filial não autorizada' USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM public.secure_log_security_event('secure_data_export_attempt', v_uid,
    jsonb_build_object('user_role', v_role, 'start_date', start_date_param,
                       'end_date', end_date_param, 'filial_filter', filial_filter_param), 4);

  RETURN QUERY
  SELECT t.id, t.name, t.responsible, t.client, t.property, t.filial,
         CASE WHEN v_role IN ('admin','manager') OR t.created_by = v_uid THEN t.email ELSE 'protected@secure.data' END,
         CASE WHEN v_role IN ('admin','manager') OR t.created_by = v_uid THEN t.phone ELSE '+55 (***) ****-****' END,
         t.sales_value, t.start_date, t.end_date, t.status, t.task_type, t.created_at
    FROM public.tasks t
   WHERE (start_date_param IS NULL OR t.start_date >= start_date_param)
     AND (end_date_param IS NULL OR t.end_date <= end_date_param)
     AND (v_filter IS NULL OR LOWER(TRIM(t.filial)) = v_filter)
     AND (v_role IN ('admin','manager')
          OR t.created_by = v_uid
          OR LOWER(TRIM(t.filial)) = ANY(v_filiais))
   ORDER BY t.created_at DESC;

  GET DIAGNOSTICS export_count = ROW_COUNT;
  PERFORM public.secure_log_security_event('secure_data_export_completed', v_uid,
    jsonb_build_object('record_count', export_count, 'user_role', v_role), 3);
END;
$function$;

-- 4) get_user_directory_with_fallback: remove fallback por profiles.role
CREATE OR REPLACE FUNCTION public.get_user_directory_with_fallback()
 RETURNS TABLE(id uuid, user_id uuid, name text, email text, role text, approval_status text, filial_id uuid, filial_nome text, created_at timestamp with time zone, updated_at timestamp with time zone, is_masked boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_current_role text;
  is_authorized boolean := false;
  v_filiais uuid[];
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  -- Autorizacao exclusivamente por user_roles + perfil aprovado e ativo
  user_current_role := public.gvps_access_role(auth.uid());
  IF user_current_role NOT IN ('admin', 'manager', 'supervisor') THEN
    RAISE EXCEPTION 'Access denied: Manager or Supervisor role required' USING ERRCODE = '42501';
  END IF;
  is_authorized := user_current_role IN ('admin', 'manager');
  IF NOT is_authorized THEN
    v_filiais := public.get_user_filial_ids_internal(auth.uid());
    IF COALESCE(array_length(v_filiais, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Acesso negado: usuário sem filial autorizada' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Log the access for security audit
  PERFORM public.secure_log_security_event(
    'user_directory_access',
    auth.uid(),
    jsonb_build_object(
      'is_full_access', is_authorized,
      'timestamp', now()
    ),
    2
  );
  
  -- Return user directory with filial information
  -- Include ALL users (pending, approved, rejected) for management
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.name,
    CASE 
      WHEN is_authorized THEN p.email
      ELSE SUBSTRING(p.email FROM 1 FOR 1) || '***@' || SPLIT_PART(p.email, '@', 2)
    END as email,
    p.role,
    p.approval_status,
    p.filial_id,
    COALESCE(f.nome, 'Sem filial') as filial_nome,
    p.created_at,
    p.updated_at,
    (NOT is_authorized) as is_masked
  FROM public.profiles p
  LEFT JOIN public.filiais f ON p.filial_id = f.id
  WHERE is_authorized
     OR p.filial_id = ANY(v_filiais)
     OR EXISTS (SELECT 1 FROM public.user_filiais uf
                 WHERE uf.user_id = p.user_id AND uf.active
                   AND uf.filial_id = ANY(v_filiais))
  ORDER BY 
    CASE p.approval_status 
      WHEN 'pending' THEN 1 
      WHEN 'approved' THEN 2 
      WHEN 'rejected' THEN 3 
      ELSE 4 
    END,
    p.created_at DESC;
END;
$function$;

-- 5) get_user_security_level: somente user_roles + aprovado/ativo
CREATE OR REPLACE FUNCTION public.get_user_security_level()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE r
    WHEN 'admin' THEN 'admin'
    WHEN 'manager' THEN 'manager'
    WHEN 'supervisor' THEN 'supervisor'
    WHEN 'rac' THEN 'rac' WHEN 'cpa' THEN 'rac' WHEN 'csa' THEN 'rac'
    WHEN 'none' THEN 'none'
    ELSE 'user'
  END
  FROM (SELECT public.gvps_access_role(auth.uid()) AS r) x;
$function$;

-- 6) search_clients: exige cargo registrado
CREATE OR REPLACE FUNCTION public.search_clients(p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE(client_code text, client_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_q      text := btrim(COALESCE(p_query, ''));
  v_digits text;
  v_norm   text;
  v_limit  int  := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  v_ok     boolean := false;
  v_profile record;
BEGIN
  IF auth.role() = 'service_role' THEN
    v_ok := true;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT approval_status, employment_status
      INTO v_profile
      FROM public.profiles
     WHERE user_id = auth.uid()
     LIMIT 1;
    IF v_profile.approval_status = 'approved' AND v_profile.employment_status = 'active'
       AND public.gvps_access_role(auth.uid()) <> 'none' THEN
      v_ok := true;
    END IF;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_q = '' THEN
    RETURN;
  END IF;

  v_digits := regexp_replace(v_q, '[^0-9]', '', 'g');
  IF v_digits <> '' THEN
    v_norm := regexp_replace(v_digits, '^0+', '');
    IF v_norm = '' THEN v_norm := '0'; END IF;
  END IF;

  RETURN QUERY
  WITH master AS (
    SELECT cm.client_code,
           cm.client_name,
           'clients_master'::text AS source,
           cm.client_code_norm AS norm,
           (v_norm IS NOT NULL AND cm.client_code_norm = v_norm) AS exact_code
    FROM public.clients_master cm
    WHERE cm.active
      AND (
        (v_norm IS NOT NULL AND (cm.client_code_norm = v_norm OR cm.client_code_norm LIKE v_norm || '%'))
        OR cm.client_code ILIKE '%' || v_q || '%'
        OR cm.client_name ILIKE '%' || v_q || '%'
        OR cm.client_name_norm ILIKE '%' || upper(v_q) || '%'
      )
    ORDER BY (v_norm IS NOT NULL AND cm.client_code_norm = v_norm) DESC, cm.client_name
    LIMIT v_limit
  ),
  legacy AS (
    SELECT x.client_code,
           x.client_name,
           x.source,
           COALESCE(NULLIF(regexp_replace(regexp_replace(x.client_code, '[^0-9]', '', 'g'), '^0+', ''), ''),
                    regexp_replace(x.client_code, '[^0-9]', '', 'g')) AS norm
    FROM (
      SELECT DISTINCT btrim(ce.client_code::text) AS client_code, ce.client_name, 'client_equipment'::text AS source
      FROM public.client_equipment ce
      WHERE ce.client_code IS NOT NULL
        AND ce.client_name IS NOT NULL
        AND (
          ce.client_code ILIKE '%' || v_q || '%'
          OR ce.client_name ILIKE '%' || v_q || '%'
          OR (v_norm IS NOT NULL AND regexp_replace(regexp_replace(ce.client_code, '[^0-9]', '', 'g'), '^0+', '') LIKE v_norm || '%')
        )
      UNION
      SELECT DISTINCT btrim(m.client_code) AS client_code, m.client_name, 'campaign_clients_master'::text AS source
      FROM public.campaign_clients_master m
      WHERE m.client_code IS NOT NULL
        AND m.client_name IS NOT NULL
        AND (
          m.client_code ILIKE '%' || v_q || '%'
          OR m.client_name ILIKE '%' || v_q || '%'
          OR (v_norm IS NOT NULL AND regexp_replace(regexp_replace(m.client_code, '[^0-9]', '', 'g'), '^0+', '') LIKE v_norm || '%')
        )
    ) x
  ),
  combined AS (
    SELECT m.client_code, m.client_name, m.source, m.norm, m.exact_code
    FROM master m
    UNION ALL
    SELECT l.client_code, l.client_name, l.source, l.norm, false AS exact_code
    FROM legacy l
    WHERE NOT EXISTS (SELECT 1 FROM master mm WHERE mm.norm = l.norm)
      AND NOT EXISTS (SELECT 1 FROM public.clients_master c WHERE c.active AND c.client_code_norm = l.norm)
  ),
  deduped AS (
    SELECT DISTINCT ON (c.norm) c.client_code, c.client_name, c.source, c.exact_code
    FROM combined c
    ORDER BY c.norm, (c.source = 'clients_master') DESC
  )
  SELECT d.client_code, d.client_name
  FROM deduped d
  ORDER BY d.exact_code DESC, d.client_name NULLS LAST, d.client_code
  LIMIT v_limit;
END;
$function$;

-- 7) search_clients_for_campaigns: exige cargo registrado
CREATE OR REPLACE FUNCTION public.search_clients_for_campaigns(p_query text)
 RETURNS TABLE(client_code text, client_name text, source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_q text := btrim(COALESCE(p_query, ''));
  v_digits text;
  v_norm text;
  v_is_authorized boolean := false;
  v_profile record;
BEGIN
  -- Validação de segurança
  IF auth.role() = 'service_role' THEN
    v_is_authorized := true;
  ELSIF auth.uid() IS NOT NULL THEN
    SELECT approval_status, employment_status
      INTO v_profile
      FROM public.profiles
     WHERE user_id = auth.uid()
     LIMIT 1;

    IF v_profile.approval_status = 'approved' AND v_profile.employment_status = 'active'
       AND public.gvps_access_role(auth.uid()) <> 'none' THEN
      v_is_authorized := true;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Acesso não autorizado.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_digits := regexp_replace(v_q, '[^0-9]', '', 'g');
  IF v_digits <> '' THEN
    v_norm := regexp_replace(v_digits, '^0+', '');
    IF v_norm = '' THEN v_norm := '0'; END IF;
  END IF;

  RETURN QUERY
  WITH master AS (
    SELECT cm.client_code,
           cm.client_name,
           'clients_master'::text AS source,
           cm.client_code_norm AS norm
    FROM public.clients_master cm
    WHERE cm.active
      AND (
        v_q = ''
        OR (v_norm IS NOT NULL AND (cm.client_code_norm = v_norm OR cm.client_code_norm LIKE v_norm || '%'))
        OR cm.client_code ILIKE '%' || v_q || '%'
        OR cm.client_name ILIKE '%' || v_q || '%'
        OR cm.client_name_norm ILIKE '%' || upper(v_q) || '%'
      )
    ORDER BY (v_norm IS NOT NULL AND cm.client_code_norm = v_norm) DESC, cm.client_name
    LIMIT 50
  ),
  legacy AS (
    SELECT x.client_code, x.client_name, x.source,
           COALESCE(NULLIF(regexp_replace(regexp_replace(x.client_code, '[^0-9]', '', 'g'), '^0+', ''), ''), regexp_replace(x.client_code, '[^0-9]', '', 'g')) AS norm
    FROM (
      SELECT m.client_code, m.client_name, m.source
      FROM public.campaign_clients_master m
      WHERE v_q = ''
         OR m.client_name ILIKE '%' || v_q || '%'
         OR m.client_code ILIKE '%' || v_q || '%'
         OR (v_norm IS NOT NULL AND regexp_replace(regexp_replace(m.client_code, '[^0-9]', '', 'g'), '^0+', '') LIKE v_norm || '%')
      UNION
      SELECT DISTINCT t.clientcode AS client_code, t.client AS client_name, 'tasks'::text AS source
      FROM public.tasks t
      WHERE t.clientcode IS NOT NULL
        AND t.client IS NOT NULL
        AND (
          v_q = ''
          OR t.client ILIKE '%' || v_q || '%'
          OR t.clientcode ILIKE '%' || v_q || '%'
          OR (v_norm IS NOT NULL AND regexp_replace(regexp_replace(t.clientcode, '[^0-9]', '', 'g'), '^0+', '') LIKE v_norm || '%')
        )
    ) x
  ),
  combined AS (
    SELECT * FROM master
    UNION ALL
    SELECT l.client_code, l.client_name, l.source, l.norm
    FROM legacy l
    WHERE NOT EXISTS (SELECT 1 FROM master mm WHERE mm.norm = l.norm)
      AND NOT EXISTS (SELECT 1 FROM public.clients_master c WHERE c.client_code_norm = l.norm)
  )
  SELECT DISTINCT ON (c.norm) c.client_code, c.client_name, c.source
  FROM combined c
  ORDER BY c.norm, (c.source = 'clients_master') DESC
  LIMIT 50;
END;
$function$;

COMMIT;
