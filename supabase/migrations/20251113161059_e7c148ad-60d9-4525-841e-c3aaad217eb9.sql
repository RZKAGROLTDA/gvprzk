-- Recriar função get_secure_tasks_with_customer_protection com suporte para admin e supervisor
CREATE OR REPLACE FUNCTION public.get_secure_tasks_with_customer_protection()
RETURNS TABLE (
  id uuid,
  name text,
  responsible text,
  client text,
  property text,
  filial text,
  task_type text,
  start_date date,
  end_date date,
  start_time text,
  end_time text,
  observations text,
  priority text,
  status text,
  photos text[],
  documents text[],
  check_in_location jsonb,
  initial_km integer,
  final_km integer,
  created_by text,
  created_at timestamptz,
  updated_at timestamptz,
  is_prospect boolean,
  sales_value numeric,
  sales_confirmed boolean,
  propertyhectares integer,
  equipment_quantity integer,
  equipment_list jsonb,
  partial_sales_value numeric,
  clientcode text,
  email text,
  phone text,
  sales_type text,
  family_product text,
  prospect_notes text,
  access_level text,
  is_customer_data_protected boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH user_security_level AS (
    SELECT get_user_security_level() as level
  )
  SELECT 
    t.id,
    t.name,
    t.responsible,
    -- Mascarar client baseado no nível de acesso
    CASE 
      WHEN (SELECT level FROM user_security_level) IN ('admin', 'manager', 'supervisor') THEN t.client
      WHEN (SELECT level FROM user_security_level) = 'rac' THEN t.client
      WHEN t.created_by = auth.uid() THEN t.client
      ELSE '***'
    END as client,
    -- Mascarar property baseado no nível de acesso
    CASE 
      WHEN (SELECT level FROM user_security_level) IN ('admin', 'manager', 'supervisor') THEN t.property
      WHEN (SELECT level FROM user_security_level) = 'rac' THEN t.property
      WHEN t.created_by = auth.uid() THEN t.property
      ELSE '***'
    END as property,
    t.filial,
    t.task_type,
    t.start_date,
    t.end_date,
    t.start_time,
    t.end_time,
    t.observations,
    t.priority,
    t.status,
    t.photos,
    t.documents,
    t.check_in_location,
    t.initial_km,
    t.final_km,
    t.created_by::text,
    t.created_at,
    t.updated_at,
    t.is_prospect,
    -- Mascarar sales_value baseado no nível de acesso
    CASE 
      WHEN (SELECT level FROM user_security_level) IN ('admin', 'manager', 'supervisor') THEN t.sales_value
      WHEN (SELECT level FROM user_security_level) = 'rac' THEN t.sales_value
      WHEN t.created_by = auth.uid() THEN t.sales_value
      ELSE NULL
    END as sales_value,
    t.sales_confirmed,
    t.propertyhectares,
    t.equipment_quantity,
    t.equipment_list,
    -- Mascarar partial_sales_value baseado no nível de acesso
    CASE 
      WHEN (SELECT level FROM user_security_level) IN ('admin', 'manager', 'supervisor') THEN t.partial_sales_value
      WHEN (SELECT level FROM user_security_level) = 'rac' THEN t.partial_sales_value
      WHEN t.created_by = auth.uid() THEN t.partial_sales_value
      ELSE NULL
    END as partial_sales_value,
    t.clientcode,
    -- Mascarar email baseado no nível de acesso
    CASE 
      WHEN (SELECT level FROM user_security_level) IN ('admin', 'manager', 'supervisor') THEN t.email
      WHEN (SELECT level FROM user_security_level) = 'rac' THEN t.email
      WHEN t.created_by = auth.uid() THEN t.email
      ELSE NULL
    END as email,
    -- Mascarar phone baseado no nível de acesso
    CASE 
      WHEN (SELECT level FROM user_security_level) IN ('admin', 'manager', 'supervisor') THEN t.phone
      WHEN (SELECT level FROM user_security_level) = 'rac' THEN t.phone
      WHEN t.created_by = auth.uid() THEN t.phone
      ELSE NULL
    END as phone,
    t.sales_type,
    t.family_product,
    t.prospect_notes,
    (SELECT level FROM user_security_level) as access_level,
    -- Indicar se dados foram mascarados
    CASE 
      WHEN (SELECT level FROM user_security_level) IN ('admin', 'manager', 'supervisor') THEN false
      WHEN (SELECT level FROM user_security_level) = 'rac' THEN false
      WHEN t.created_by = auth.uid() THEN false
      ELSE true
    END as is_customer_data_protected
  FROM tasks t
  WHERE 
    -- Admin vê tudo
    (SELECT level FROM user_security_level) = 'admin'
    OR
    -- Manager vê tudo
    (SELECT level FROM user_security_level) = 'manager'
    OR
    -- Supervisor vê tasks da mesma filial
    (
      (SELECT level FROM user_security_level) = 'supervisor'
      AND EXISTS (
        SELECT 1 
        FROM profiles p1, profiles p2
        WHERE p1.user_id = auth.uid()
          AND p2.user_id = t.created_by
          AND p1.filial_id = p2.filial_id
          AND p1.approval_status = 'approved'
      )
    )
    OR
    -- RAC vê tudo
    (SELECT level FROM user_security_level) = 'rac'
    OR
    -- Usuário vê suas próprias tasks
    t.created_by = auth.uid()
    OR
    -- Usuário vê tasks de vendas baixas da mesma filial
    (
      (SELECT level FROM user_security_level) = 'user'
      AND EXISTS (
        SELECT 1 
        FROM profiles p1, profiles p2
        WHERE p1.user_id = auth.uid()
          AND p2.user_id = t.created_by
          AND p1.filial_id = p2.filial_id
          AND p1.approval_status = 'approved'
          AND COALESCE(t.sales_value, 0) <= 10000
      )
    );
$$;