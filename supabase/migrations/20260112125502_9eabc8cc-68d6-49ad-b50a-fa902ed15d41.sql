-- =====================================================
-- RPC PAGINADA COM UNION ALL PARA SUPERVISORES
-- Resolve timeout usando LIMIT/OFFSET nativos
-- =====================================================

-- Deletar funções existentes para recriar com novos parâmetros
DROP FUNCTION IF EXISTS get_secure_tasks_with_customer_protection();
DROP FUNCTION IF EXISTS get_secure_tasks_paginated(INTEGER, INTEGER);

-- Nova função paginada com UNION ALL otimizado
CREATE OR REPLACE FUNCTION get_secure_tasks_paginated(
  p_limit INTEGER DEFAULT 200,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  client text,
  clientcode text,
  property text,
  filial text,
  email text,
  phone text,
  responsible text,
  start_date text,
  end_date text,
  start_time text,
  end_time text,
  status text,
  priority text,
  task_type text,
  observations text,
  is_prospect boolean,
  sales_type text,
  sales_value numeric,
  partial_sales_value numeric,
  sales_confirmed boolean,
  photos text[],
  documents text[],
  equipment_list jsonb,
  equipment_quantity integer,
  family_product text,
  check_in_location jsonb,
  initial_km integer,
  final_km integer,
  propertyhectares numeric,
  prospect_notes text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  access_level text,
  is_customer_data_protected boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_user_filial_id uuid;
  v_user_filial_name text;
  v_is_approved boolean;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Get user profile info in one query
  SELECT 
    p.role,
    p.filial_id,
    f.nome,
    (p.approval_status = 'approved')
  INTO v_user_role, v_user_filial_id, v_user_filial_name, v_is_approved
  FROM profiles p
  LEFT JOIN filiais f ON f.id = p.filial_id
  WHERE p.user_id = v_user_id
  LIMIT 1;

  -- Unapproved users get nothing
  IF NOT COALESCE(v_is_approved, false) THEN
    RETURN;
  END IF;

  -- ADMIN/MANAGER: Return all tasks with pagination
  IF v_user_role IN ('admin', 'manager') THEN
    RETURN QUERY
    SELECT 
      t.id, t.name, t.client, t.clientcode, t.property, t.filial,
      t.email, t.phone, t.responsible,
      t.start_date, t.end_date, t.start_time, t.end_time,
      t.status, t.priority, t.task_type, t.observations,
      t.is_prospect, t.sales_type, t.sales_value, t.partial_sales_value, t.sales_confirmed,
      t.photos, t.documents, t.equipment_list, t.equipment_quantity, t.family_product,
      t.check_in_location, t.initial_km, t.final_km, t.propertyhectares, t.prospect_notes,
      t.created_at, t.updated_at, t.created_by,
      'full'::text as access_level,
      false as is_customer_data_protected
    FROM tasks t
    ORDER BY t.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
    RETURN;
  END IF;

  -- SUPERVISOR: UNION ALL - own tasks + same filial tasks (uses indexes)
  IF v_user_role = 'supervisor' AND v_user_filial_name IS NOT NULL THEN
    RETURN QUERY
    -- Part 1: Own tasks
    SELECT 
      t.id, t.name, t.client, t.clientcode, t.property, t.filial,
      t.email, t.phone, t.responsible,
      t.start_date, t.end_date, t.start_time, t.end_time,
      t.status, t.priority, t.task_type, t.observations,
      t.is_prospect, t.sales_type, t.sales_value, t.partial_sales_value, t.sales_confirmed,
      t.photos, t.documents, t.equipment_list, t.equipment_quantity, t.family_product,
      t.check_in_location, t.initial_km, t.final_km, t.propertyhectares, t.prospect_notes,
      t.created_at, t.updated_at, t.created_by,
      'full'::text as access_level,
      false as is_customer_data_protected
    FROM tasks t
    WHERE t.created_by = v_user_id
    
    UNION ALL
    
    -- Part 2: Same filial tasks (excluding own to avoid duplicates)
    SELECT 
      t.id, t.name, t.client, t.clientcode, t.property, t.filial,
      '***@***' as email,
      '(***)***-****' as phone,
      t.responsible,
      t.start_date, t.end_date, t.start_time, t.end_time,
      t.status, t.priority, t.task_type, t.observations,
      t.is_prospect, t.sales_type, t.sales_value, t.partial_sales_value, t.sales_confirmed,
      t.photos, t.documents, t.equipment_list, t.equipment_quantity, t.family_product,
      t.check_in_location, t.initial_km, t.final_km, t.propertyhectares, t.prospect_notes,
      t.created_at, t.updated_at, t.created_by,
      'supervisor'::text as access_level,
      true as is_customer_data_protected
    FROM tasks t
    WHERE t.filial = v_user_filial_name
      AND t.created_by != v_user_id
    
    ORDER BY created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
    RETURN;
  END IF;

  -- OTHER ROLES: Only own tasks
  RETURN QUERY
  SELECT 
    t.id, t.name, t.client, t.clientcode, t.property, t.filial,
    t.email, t.phone, t.responsible,
    t.start_date, t.end_date, t.start_time, t.end_time,
    t.status, t.priority, t.task_type, t.observations,
    t.is_prospect, t.sales_type, t.sales_value, t.partial_sales_value, t.sales_confirmed,
    t.photos, t.documents, t.equipment_list, t.equipment_quantity, t.family_product,
    t.check_in_location, t.initial_km, t.final_km, t.propertyhectares, t.prospect_notes,
    t.created_at, t.updated_at, t.created_by,
    'owner'::text as access_level,
    false as is_customer_data_protected
  FROM tasks t
  WHERE t.created_by = v_user_id
  ORDER BY t.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Manter função antiga como wrapper para compatibilidade (chama a paginada com limite maior)
CREATE OR REPLACE FUNCTION get_secure_tasks_with_customer_protection()
RETURNS TABLE (
  id uuid,
  name text,
  client text,
  clientcode text,
  property text,
  filial text,
  email text,
  phone text,
  responsible text,
  start_date text,
  end_date text,
  start_time text,
  end_time text,
  status text,
  priority text,
  task_type text,
  observations text,
  is_prospect boolean,
  sales_type text,
  sales_value numeric,
  partial_sales_value numeric,
  sales_confirmed boolean,
  photos text[],
  documents text[],
  equipment_list jsonb,
  equipment_quantity integer,
  family_product text,
  check_in_location jsonb,
  initial_km integer,
  final_km integer,
  propertyhectares numeric,
  prospect_notes text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  access_level text,
  is_customer_data_protected boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Wrapper que chama a função paginada com limite de 500
  RETURN QUERY SELECT * FROM get_secure_tasks_paginated(500, 0);
END;
$$;

-- Garantir índices para performance
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_filial ON tasks(filial);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at_desc ON tasks(created_at DESC);

-- Grants
GRANT EXECUTE ON FUNCTION get_secure_tasks_paginated(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_secure_tasks_with_customer_protection() TO authenticated;