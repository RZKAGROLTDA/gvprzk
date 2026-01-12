-- Corrigir lógica: filtrar por t.filial (filial da TASK), não pela filial do criador
DROP FUNCTION IF EXISTS public.get_secure_tasks_paginated(integer,integer);

CREATE OR REPLACE FUNCTION public.get_secure_tasks_paginated(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  name text,
  client text,
  clientcode text,
  property text,
  propertyhectares double precision,
  responsible text,
  start_date date,
  end_date date,
  start_time text,
  end_time text,
  priority text,
  status text,
  task_type text,
  observations text,
  photos text[],
  documents text[],
  initial_km double precision,
  final_km double precision,
  equipment_quantity integer,
  equipment_list jsonb,
  family_product text,
  email text,
  phone text,
  filial text,
  is_prospect boolean,
  prospect_notes text,
  sales_confirmed boolean,
  sales_type text,
  sales_value double precision,
  partial_sales_value double precision,
  check_in_location jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  access_level text,
  is_customer_data_protected boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_user_filial_id uuid;
  v_user_filial_nome text;
  v_is_approved boolean;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Buscar role, filial_id e nome da filial do usuário
  SELECT p.role, p.filial_id, f.nome, (p.approval_status = 'approved')
  INTO v_user_role, v_user_filial_id, v_user_filial_nome, v_is_approved
  FROM profiles p
  LEFT JOIN filiais f ON p.filial_id = f.id
  WHERE p.user_id = v_user_id;

  IF NOT COALESCE(v_is_approved, false) THEN
    RETURN;
  END IF;

  -- Admin e Manager: todas as tasks
  IF v_user_role IN ('admin', 'manager') THEN
    RETURN QUERY
    SELECT 
      t.id, t.name, t.client, t.clientcode, t.property,
      t.propertyhectares::double precision, t.responsible,
      t.start_date::date, t.end_date::date, t.start_time, t.end_time,
      t.priority, t.status, t.task_type, t.observations,
      t.photos, t.documents,
      t.initial_km::double precision, t.final_km::double precision,
      t.equipment_quantity::integer, t.equipment_list,
      t.family_product, t.email, t.phone, t.filial,
      t.is_prospect, t.prospect_notes, t.sales_confirmed,
      t.sales_type, t.sales_value::double precision,
      t.partial_sales_value::double precision, t.check_in_location,
      t.created_at, t.updated_at, t.created_by,
      'full'::text as access_level,
      false as is_customer_data_protected
    FROM tasks t
    ORDER BY t.created_at DESC
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  -- Supervisor: tasks onde t.filial = nome da filial do supervisor
  IF v_user_role = 'supervisor' THEN
    RETURN QUERY
    SELECT 
      t.id, t.name, t.client, t.clientcode, t.property,
      t.propertyhectares::double precision, t.responsible,
      t.start_date::date, t.end_date::date, t.start_time, t.end_time,
      t.priority, t.status, t.task_type, t.observations,
      t.photos, t.documents,
      t.initial_km::double precision, t.final_km::double precision,
      t.equipment_quantity::integer, t.equipment_list,
      t.family_product,
      CASE WHEN t.created_by = v_user_id THEN t.email ELSE '***@***.***' END,
      CASE WHEN t.created_by = v_user_id THEN t.phone ELSE '(**) *****-****' END,
      t.filial, t.is_prospect, t.prospect_notes, t.sales_confirmed,
      t.sales_type, t.sales_value::double precision,
      t.partial_sales_value::double precision, t.check_in_location,
      t.created_at, t.updated_at, t.created_by,
      CASE WHEN t.created_by = v_user_id THEN 'full' ELSE 'filial' END::text,
      (t.created_by != v_user_id) as is_customer_data_protected
    FROM tasks t
    WHERE t.filial = v_user_filial_nome
    ORDER BY t.created_at DESC
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  -- Outros roles: apenas próprias tasks
  RETURN QUERY
  SELECT 
    t.id, t.name, t.client, t.clientcode, t.property,
    t.propertyhectares::double precision, t.responsible,
    t.start_date::date, t.end_date::date, t.start_time, t.end_time,
    t.priority, t.status, t.task_type, t.observations,
    t.photos, t.documents,
    t.initial_km::double precision, t.final_km::double precision,
    t.equipment_quantity::integer, t.equipment_list,
    t.family_product, t.email, t.phone, t.filial,
    t.is_prospect, t.prospect_notes, t.sales_confirmed,
    t.sales_type, t.sales_value::double precision,
    t.partial_sales_value::double precision, t.check_in_location,
    t.created_at, t.updated_at, t.created_by,
    'full'::text as access_level,
    false as is_customer_data_protected
  FROM tasks t
  WHERE t.created_by = v_user_id
  ORDER BY t.created_at DESC
  LIMIT p_limit OFFSET p_offset;

END;
$function$;