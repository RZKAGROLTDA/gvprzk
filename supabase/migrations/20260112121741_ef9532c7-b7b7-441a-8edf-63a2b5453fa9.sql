
-- Further optimize supervisor filtering by using tasks.filial (indexed) instead of per-row profile checks
CREATE OR REPLACE FUNCTION public.get_secure_tasks_with_customer_protection()
 RETURNS TABLE(id uuid, name text, responsible text, client text, property text, filial text, task_type text, start_date text, end_date text, start_time text, end_time text, observations text, priority text, status text, photos text[], documents text[], check_in_location jsonb, initial_km integer, final_km integer, created_by text, created_at timestamp with time zone, updated_at timestamp with time zone, is_prospect boolean, sales_value numeric, sales_confirmed boolean, propertyhectares integer, equipment_quantity integer, equipment_list jsonb, partial_sales_value numeric, clientcode text, email text, phone text, sales_type text, family_product text, prospect_notes text, access_level text, is_customer_data_protected boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_level text;
  v_user_filial_id uuid;
  v_user_filial_name text;
  v_current_user_id uuid;
BEGIN
  v_current_user_id := auth.uid();

  -- If no auth, return nothing
  IF v_current_user_id IS NULL THEN
    RETURN;
  END IF;

  v_user_level := get_user_security_level();

  -- Get user's filial id (used by supervisor)
  SELECT p.filial_id INTO v_user_filial_id
  FROM profiles p
  WHERE p.user_id = v_current_user_id
    AND p.approval_status = 'approved'
  LIMIT 1;

  -- Admin/Manager/RAC: full access
  IF v_user_level IN ('admin', 'manager', 'rac') THEN
    RETURN QUERY
    SELECT 
      t.id,
      t.name,
      t.responsible,
      t.client,
      t.property,
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
      t.sales_value,
      t.sales_confirmed,
      t.propertyhectares,
      t.equipment_quantity,
      t.equipment_list,
      t.partial_sales_value,
      t.clientcode,
      t.email,
      t.phone,
      t.sales_type,
      t.family_product,
      t.prospect_notes,
      v_user_level as access_level,
      false as is_customer_data_protected
    FROM tasks t;
    RETURN;
  END IF;

  -- Supervisor: filter by filial name (fast, uses idx_tasks_filial)
  IF v_user_level = 'supervisor' AND v_user_filial_id IS NOT NULL THEN
    SELECT f.nome INTO v_user_filial_name
    FROM filiais f
    WHERE f.id = v_user_filial_id
    LIMIT 1;

    IF v_user_filial_name IS NOT NULL THEN
      RETURN QUERY
      SELECT 
        t.id,
        t.name,
        t.responsible,
        t.client,
        t.property,
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
        t.sales_value,
        t.sales_confirmed,
        t.propertyhectares,
        t.equipment_quantity,
        t.equipment_list,
        t.partial_sales_value,
        t.clientcode,
        t.email,
        t.phone,
        t.sales_type,
        t.family_product,
        t.prospect_notes,
        v_user_level as access_level,
        false as is_customer_data_protected
      FROM tasks t
      WHERE (t.filial = v_user_filial_name)
         OR (t.created_by = v_current_user_id);
      RETURN;
    END IF;

    -- Supervisor without filial name -> fall back to own tasks
    RETURN QUERY
    SELECT 
      t.id,
      t.name,
      t.responsible,
      t.client,
      t.property,
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
      t.sales_value,
      t.sales_confirmed,
      t.propertyhectares,
      t.equipment_quantity,
      t.equipment_list,
      t.partial_sales_value,
      t.clientcode,
      t.email,
      t.phone,
      t.sales_type,
      t.family_product,
      t.prospect_notes,
      v_user_level as access_level,
      false as is_customer_data_protected
    FROM tasks t
    WHERE t.created_by = v_current_user_id;
    RETURN;
  END IF;

  -- Default: only own tasks
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    t.client,
    t.property,
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
    t.sales_value,
    t.sales_confirmed,
    t.propertyhectares,
    t.equipment_quantity,
    t.equipment_list,
    t.partial_sales_value,
    t.clientcode,
    t.email,
    t.phone,
    t.sales_type,
    t.family_product,
    t.prospect_notes,
    v_user_level as access_level,
    false as is_customer_data_protected
  FROM tasks t
  WHERE t.created_by = v_current_user_id;
END;
$function$;
