
-- Drop existing function and recreate with correct types
DROP FUNCTION IF EXISTS public.get_secure_tasks_paginated(INTEGER, INTEGER);

CREATE FUNCTION public.get_secure_tasks_paginated(p_limit INTEGER DEFAULT 100, p_offset INTEGER DEFAULT 0)
RETURNS TABLE(
  id UUID,
  name TEXT,
  client TEXT,
  clientcode TEXT,
  property TEXT,
  propertyhectares NUMERIC,
  responsible TEXT,
  start_date TEXT,
  start_time TEXT,
  end_date TEXT,
  end_time TEXT,
  priority TEXT,
  status TEXT,
  task_type TEXT,
  filial TEXT,
  created_by UUID,
  created_at TEXT,
  updated_at TEXT,
  observations TEXT,
  email TEXT,
  phone TEXT,
  sales_value NUMERIC,
  sales_type TEXT,
  sales_confirmed BOOLEAN,
  partial_sales_value NUMERIC,
  is_prospect BOOLEAN,
  prospect_notes TEXT,
  initial_km NUMERIC,
  final_km NUMERIC,
  family_product TEXT,
  equipment_quantity INTEGER,
  equipment_list JSONB,
  check_in_location JSONB,
  photos TEXT[],
  documents TEXT[],
  access_level TEXT,
  is_customer_data_protected BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      t.propertyhectares,
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
      t.sales_value,
      t.sales_type,
      t.sales_confirmed,
      t.partial_sales_value,
      t.is_prospect,
      t.prospect_notes,
      t.initial_km,
      t.final_km,
      t.family_product,
      t.equipment_quantity,
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

  -- Supervisor: own tasks + filial tasks (using UNION ALL for performance)
  IF v_user_role = 'supervisor' AND v_user_filial_id IS NOT NULL THEN
    RETURN QUERY
    WITH filial_users AS (
      SELECT p.user_id 
      FROM profiles p 
      WHERE p.filial_id = v_user_filial_id 
        AND p.approval_status = 'approved'
    ),
    combined_tasks AS (
      -- Own tasks
      SELECT t.*, 'full'::TEXT AS al, FALSE AS ip
      FROM tasks t
      WHERE t.created_by = v_user_id
      
      UNION ALL
      
      -- Filial tasks (excluding own to avoid duplicates)
      SELECT t.*, 'filial'::TEXT AS al, TRUE AS ip
      FROM tasks t
      WHERE t.created_by IN (SELECT fu.user_id FROM filial_users fu)
        AND t.created_by != v_user_id
    )
    SELECT 
      ct.id,
      ct.name,
      ct.client,
      ct.clientcode,
      ct.property,
      ct.propertyhectares,
      ct.responsible,
      ct.start_date::TEXT,
      ct.start_time::TEXT,
      ct.end_date::TEXT,
      ct.end_time::TEXT,
      ct.priority,
      ct.status,
      ct.task_type,
      ct.filial,
      ct.created_by,
      ct.created_at::TEXT,
      ct.updated_at::TEXT,
      CASE WHEN ct.ip THEN NULL ELSE ct.observations END,
      CASE WHEN ct.ip THEN '***@***.***' ELSE ct.email END,
      CASE WHEN ct.ip THEN '(**) *****-****' ELSE ct.phone END,
      ct.sales_value,
      ct.sales_type,
      ct.sales_confirmed,
      ct.partial_sales_value,
      ct.is_prospect,
      CASE WHEN ct.ip THEN NULL ELSE ct.prospect_notes END,
      ct.initial_km,
      ct.final_km,
      ct.family_product,
      ct.equipment_quantity,
      ct.equipment_list,
      ct.check_in_location,
      ct.photos,
      ct.documents,
      ct.al,
      ct.ip
    FROM combined_tasks ct
    ORDER BY ct.created_at DESC
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
    t.propertyhectares,
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
    t.sales_value,
    t.sales_type,
    t.sales_confirmed,
    t.partial_sales_value,
    t.is_prospect,
    t.prospect_notes,
    t.initial_km,
    t.final_km,
    t.family_product,
    t.equipment_quantity,
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
$$;
