-- RPC para buscar uma única task por ID com as mesmas regras de segurança de get_secure_tasks_paginated.
-- Reduz Disk I/O ao evitar carregar 500 tasks quando o cliente só precisa dos detalhes de uma.
CREATE OR REPLACE FUNCTION public.get_secure_task_by_id(p_task_id uuid)
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
  filial_atendida text,
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
SET statement_timeout TO '10s'
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

  SELECT p.role, p.filial_id, f.nome, (p.approval_status = 'approved')
  INTO v_user_role, v_user_filial_id, v_user_filial_nome, v_is_approved
  FROM profiles p
  LEFT JOIN filiais f ON p.filial_id = f.id
  WHERE p.user_id = v_user_id;

  IF NOT COALESCE(v_is_approved, false) THEN
    RETURN;
  END IF;

  -- Admin e Manager: retornar a task se existir
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
      t.family_product, t.email, t.phone, t.filial, t.filial_atendida,
      t.is_prospect, t.prospect_notes, t.sales_confirmed,
      t.sales_type, t.sales_value::double precision,
      t.partial_sales_value::double precision, t.check_in_location,
      t.created_at, t.updated_at, t.created_by,
      'full'::text, false
    FROM tasks t
    WHERE t.id = p_task_id
    LIMIT 1;
    RETURN;
  END IF;

  -- Supervisor: só se a task for da filial do supervisor
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
      t.filial, t.filial_atendida, t.is_prospect, t.prospect_notes, t.sales_confirmed,
      t.sales_type, t.sales_value::double precision,
      t.partial_sales_value::double precision, t.check_in_location,
      t.created_at, t.updated_at, t.created_by,
      CASE WHEN t.created_by = v_user_id THEN 'full' ELSE 'filial' END::text,
      (t.created_by != v_user_id)
    FROM tasks t
    WHERE t.id = p_task_id AND t.filial = v_user_filial_nome
    LIMIT 1;
    RETURN;
  END IF;

  -- Outros roles: apenas se for dono da task
  RETURN QUERY
  SELECT 
    t.id, t.name, t.client, t.clientcode, t.property,
    t.propertyhectares::double precision, t.responsible,
    t.start_date::date, t.end_date::date, t.start_time, t.end_time,
    t.priority, t.status, t.task_type, t.observations,
    t.photos, t.documents,
    t.initial_km::double precision, t.final_km::double precision,
    t.equipment_quantity::integer, t.equipment_list,
    t.family_product, t.email, t.phone, t.filial, t.filial_atendida,
    t.is_prospect, t.prospect_notes, t.sales_confirmed,
    t.sales_type, t.sales_value::double precision,
    t.partial_sales_value::double precision, t.check_in_location,
    t.created_at, t.updated_at, t.created_by,
    'full'::text, false
  FROM tasks t
  WHERE t.id = p_task_id AND t.created_by = v_user_id
  LIMIT 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_secure_task_by_id(uuid) TO authenticated;
