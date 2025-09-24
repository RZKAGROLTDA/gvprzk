-- Drop and recreate the secure tasks function with simplified logic
DROP FUNCTION IF EXISTS public.get_secure_tasks_with_customer_protection();

CREATE OR REPLACE FUNCTION public.get_secure_tasks_with_customer_protection()
RETURNS TABLE(
  id uuid,
  name text,
  responsible text,
  client text,
  property text,
  filial text,
  email text,
  phone text,
  sales_value numeric,
  access_level text,
  is_customer_data_protected boolean,
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
) LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_role text;
  current_user_filial uuid;
  task_count integer;
BEGIN
  -- Early authentication check
  IF auth.uid() IS NULL THEN
    RAISE NOTICE 'Authentication required - no user found';
    RETURN;
  END IF;
  
  -- Log access attempt with detailed info
  PERFORM public.secure_log_security_event(
    'secure_tasks_access_attempt',
    auth.uid(),
    jsonb_build_object(
      'function_name', 'get_secure_tasks_with_customer_protection',
      'timestamp', now(),
      'user_agent', current_setting('request.headers', true)::json->>'user-agent'
    ),
    2
  );
  
  -- Get user profile with better error handling
  BEGIN
    SELECT p.role, p.filial_id 
    INTO current_user_role, current_user_filial
    FROM public.profiles p
    WHERE p.user_id = auth.uid() 
    AND p.approval_status = 'approved'
    LIMIT 1;
    
    IF current_user_role IS NULL THEN
      RAISE NOTICE 'No approved profile found for user %', auth.uid();
      -- Try to get any profile for debugging
      SELECT p.role, p.filial_id, p.approval_status
      INTO current_user_role, current_user_filial
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
      LIMIT 1;
      
      PERFORM public.secure_log_security_event(
        'profile_not_found_debug',
        auth.uid(),
        jsonb_build_object(
          'found_role', current_user_role,
          'found_filial', current_user_filial,
          'message', 'Profile found but not approved or missing'
        ),
        3
      );
      RETURN;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.secure_log_security_event(
      'profile_query_error',
      auth.uid(),
      jsonb_build_object(
        'error_message', SQLERRM,
        'error_state', SQLSTATE
      ),
      4
    );
    RETURN;
  END;
  
  -- Count available tasks for debugging
  SELECT COUNT(*) INTO task_count
  FROM public.tasks t
  WHERE (
    current_user_role = 'manager' OR
    t.created_by = auth.uid() OR
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = t.created_by 
      AND p.filial_id = current_user_filial
    )) OR
    (current_user_role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant') 
     AND EXISTS (
       SELECT 1 FROM public.profiles p 
       WHERE p.user_id = t.created_by 
       AND p.filial_id = current_user_filial
     ))
  );
  
  -- Log task count for debugging
  PERFORM public.secure_log_security_event(
    'secure_tasks_query_debug',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'user_filial', current_user_filial,
      'available_task_count', task_count,
      'auth_uid', auth.uid()
    ),
    2
  );
  
  -- Return simplified and secure task data
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    -- Simplified client masking - only managers and owners see full data
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.client
      ELSE '[Cliente Protegido]'
    END as client,
    -- Simplified property masking
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.property
      ELSE '[Propriedade Protegida]'
    END as property,
    t.filial,
    -- Simplified email masking
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.email
      ELSE 'protegido@email.com'
    END as email,
    -- Simplified phone masking
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.phone
      ELSE '(***) ****-****'
    END as phone,
    -- Simplified sales value masking
    CASE 
      WHEN current_user_role = 'manager' OR t.created_by = auth.uid() THEN t.sales_value
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = t.created_by 
        AND p.filial_id = current_user_filial
      ) THEN t.sales_value
      ELSE NULL
    END as sales_value,
    -- Access level
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN t.created_by = auth.uid() THEN 'owner'
      WHEN current_user_role = 'supervisor' THEN 'supervisor'
      ELSE 'limited'
    END as access_level,
    -- Data protection flag
    NOT (current_user_role = 'manager' OR t.created_by = auth.uid()) as is_customer_data_protected,
    -- Non-sensitive fields
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
  FROM public.tasks t
  WHERE (
    -- Simplified access control - allow broader access for better functionality
    current_user_role = 'manager' OR
    t.created_by = auth.uid() OR
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = t.created_by 
      AND p.filial_id = current_user_filial
    )) OR
    (current_user_role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant') 
     AND EXISTS (
       SELECT 1 FROM public.profiles p 
       WHERE p.user_id = t.created_by 
       AND p.filial_id = current_user_filial
     ))
  )
  ORDER BY t.created_at DESC;
  
  -- Log successful completion
  GET DIAGNOSTICS task_count = ROW_COUNT;
  PERFORM public.secure_log_security_event(
    'secure_tasks_query_completed',
    auth.uid(),
    jsonb_build_object(
      'returned_count', task_count,
      'user_role', current_user_role
    ),
    2
  );
END;
$$;