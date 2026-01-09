-- Dropar função antiga e recriar com filtro correto
DROP FUNCTION IF EXISTS get_secure_tasks_with_customer_protection();

-- Recriar função: consultant só vê suas próprias tasks (remover brecha de vendas baixas)
CREATE OR REPLACE FUNCTION get_secure_tasks_with_customer_protection()
RETURNS TABLE (
  id uuid,
  name text,
  responsible text,
  client text,
  property text,
  filial text,
  task_type text,
  start_date text,
  end_date text,
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_level text;
  v_user_filial_id uuid;
BEGIN
  -- Obter nível de segurança do usuário
  v_user_level := get_user_security_level();
  
  -- Obter filial do usuário (para supervisor)
  SELECT p.filial_id INTO v_user_filial_id
  FROM profiles p
  WHERE p.user_id = auth.uid()
  AND p.approval_status = 'approved';

  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    -- Mascarar client baseado no nível de acesso
    CASE 
      WHEN v_user_level IN ('admin', 'manager', 'supervisor', 'rac') THEN t.client
      WHEN t.created_by = auth.uid() THEN t.client
      ELSE '***'::text
    END as client,
    -- Mascarar property baseado no nível de acesso
    CASE 
      WHEN v_user_level IN ('admin', 'manager', 'supervisor', 'rac') THEN t.property
      WHEN t.created_by = auth.uid() THEN t.property
      ELSE '***'::text
    END as property,
    t.filial,
    t.task_type,
    t.start_date::text,
    t.end_date::text,
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
      WHEN v_user_level IN ('admin', 'manager', 'supervisor', 'rac') THEN t.sales_value
      WHEN t.created_by = auth.uid() THEN t.sales_value
      ELSE NULL::numeric
    END as sales_value,
    t.sales_confirmed,
    t.propertyhectares,
    t.equipment_quantity,
    t.equipment_list,
    -- Mascarar partial_sales_value baseado no nível de acesso
    CASE 
      WHEN v_user_level IN ('admin', 'manager', 'supervisor', 'rac') THEN t.partial_sales_value
      WHEN t.created_by = auth.uid() THEN t.partial_sales_value
      ELSE NULL::numeric
    END as partial_sales_value,
    t.clientcode,
    -- Mascarar email baseado no nível de acesso
    CASE 
      WHEN v_user_level IN ('admin', 'manager', 'supervisor', 'rac') THEN t.email
      WHEN t.created_by = auth.uid() THEN t.email
      ELSE NULL::text
    END as email,
    -- Mascarar phone baseado no nível de acesso
    CASE 
      WHEN v_user_level IN ('admin', 'manager', 'supervisor', 'rac') THEN t.phone
      WHEN t.created_by = auth.uid() THEN t.phone
      ELSE NULL::text
    END as phone,
    t.sales_type,
    t.family_product,
    t.prospect_notes,
    v_user_level as access_level,
    -- Indicar se dados foram mascarados
    CASE 
      WHEN v_user_level IN ('admin', 'manager', 'supervisor', 'rac') THEN false
      WHEN t.created_by = auth.uid() THEN false
      ELSE true
    END as is_customer_data_protected
  FROM tasks t
  WHERE 
    -- Admin/Manager/RAC vê tudo
    v_user_level IN ('admin', 'manager', 'rac')
    OR
    -- Supervisor vê tasks da mesma filial
    (
      v_user_level = 'supervisor'
      AND EXISTS (
        SELECT 1 
        FROM profiles p
        WHERE p.user_id = t.created_by
          AND p.filial_id = v_user_filial_id
          AND p.approval_status = 'approved'
      )
    )
    OR
    -- Consultant/outros só veem suas próprias tasks
    t.created_by = auth.uid();
END;
$$;

-- Também corrigir a RLS policy da tabela tasks para remover a brecha
DROP POLICY IF EXISTS "secure_task_select_enhanced" ON tasks;

CREATE POLICY "secure_task_select_enhanced" ON tasks
FOR SELECT USING (
  -- Próprio usuário
  auth.uid() = created_by
  OR
  -- Manager vê tudo
  has_role(auth.uid(), 'manager'::app_role)
  OR
  -- Supervisor vê tasks da mesma filial
  (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND EXISTS (
      SELECT 1 FROM profiles p
      JOIN filiais f ON p.filial_id = f.id
      WHERE p.user_id = auth.uid()
        AND p.approval_status = 'approved'
        AND f.nome = tasks.filial
    )
  )
);