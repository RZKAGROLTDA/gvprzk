CREATE OR REPLACE FUNCTION public.get_secure_tasks_paginated(p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, client text, clientcode text, property text, filial text, filial_atendida text, email text, phone text, responsible text, start_date text, end_date text, start_time text, end_time text, status text, priority text, task_type text, observations text, is_prospect boolean, sales_type text, sales_value numeric, partial_sales_value numeric, sales_confirmed boolean, equipment_quantity integer, family_product text, check_in_location jsonb, initial_km integer, final_km integer, propertyhectares numeric, prospect_notes text, technical_visit_data jsonb, technical_funnel_stage text, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, access_level text, is_customer_data_protected boolean)
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
      t.check_in_location, t.initial_km, t.final_km, t.propertyhectares::numeric, t.prospect_notes,
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
        t.check_in_location, t.initial_km, t.final_km, t.propertyhectares::numeric AS propertyhectares, t.prospect_notes,
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
        t.check_in_location, t.initial_km, t.final_km, t.propertyhectares::numeric, t.prospect_notes,
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
    t.check_in_location, t.initial_km, t.final_km, t.propertyhectares::numeric, t.prospect_notes,
    NULL::jsonb, t.technical_funnel_stage,
    t.created_at, t.updated_at, t.created_by,
    'owner'::text, false
  FROM public.tasks t
  WHERE t.created_by = v_user_id
  ORDER BY t.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_secure_tasks_paginated(integer, integer) TO authenticated, service_role;