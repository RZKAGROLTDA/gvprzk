DROP FUNCTION IF EXISTS public.get_secure_tasks_paginated(integer, integer);

CREATE OR REPLACE FUNCTION public.get_secure_tasks_paginated(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_filial_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, client text, clientcode text, property text, filial text, filial_atendida text, email text, phone text, responsible text, start_date text, end_date text, start_time text, end_time text, status text, priority text, task_type text, observations text, is_prospect boolean, sales_type text, sales_value numeric, partial_sales_value numeric, sales_confirmed boolean, equipment_quantity integer, family_product text, check_in_location jsonb, initial_km integer, final_km integer, propertyhectares numeric, prospect_notes text, technical_visit_data jsonb, technical_funnel_stage text, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, access_level text, is_customer_data_protected boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_is_approved boolean;
  v_eff uuid[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;

  SELECT p.role,
         (p.approval_status = 'approved' AND p.employment_status = 'active')
  INTO v_user_role, v_is_approved
  FROM public.profiles p
  WHERE p.user_id = v_user_id
  LIMIT 1;

  IF NOT COALESCE(v_is_approved, false) THEN RETURN; END IF;

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

REVOKE ALL ON FUNCTION public.get_secure_tasks_paginated(integer, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_secure_tasks_paginated(integer, integer, uuid) TO authenticated;