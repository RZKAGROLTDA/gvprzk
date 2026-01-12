
-- Optimized function for supervisors - uses JOIN instead of EXISTS subquery
CREATE OR REPLACE FUNCTION public.get_secure_tasks_with_customer_protection()
 RETURNS TABLE(id uuid, name text, responsible text, client text, property text, filial text, task_type text, start_date text, end_date text, start_time text, end_time text, observations text, priority text, status text, photos text[], documents text[], check_in_location jsonb, initial_km integer, final_km integer, created_by text, created_at timestamp with time zone, updated_at timestamp with time zone, is_prospect boolean, sales_value numeric, sales_confirmed boolean, propertyhectares integer, equipment_quantity integer, equipment_list jsonb, partial_sales_value numeric, clientcode text, email text, phone text, sales_type text, family_product text, prospect_notes text, access_level text, is_customer_data_protected boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_level text;
  v_user_filial_id uuid;
  v_current_user_id uuid;
BEGIN
  -- Cache user id for better performance
  v_current_user_id := auth.uid();
  
  -- Get user security level
  v_user_level := get_user_security_level();
  
  -- Get user filial (for supervisor) - single query
  SELECT p.filial_id INTO v_user_filial_id
  FROM profiles p
  WHERE p.user_id = v_current_user_id
  AND p.approval_status = 'approved'
  LIMIT 1;

  -- Admin/Manager/RAC: return all tasks directly
  IF v_user_level IN ('admin', 'manager', 'rac') THEN
    RETURN QUERY
    SELECT 
      t.id, t.name, t.responsible, t.client, t.property, t.filial, t.task_type,
      t.start_date::text, t.end_date::text, t.start_time, t.end_time, t.observations,
      t.priority, t.status, t.photos, t.documents, t.check_in_location,
      t.initial_km, t.final_km, t.created_by::text, t.created_at, t.updated_at,
      t.is_prospect, t.sales_value, t.sales_confirmed, t.propertyhectares,
      t.equipment_quantity, t.equipment_list, t.partial_sales_value, t.clientcode,
      t.email, t.phone, t.sales_type, t.family_product, t.prospect_notes,
      v_user_level as access_level,
      false as is_customer_data_protected
    FROM tasks t;
    RETURN;
  END IF;

  -- Supervisor: use optimized JOIN instead of EXISTS subquery
  IF v_user_level = 'supervisor' AND v_user_filial_id IS NOT NULL THEN
    RETURN QUERY
    SELECT DISTINCT
      t.id, t.name, t.responsible, t.client, t.property, t.filial, t.task_type,
      t.start_date::text, t.end_date::text, t.start_time, t.end_time, t.observations,
      t.priority, t.status, t.photos, t.documents, t.check_in_location,
      t.initial_km, t.final_km, t.created_by::text, t.created_at, t.updated_at,
      t.is_prospect, t.sales_value, t.sales_confirmed, t.propertyhectares,
      t.equipment_quantity, t.equipment_list, t.partial_sales_value, t.clientcode,
      t.email, t.phone, t.sales_type, t.family_product, t.prospect_notes,
      v_user_level as access_level,
      false as is_customer_data_protected
    FROM tasks t
    INNER JOIN profiles p ON p.user_id = t.created_by
    WHERE p.filial_id = v_user_filial_id
      AND p.approval_status = 'approved';
    RETURN;
  END IF;

  -- Consultant/others: only their own tasks with masked data for others
  RETURN QUERY
  SELECT 
    t.id, t.name, t.responsible,
    CASE WHEN t.created_by = v_current_user_id THEN t.client ELSE '***'::text END as client,
    CASE WHEN t.created_by = v_current_user_id THEN t.property ELSE '***'::text END as property,
    t.filial, t.task_type,
    t.start_date::text, t.end_date::text, t.start_time, t.end_time, t.observations,
    t.priority, t.status, t.photos, t.documents, t.check_in_location,
    t.initial_km, t.final_km, t.created_by::text, t.created_at, t.updated_at,
    t.is_prospect,
    CASE WHEN t.created_by = v_current_user_id THEN t.sales_value ELSE NULL::numeric END as sales_value,
    t.sales_confirmed, t.propertyhectares, t.equipment_quantity, t.equipment_list,
    CASE WHEN t.created_by = v_current_user_id THEN t.partial_sales_value ELSE NULL::numeric END as partial_sales_value,
    t.clientcode,
    CASE WHEN t.created_by = v_current_user_id THEN t.email ELSE NULL::text END as email,
    CASE WHEN t.created_by = v_current_user_id THEN t.phone ELSE NULL::text END as phone,
    t.sales_type, t.family_product, t.prospect_notes,
    v_user_level as access_level,
    (t.created_by != v_current_user_id) as is_customer_data_protected
  FROM tasks t
  WHERE t.created_by = v_current_user_id;
END;
$function$;

-- Add composite index for supervisor join optimization
CREATE INDEX IF NOT EXISTS idx_profiles_filial_approval 
ON profiles(filial_id, approval_status) 
WHERE approval_status = 'approved';
