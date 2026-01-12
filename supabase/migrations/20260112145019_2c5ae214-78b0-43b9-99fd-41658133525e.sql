-- Optimize paginated RPC with increased timeout and removed UNION
CREATE OR REPLACE FUNCTION public.get_secure_tasks_paginated(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  name text,
  client text,
  clientcode text,
  property text,
  propertyhectares numeric,
  responsible text,
  start_date text,
  start_time text,
  end_date text,
  end_time text,
  priority text,
  status text,
  task_type text,
  filial text,
  created_by uuid,
  created_at text,
  updated_at text,
  observations text,
  email text,
  phone text,
  sales_value numeric,
  sales_type text,
  sales_confirmed boolean,
  partial_sales_value numeric,
  is_prospect boolean,
  prospect_notes text,
  initial_km numeric,
  final_km numeric,
  family_product text,
  equipment_quantity integer,
  equipment_list jsonb,
  check_in_location jsonb,
  photos text[],
  documents text[],
  access_level text,
  is_customer_data_protected boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '120s'
AS $function$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_user_filial_id UUID;
  v_is_approved BOOLEAN;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT p.role, p.filial_id, (p.approval_status = 'approved')
  INTO v_user_role, v_user_filial_id, v_is_approved
  FROM profiles p
  WHERE p.user_id = v_user_id
  LIMIT 1;

  IF NOT COALESCE(v_is_approved, FALSE) THEN
    RETURN;
  END IF;

  -- Manager/Admin: all tasks
  IF v_user_role IN ('manager', 'admin') THEN
    RETURN QUERY
    SELECT
      t.id,
      t.name,
      t.client,
      t.clientcode,
      t.property,
      t.propertyhectares::numeric,
      t.responsible,
      t.start_date::TEXT,
      t.start_time::TEXT,
      t.end_date::TEXT,
      t.end_time::TEXT,
      t.priority,
      t.status,
      t.task_type,
      t.filial,
      t.created_by,
      t.created_at::TEXT,
      t.updated_at::TEXT,
      t.observations,
      t.email,
      t.phone,
      t.sales_value::numeric,
      t.sales_type,
      t.sales_confirmed,
      t.partial_sales_value::numeric,
      t.is_prospect,
      t.prospect_notes,
      t.initial_km::numeric,
      t.final_km::numeric,
      t.family_product,
      t.equipment_quantity::integer,
      t.equipment_list,
      t.check_in_location,
      t.photos,
      t.documents,
      'full'::TEXT,
      FALSE
    FROM tasks t
    ORDER BY t.created_at DESC
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  -- Supervisor: single query with inline masking
  IF v_user_role = 'supervisor' AND v_user_filial_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      t.id,
      t.name,
      t.client,
      t.clientcode,
      t.property,
      t.propertyhectares::numeric,
      t.responsible,
      t.start_date::TEXT,
      t.start_time::TEXT,
      t.end_date::TEXT,
      t.end_time::TEXT,
      t.priority,
      t.status,
      t.task_type,
      t.filial,
      t.created_by,
      t.created_at::TEXT,
      t.updated_at::TEXT,
      CASE WHEN t.created_by = v_user_id THEN t.observations ELSE NULL END,
      CASE WHEN t.created_by = v_user_id THEN t.email ELSE '***@***.***' END,
      CASE WHEN t.created_by = v_user_id THEN t.phone ELSE '(**) *****-****' END,
      t.sales_value::numeric,
      t.sales_type,
      t.sales_confirmed,
      t.partial_sales_value::numeric,
      t.is_prospect,
      CASE WHEN t.created_by = v_user_id THEN t.prospect_notes ELSE NULL END,
      t.initial_km::numeric,
      t.final_km::numeric,
      t.family_product,
      t.equipment_quantity::integer,
      t.equipment_list,
      t.check_in_location,
      t.photos,
      t.documents,
      CASE WHEN t.created_by = v_user_id THEN 'full'::text ELSE 'filial'::text END,
      CASE WHEN t.created_by = v_user_id THEN FALSE ELSE TRUE END
    FROM tasks t
    WHERE t.created_by = v_user_id
       OR t.created_by IN (
         SELECT p.user_id FROM profiles p
         WHERE p.filial_id = v_user_filial_id
           AND p.approval_status = 'approved'
       )
    ORDER BY t.created_at DESC
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  -- Regular users: own tasks only
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.client,
    t.clientcode,
    t.property,
    t.propertyhectares::numeric,
    t.responsible,
    t.start_date::TEXT,
    t.start_time::TEXT,
    t.end_date::TEXT,
    t.end_time::TEXT,
    t.priority,
    t.status,
    t.task_type,
    t.filial,
    t.created_by,
    t.created_at::TEXT,
    t.updated_at::TEXT,
    t.observations,
    t.email,
    t.phone,
    t.sales_value::numeric,
    t.sales_type,
    t.sales_confirmed,
    t.partial_sales_value::numeric,
    t.is_prospect,
    t.prospect_notes,
    t.initial_km::numeric,
    t.final_km::numeric,
    t.family_product,
    t.equipment_quantity::integer,
    t.equipment_list,
    t.check_in_location,
    t.photos,
    t.documents,
    'full'::TEXT,
    FALSE
  FROM tasks t
  WHERE t.created_by = v_user_id
  ORDER BY t.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;