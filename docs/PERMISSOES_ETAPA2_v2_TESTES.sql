-- Migracao v2 + 13 casos num unico DO encerrado por RAISE EXCEPTION: rollback garantido
DO $do$
DECLARE
  res text := 'RESULTADOS ETAPA 2 v2'; v_n bigint; v_total bigint; v_prof bigint;
  u_a uuid; u_m uuid; u_d uuid; u_s uuid; u_b uuid; u_e uuid;
  d_ids uuid[]; d_names text[]; f_link uuid; f_out uuid; f_out_name text;
  task_out uuid; task_team uuid; task_team_email text; h_before text; h_after text; c_before bigint;
BEGIN
  SELECT ur.user_id INTO u_a FROM user_roles ur JOIN profiles p USING(user_id) WHERE ur.role='admin' AND p.employment_status='active' AND p.approval_status='approved' LIMIT 1;
  SELECT ur.user_id INTO u_m FROM user_roles ur JOIN profiles p USING(user_id) WHERE ur.role='manager' AND p.employment_status='active' AND p.approval_status='approved' AND p.name NOT ILIKE '%ramon%' AND NOT EXISTS(SELECT 1 FROM user_roles a WHERE a.user_id=ur.user_id AND a.role='admin') LIMIT 1;
  SELECT user_id INTO u_d FROM profiles WHERE name ILIKE 'David Dago%' LIMIT 1;
  SELECT ur.user_id INTO u_s FROM user_roles ur JOIN profiles p USING(user_id) WHERE ur.role='sales_consultant' AND p.employment_status='active' AND p.approval_status='approved' AND p.filial_id=(SELECT filial_id FROM profiles WHERE user_id=u_d) LIMIT 1;
  SELECT user_id INTO u_b FROM profiles WHERE name='Bruno Queiroz' LIMIT 1;
  SELECT user_id INTO u_e FROM profiles WHERE name ILIKE 'Elton Reichert%' LIMIT 1;
  IF u_a IS NULL OR u_m IS NULL OR u_d IS NULL OR u_s IS NULL OR u_b IS NULL OR u_e IS NULL THEN RAISE EXCEPTION 'persona ausente % % % % % %',u_a,u_m,u_d,u_s,u_b,u_e; END IF;
  SELECT md5(string_agg(p.user_id::text||p.role||p.approval_status||p.employment_status||coalesce(p.filial_id::text,'')||coalesce((SELECT string_agg(r.role::text,',' ORDER BY r.role) FROM user_roles r WHERE r.user_id=p.user_id),''),'|' ORDER BY p.user_id)) INTO h_before FROM profiles p WHERE p.name ILIKE 'Ramon%' OR p.user_id IN (u_b,u_e);
  SELECT count(*) INTO c_before FROM tasks;

  EXECUTE $mig$-- GVPS Etapa 2 - Padronizacao de permissoes (v2) - NAO EXECUTADO
-- v2: diretorio do Supervisor restrito as filiais autorizadas (principal + vinculos ativos)

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

$mig$;

  EXECUTE $f$CREATE FUNCTION pg_temp.tq(u uuid, r text, q text) RETURNS bigint LANGUAGE plpgsql AS $b$
  DECLARE n bigint; BEGIN
    PERFORM set_config('request.jwt.claims', CASE WHEN u IS NULL THEN json_build_object('role',r) ELSE json_build_object('sub',u,'role',r) END::text, true);
    EXECUTE 'SET LOCAL ROLE '||r; EXECUTE q INTO n; RESET ROLE; PERFORM set_config('request.jwt.claims','',true); RETURN n;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM set_config('request.jwt.claims','',true); RETURN -1; END $b$$f$;

  SELECT f.id INTO f_link FROM filiais f WHERE NOT (f.id = ANY(public.get_user_filial_ids_internal(u_d))) AND EXISTS (SELECT 1 FROM profiles p WHERE p.filial_id=f.id AND p.employment_status='active' AND p.approval_status='approved') ORDER BY f.nome LIMIT 1;
  INSERT INTO user_filiais(user_id, filial_id, active, created_by) VALUES (u_d, f_link, true, u_a);
  d_ids := public.get_user_filial_ids_internal(u_d);
  SELECT array_agg(lower(trim(nome))) INTO d_names FROM filiais WHERE id = ANY(d_ids);
  SELECT f.id, lower(trim(f.nome)) INTO f_out, f_out_name FROM filiais f WHERE NOT (f.id = ANY(d_ids)) AND EXISTS (SELECT 1 FROM tasks t WHERE lower(trim(t.filial))=lower(trim(f.nome))) ORDER BY f.nome LIMIT 1;
  SELECT id INTO task_out FROM tasks WHERE lower(trim(filial)) = f_out_name LIMIT 1;
  SELECT t.id, t.email INTO task_team, task_team_email FROM tasks t WHERE lower(trim(t.filial)) = (SELECT lower(trim(nome)) FROM filiais WHERE id=(SELECT filial_id FROM profiles WHERE user_id=u_d)) AND t.created_by <> u_d AND coalesce(t.email,'') <> '' LIMIT 1;
  SELECT count(*) INTO v_total FROM tasks; SELECT count(*) INTO v_prof FROM profiles;
  res := res || format(E'\nctx: vinculo=%s fora=%s tarefa_fora=%s tarefa_equipe=%s', f_link, f_out_name, task_out, task_team);
  v_n := pg_temp.tq(u_a,'authenticated',$q$SELECT (public.get_user_security_level()='admin')::int$q$); res := res || format(E'\nT1 %s: %s', 'nivel admin', CASE WHEN v_n=1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_m,'authenticated',$q$SELECT (public.get_user_security_level()='manager')::int$q$); res := res || format(E'\nT1 %s: %s', 'nivel gerente', CASE WHEN v_n=1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_d,'authenticated',$q$SELECT (public.get_user_security_level()='supervisor')::int$q$); res := res || format(E'\nT1 %s: %s', 'nivel david', CASE WHEN v_n=1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_s,'authenticated',$q$SELECT (public.get_user_security_level()='user')::int$q$); res := res || format(E'\nT1 %s: %s', 'nivel vendedor', CASE WHEN v_n=1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_b,'authenticated',$q$SELECT (public.get_user_security_level()='none')::int$q$); res := res || format(E'\nT1 %s: %s', 'nivel bruno', CASE WHEN v_n=1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_e,'authenticated',$q$SELECT (public.get_user_security_level()='none')::int$q$); res := res || format(E'\nT1 %s: %s', 'nivel elton', CASE WHEN v_n=1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_a,'authenticated',$q$SELECT count(*) FROM public.get_secure_tasks_paginated(1000000,0,NULL)$q$); res := res || format(E'\nT2 %s: %s', 'admin ve todas', CASE WHEN v_n=v_total THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_m,'authenticated',$q$SELECT count(*) FROM public.get_secure_tasks_paginated(1000000,0,NULL)$q$); res := res || format(E'\nT2 %s: %s', 'gerente ve todas', CASE WHEN v_n=v_total THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_b,'authenticated',$q$SELECT count(*) FROM public.get_secure_tasks_paginated(1000,0,NULL)$q$); res := res || format(E'\nT2 %s: %s', 'bruno nada', CASE WHEN v_n<=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_e,'authenticated',$q$SELECT count(*) FROM public.get_secure_tasks_paginated(1000,0,NULL)$q$); res := res || format(E'\nT2 %s: %s', 'elton nada', CASE WHEN v_n<=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_s,'authenticated',format($q$SELECT count(*) FILTER (WHERE created_by IS DISTINCT FROM %L) FROM public.get_secure_tasks_paginated(1000000,0,NULL)$q$,u_s)); res := res || format(E'\nT3 %s: %s', 'vendedor so proprias (terceiros=0)', CASE WHEN v_n=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_d,'authenticated',format($q$SELECT count(*) FILTER (WHERE NOT lower(trim(filial))=ANY(%L::text[]) AND created_by IS DISTINCT FROM %L) FROM public.get_secure_tasks_paginated(1000000,0,NULL)$q$,d_names,u_d)); res := res || format(E'\nT4 %s: %s', 'david fora das filiais autorizadas=0', CASE WHEN v_n=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_d,'authenticated',format($q$SELECT count(*) FROM public.get_secure_tasks_paginated(1000,0,%L)$q$,f_link)); res := res || format(E'\nT4 %s: %s', 'david vinculo adicional permitido', CASE WHEN v_n>=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_d,'authenticated',format($q$SELECT count(*) FROM public.get_secure_tasks_paginated(1000,0,%L)$q$,f_out)); res := res || format(E'\nT4 %s: %s', 'david filial nao vinculada bloqueada', CASE WHEN v_n<=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_a,'authenticated',format($q$SELECT count(*) FROM public.get_secure_task_by_id(%L,NULL)$q$,task_out)); res := res || format(E'\nT5 %s: %s', 'tarefa de outra filial admin', CASE WHEN v_n=1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_m,'authenticated',format($q$SELECT count(*) FROM public.get_secure_task_by_id(%L,NULL)$q$,task_out)); res := res || format(E'\nT5 %s: %s', 'tarefa de outra filial gerente', CASE WHEN v_n=1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_d,'authenticated',format($q$SELECT count(*) FROM public.get_secure_task_by_id(%L,NULL)$q$,task_out)); res := res || format(E'\nT5 %s: %s', 'tarefa de outra filial david', CASE WHEN v_n<=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_s,'authenticated',format($q$SELECT count(*) FROM public.get_secure_task_by_id(%L,NULL)$q$,task_out)); res := res || format(E'\nT5 %s: %s', 'tarefa de outra filial vendedor', CASE WHEN v_n<=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_b,'authenticated',format($q$SELECT count(*) FROM public.get_secure_task_by_id(%L,NULL)$q$,task_out)); res := res || format(E'\nT5 %s: %s', 'tarefa de outra filial bruno', CASE WHEN v_n<=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_e,'authenticated',format($q$SELECT count(*) FROM public.get_secure_task_by_id(%L,NULL)$q$,task_out)); res := res || format(E'\nT5 %s: %s', 'tarefa de outra filial elton', CASE WHEN v_n<=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_d,'authenticated',format($q$SELECT count(*) FILTER (WHERE email IS DISTINCT FROM %L) FROM public.get_secure_task_by_id(%L,NULL)$q$,task_team_email,task_team)); res := res || format(E'\nT6 %s: %s', 'david abre tarefa da equipe com email mascarado', CASE WHEN v_n=1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_a,'authenticated',$q$SELECT count(*) FROM public.get_secure_export_data(NULL,NULL,NULL)$q$); res := res || format(E'\nT7 %s: %s', 'export admin', CASE WHEN v_n>0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_m,'authenticated',$q$SELECT count(*) FROM public.get_secure_export_data(NULL,NULL,NULL)$q$); res := res || format(E'\nT7 %s: %s', 'export gerente', CASE WHEN v_n>0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_d,'authenticated',format($q$SELECT count(*) FROM public.get_secure_export_data(NULL,NULL,NULL) x WHERE NOT lower(trim(x.filial))=ANY(%L::text[]) AND NOT EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=x.id AND t.created_by=%L)$q$,d_names,u_d)); res := res || format(E'\nT7 %s: %s', 'export david fora das autorizadas=0', CASE WHEN v_n=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_s,'authenticated',$q$SELECT count(*) FROM public.get_secure_export_data(NULL,NULL,NULL)$q$); res := res || format(E'\nT7 %s: %s', 'export vendedor bloqueado', CASE WHEN v_n=-1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_b,'authenticated',$q$SELECT count(*) FROM public.get_secure_export_data(NULL,NULL,NULL)$q$); res := res || format(E'\nT7 %s: %s', 'export bruno bloqueado', CASE WHEN v_n=-1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_e,'authenticated',$q$SELECT count(*) FROM public.get_secure_export_data(NULL,NULL,NULL)$q$); res := res || format(E'\nT7 %s: %s', 'export elton bloqueado', CASE WHEN v_n=-1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_d,'authenticated',format($q$SELECT count(*) FROM public.get_secure_export_data(NULL,NULL,%L)$q$,f_out_name)); res := res || format(E'\nT8 %s: %s', 'export david filial nao autorizada bloqueado', CASE WHEN v_n=-1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_a,'authenticated',$q$SELECT count(*) FILTER (WHERE NOT is_masked) FROM public.get_user_directory_with_fallback()$q$); res := res || format(E'\nT9 %s: %s', 'diretorio admin completo sem mascara', CASE WHEN v_n=v_prof THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_m,'authenticated',$q$SELECT count(*) FILTER (WHERE is_masked) FROM public.get_user_directory_with_fallback()$q$); res := res || format(E'\nT9 %s: %s', 'diretorio gerente sem mascara', CASE WHEN v_n=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_d,'authenticated',format($q$SELECT count(*) FROM public.get_user_directory_with_fallback() x WHERE NOT coalesce(x.filial_id=ANY(%L::uuid[]),false) AND NOT EXISTS(SELECT 1 FROM public.user_filiais uf WHERE uf.user_id=x.user_id AND uf.active AND uf.filial_id=ANY(%L::uuid[]))$q$,d_ids,d_ids)); res := res || format(E'\nT9 %s: %s', 'diretorio david fora das filiais autorizadas=0', CASE WHEN v_n=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_d,'authenticated',$q$SELECT count(*) FILTER (WHERE NOT is_masked) FROM public.get_user_directory_with_fallback()$q$); res := res || format(E'\nT9 %s: %s', 'diretorio david todo mascarado', CASE WHEN v_n=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_d,'authenticated',$q$SELECT count(*) FROM public.get_user_directory_with_fallback()$q$); res := res || format(E'\nT9 %s: %s', 'diretorio david menor que o total', CASE WHEN v_n>0 AND v_n<v_prof THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_d,'authenticated',$q$SELECT count(*) FROM public.get_user_directory_with_fallback() WHERE name ILIKE 'Ana J%' OR name ILIKE 'Rharisom%'$q$); res := res || format(E'\nT9 %s: %s', 'diretorio david inclui Ana Julia e Rharisom', CASE WHEN v_n>=2 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_d,'authenticated',format($q$SELECT count(*) FROM public.get_user_directory_with_fallback() WHERE filial_id=%L$q$,f_link)); res := res || format(E'\nT9 %s: %s', 'diretorio david inclui colaboradores do vinculo adicional', CASE WHEN v_n>=1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_s,'authenticated',$q$SELECT count(*) FROM public.get_user_directory_with_fallback()$q$); res := res || format(E'\nT9 %s: %s', 'diretorio vendedor bloqueado', CASE WHEN v_n=-1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_b,'authenticated',$q$SELECT count(*) FROM public.get_user_directory_with_fallback()$q$); res := res || format(E'\nT9 %s: %s', 'diretorio bruno bloqueado', CASE WHEN v_n=-1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_e,'authenticated',$q$SELECT count(*) FROM public.get_user_directory_with_fallback()$q$); res := res || format(E'\nT9 %s: %s', 'diretorio elton bloqueado', CASE WHEN v_n=-1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_a,'authenticated',$q$SELECT (SELECT count(*) FROM public.search_clients('a',20))+(SELECT count(*) FROM public.search_clients_for_campaigns('a'))$q$); res := res || format(E'\nT10 %s: %s', 'busca clientes admin', CASE WHEN v_n>=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_m,'authenticated',$q$SELECT (SELECT count(*) FROM public.search_clients('a',20))+(SELECT count(*) FROM public.search_clients_for_campaigns('a'))$q$); res := res || format(E'\nT10 %s: %s', 'busca clientes gerente', CASE WHEN v_n>=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_d,'authenticated',$q$SELECT (SELECT count(*) FROM public.search_clients('a',20))+(SELECT count(*) FROM public.search_clients_for_campaigns('a'))$q$); res := res || format(E'\nT10 %s: %s', 'busca clientes david', CASE WHEN v_n>=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_s,'authenticated',$q$SELECT (SELECT count(*) FROM public.search_clients('a',20))+(SELECT count(*) FROM public.search_clients_for_campaigns('a'))$q$); res := res || format(E'\nT10 %s: %s', 'busca clientes vendedor', CASE WHEN v_n>=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_b,'authenticated',$q$SELECT (SELECT count(*) FROM public.search_clients('a',20))+(SELECT count(*) FROM public.search_clients_for_campaigns('a'))$q$); res := res || format(E'\nT10 %s: %s', 'busca clientes bruno', CASE WHEN v_n<=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_e,'authenticated',$q$SELECT (SELECT count(*) FROM public.search_clients('a',20))+(SELECT count(*) FROM public.search_clients_for_campaigns('a'))$q$); res := res || format(E'\nT10 %s: %s', 'busca clientes elton', CASE WHEN v_n<=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(NULL::uuid,'anon',$q$SELECT count(*) FROM public.get_secure_tasks_paginated(100,0,NULL)$q$); res := res || format(E'\nT11 %s: %s', 'anonimo lista', CASE WHEN v_n<=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(NULL::uuid,'anon',format($q$SELECT count(*) FROM public.get_secure_task_by_id(%L,NULL)$q$,task_out)); res := res || format(E'\nT11 %s: %s', 'anonimo tarefa', CASE WHEN v_n<=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(NULL::uuid,'anon',$q$SELECT count(*) FROM public.get_secure_export_data(NULL,NULL,NULL)$q$); res := res || format(E'\nT11 %s: %s', 'anonimo export', CASE WHEN v_n<=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(NULL::uuid,'anon',$q$SELECT count(*) FROM public.get_user_directory_with_fallback()$q$); res := res || format(E'\nT11 %s: %s', 'anonimo diretorio', CASE WHEN v_n<=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(NULL::uuid,'anon',$q$SELECT count(*) FROM public.search_clients('a',20)$q$); res := res || format(E'\nT11 %s: %s', 'anonimo busca', CASE WHEN v_n<=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(NULL::uuid,'anon',$q$SELECT (public.get_user_security_level()<>'none')::int$q$); res := res || format(E'\nT11 %s: %s', 'anonimo nivel', CASE WHEN v_n<=0 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(u_a,'authenticated',format($q$SELECT public.gvps_access_role(%L)::text IS NOT NULL$q$,u_a)); res := res || format(E'\nT12 %s: %s', 'funcao interna bloqueada (logado)', CASE WHEN v_n=-1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  v_n := pg_temp.tq(NULL::uuid,'anon',format($q$SELECT public.gvps_access_role(%L)::text IS NOT NULL$q$,u_a)); res := res || format(E'\nT12 %s: %s', 'funcao interna bloqueada (anonimo)', CASE WHEN v_n=-1 THEN 'PASSOU' ELSE 'FALHOU' END || ' ['||v_n||']');
  SELECT md5(string_agg(p.user_id::text||p.role||p.approval_status||p.employment_status||coalesce(p.filial_id::text,'')||coalesce((SELECT string_agg(r.role::text,',' ORDER BY r.role) FROM user_roles r WHERE r.user_id=p.user_id),''),'|' ORDER BY p.user_id)) INTO h_after FROM profiles p WHERE p.name ILIKE 'Ramon%' OR p.user_id IN (u_b,u_e);
  res := res || E'\nT13 integridade Ramon/Bruno/Elton e atividades: ' || CASE WHEN h_before=h_after AND c_before=(SELECT count(*) FROM tasks) THEN 'PASSOU' ELSE 'FALHOU' END;
  RAISE EXCEPTION 'ROLLBACK_FORCADO %', res;
END
$do$;