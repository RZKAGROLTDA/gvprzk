-- Atualizar função para supervisores verem todos os registros da filial
CREATE OR REPLACE FUNCTION public.get_supervisor_filial_tasks()
 RETURNS TABLE(id uuid, name text, responsible text, client text, property text, filial text, email text, phone text, sales_value numeric, access_level text, is_customer_data_protected boolean, start_date date, end_date date, status text, priority text, task_type text, observations text, created_at timestamp with time zone, created_by uuid, updated_at timestamp with time zone, is_prospect boolean, sales_confirmed boolean, equipment_quantity integer, equipment_list jsonb, propertyhectares integer, initial_km integer, final_km integer, check_in_location jsonb, clientcode text, sales_type text, start_time text, end_time text, prospect_notes text, family_product text, photos text[], documents text[], partial_sales_value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  current_user_filial uuid;
  is_manager boolean := false;
BEGIN
  -- Check authentication
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  
  -- Get user role and filial safely
  SELECT p.role, p.filial_id 
  INTO current_user_role, current_user_filial
  FROM public.profiles p
  WHERE p.user_id = auth.uid() 
  AND p.approval_status = 'approved'
  LIMIT 1;
  
  -- If no profile found, return empty
  IF current_user_role IS NULL THEN
    RETURN;
  END IF;
  
  is_manager := (current_user_role = 'manager');
  
  -- Log secure access
  PERFORM public.secure_log_security_event(
    'supervisor_filial_task_access',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'user_filial', current_user_filial,
      'is_manager', is_manager,
      'access_method', 'supervisor_function'
    ),
    2
  );
  
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    -- For supervisors: show all data from their filial
    -- For managers: show all data
    -- For others: only their own tasks
    CASE 
      WHEN is_manager OR t.created_by = auth.uid() THEN t.client
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = current_user_filial
      ) THEN t.client
      ELSE 'PROTECTED_CLIENT_' || substr(t.id::text, 1, 6)
    END as client,
    
    CASE 
      WHEN is_manager OR t.created_by = auth.uid() THEN t.property
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = current_user_filial
      ) THEN t.property
      ELSE 'PROTECTED_PROPERTY_' || substr(t.id::text, 1, 6)
    END as property,
    
    t.filial,
    
    CASE 
      WHEN is_manager OR t.created_by = auth.uid() THEN t.email
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = current_user_filial
      ) THEN t.email
      WHEN t.email IS NOT NULL AND t.email != '' THEN 'secure@contact.protected'
      ELSE NULL
    END as email,
    
    CASE 
      WHEN is_manager OR t.created_by = auth.uid() THEN t.phone
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = current_user_filial
      ) THEN t.phone
      WHEN t.phone IS NOT NULL AND t.phone != '' THEN '+55 (**) ****-****'
      ELSE NULL
    END as phone,
    
    CASE 
      WHEN is_manager OR t.created_by = auth.uid() THEN t.sales_value
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = current_user_filial
      ) THEN t.sales_value
      ELSE NULL
    END as sales_value,
    
    -- ACCESS LEVEL INDICATOR
    CASE 
      WHEN is_manager THEN 'manager'
      WHEN t.created_by = auth.uid() THEN 'owner'
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = current_user_filial
      ) THEN 'supervisor_filial'
      ELSE 'restricted'
    END as access_level,
    
    -- PROTECTION FLAG
    NOT (
      is_manager OR 
      t.created_by = auth.uid() OR
      (current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = current_user_filial
      ))
    ) as is_customer_data_protected,
    
    -- Non-sensitive data
    t.start_date,
    t.end_date,
    t.status,
    t.priority,
    t.task_type,
    
    CASE 
      WHEN is_manager OR t.created_by = auth.uid() THEN t.observations
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = current_user_filial
      ) THEN t.observations
      ELSE '[Content restricted for privacy protection]'
    END as observations,
    
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
  FROM public.tasks t
  WHERE (
    -- Managers see everything
    is_manager OR
    -- Users see their own tasks
    t.created_by = auth.uid() OR
    -- SUPERVISORES VEEM TODAS AS TASKS DA SUA FILIAL
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.user_id = t.created_by AND p2.filial_id = current_user_filial
    ))
  )
  ORDER BY t.created_at DESC;
END;
$function$;