-- Criar função RPC para buscar todas as tasks de forma segura
CREATE OR REPLACE FUNCTION public.get_all_secure_tasks()
RETURNS TABLE (
  id uuid,
  name text,
  responsible text,
  client text,
  property text,
  filial text,
  email text,
  phone text,
  sales_value numeric,
  is_masked boolean,
  access_level text,
  start_date date,
  end_date date,
  status text,
  priority text,
  task_type text,
  observations text,
  created_at timestamp with time zone,
  created_by uuid,
  updated_at timestamp with time zone,
  is_prospect boolean,
  sales_confirmed boolean,
  equipment_quantity integer,
  equipment_list jsonb,
  propertyhectares integer,
  initial_km integer,
  final_km integer,
  check_in_location jsonb,
  clientcode text,
  sales_type text,
  start_time text,
  end_time text,
  prospect_notes text,
  family_product text,
  photos text[],
  documents text[],
  partial_sales_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_role text;
  current_user_filial uuid;
BEGIN
  -- Verificar se usuário está logado
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  
  -- Obter role e filial do usuário atual
  SELECT role, filial_id INTO current_user_role, current_user_filial
  FROM profiles 
  WHERE user_id = auth.uid() 
  AND approval_status = 'approved'
  LIMIT 1;
  
  -- Se não tem perfil aprovado, retornar vazio
  IF current_user_role IS NULL THEN
    RETURN;
  END IF;
  
  -- Retornar tasks baseado no nível de acesso
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.client
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.client
      WHEN COALESCE(t.sales_value, 0) <= 25000 THEN t.client
      ELSE '***'
    END as client,
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.property
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.property
      WHEN COALESCE(t.sales_value, 0) <= 25000 THEN t.property
      ELSE '***'
    END as property,
    t.filial,
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.email
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.email
      WHEN COALESCE(t.sales_value, 0) <= 25000 THEN t.email
      ELSE '***@***.***'
    END as email,
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.phone
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.phone
      WHEN COALESCE(t.sales_value, 0) <= 25000 THEN t.phone
      ELSE '***'
    END as phone,
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.sales_value
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.sales_value
      WHEN COALESCE(t.sales_value, 0) <= 25000 THEN t.sales_value
      ELSE NULL
    END as sales_value,
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN false
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN false
      WHEN COALESCE(t.sales_value, 0) <= 25000 THEN false
      ELSE true
    END as is_masked,
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN t.created_by = auth.uid() THEN 'owner'
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN 'supervisor'
      ELSE 'limited'
    END as access_level,
    t.start_date,
    t.end_date,
    t.status,
    t.priority,
    t.task_type,
    t.observations,
    t.created_at,
    t.created_by,
    t.updated_at,
    t.is_prospect,
    t.sales_confirmed,
    t.equipment_quantity,
    t.equipment_list,
    t.propertyhectares,
    t.initial_km,
    t.final_km,
    t.check_in_location,
    t.clientcode,
    t.sales_type,
    t.start_time,
    t.end_time,
    t.prospect_notes,
    t.family_product,
    t.photos,
    t.documents,
    t.partial_sales_value
  FROM tasks t
  WHERE (
    -- Manager vê tudo
    current_user_role = 'manager' OR
    -- Usuário vê suas próprias tasks
    t.created_by = auth.uid() OR
    -- Supervisor vê tasks da mesma filial
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.user_id = t.created_by 
      AND p.filial_id = current_user_filial
    )) OR
    -- Consultants vêem tasks de baixo valor da mesma filial
    (current_user_role IN ('consultant', 'rac', 'sales_consultant', 'technical_consultant') 
     AND EXISTS (
       SELECT 1 FROM profiles p 
       WHERE p.user_id = t.created_by 
       AND p.filial_id = current_user_filial
     ) 
     AND COALESCE(t.sales_value, 0) <= 25000)
  )
  ORDER BY t.created_at DESC
  LIMIT 500;
END;
$$;