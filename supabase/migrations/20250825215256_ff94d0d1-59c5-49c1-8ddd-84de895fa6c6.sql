-- CRITICAL SECURITY FIXES - Phase 1: Database Security

-- 1. Create secure task data access function
CREATE OR REPLACE FUNCTION public.get_secure_task_data(task_id_param uuid)
 RETURNS TABLE(
   id uuid,
   name text,
   responsible text,
   client text,
   property text,
   filial text,
   email text,
   sales_value numeric,
   is_masked boolean
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_user_role text;
  user_filial_id uuid;
  task_creator_filial uuid;
  access_level text;
BEGIN
  -- Get current user's role and filial
  SELECT p.role, p.filial_id INTO current_user_role, user_filial_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  
  -- Get task creator's filial
  SELECT p.filial_id INTO task_creator_filial
  FROM public.tasks t
  JOIN public.profiles p ON t.created_by = p.user_id
  WHERE t.id = task_id_param;
  
  -- Determine access level
  IF current_user_role = 'manager' THEN
    access_level := 'full';
  ELSIF current_user_role = 'supervisor' AND user_filial_id = task_creator_filial THEN
    access_level := 'full';
  ELSIF user_filial_id = task_creator_filial THEN
    access_level := 'limited';
  ELSE
    access_level := 'none';
  END IF;
  
  -- Log data access
  PERFORM public.secure_log_security_event(
    'secure_task_data_access',
    auth.uid(),
    jsonb_build_object(
      'task_id', task_id_param,
      'access_level', access_level,
      'user_role', current_user_role
    ),
    2
  );
  
  -- Return data based on access level
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    CASE 
      WHEN access_level = 'full' THEN t.client
      WHEN access_level = 'limited' THEN LEFT(t.client, 3) || '***'
      ELSE '***'
    END as client,
    CASE 
      WHEN access_level = 'full' THEN t.property
      WHEN access_level = 'limited' THEN LEFT(t.property, 3) || '***'
      ELSE '***'
    END as property,
    t.filial,
    CASE 
      WHEN access_level = 'full' THEN t.email
      ELSE '***@***.***'
    END as email,
    CASE 
      WHEN access_level = 'full' THEN t.sales_value
      WHEN access_level = 'limited' THEN 
        CASE 
          WHEN t.sales_value > 25000 THEN NULL
          ELSE t.sales_value
        END
      ELSE NULL
    END as sales_value,
    (access_level != 'full') as is_masked
  FROM public.tasks t
  WHERE t.id = task_id_param;
END;
$function$;

-- 2. Create data access level function
CREATE OR REPLACE FUNCTION public.get_task_data_access_level(task_id_param uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_user_role text;
  user_filial_id uuid;
  task_creator_filial uuid;
  task_sales_value numeric;
BEGIN
  -- Get current user's role and filial
  SELECT p.role, p.filial_id INTO current_user_role, user_filial_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  
  -- Get task details
  SELECT p.filial_id, t.sales_value INTO task_creator_filial, task_sales_value
  FROM public.tasks t
  JOIN public.profiles p ON t.created_by = p.user_id
  WHERE t.id = task_id_param;
  
  -- Determine access level based on role and context
  IF current_user_role = 'manager' THEN
    RETURN 'full';
  ELSIF current_user_role = 'supervisor' AND user_filial_id = task_creator_filial THEN
    RETURN 'full';
  ELSIF user_filial_id = task_creator_filial THEN
    -- Limited access for same filial, but restricted for high-value tasks
    IF COALESCE(task_sales_value, 0) > 25000 THEN
      RETURN 'restricted';
    ELSE
      RETURN 'limited';
    END IF;
  ELSE
    RETURN 'none';
  END IF;
END;
$function$;

-- 3. Create secure tasks view
CREATE OR REPLACE VIEW public.secure_tasks_view AS
SELECT 
  t.id,
  t.name,
  t.responsible,
  -- Secure client data based on access level
  CASE 
    WHEN public.get_task_data_access_level(t.id) = 'full' THEN t.client
    WHEN public.get_task_data_access_level(t.id) = 'limited' THEN LEFT(t.client, 3) || '***'
    ELSE '***'
  END as client,
  -- Secure property data
  CASE 
    WHEN public.get_task_data_access_level(t.id) = 'full' THEN t.property
    WHEN public.get_task_data_access_level(t.id) = 'limited' THEN LEFT(t.property, 3) || '***'
    ELSE '***'
  END as property,
  t.filial,
  -- Secure email data
  CASE 
    WHEN public.get_task_data_access_level(t.id) = 'full' THEN t.email
    ELSE '***@***.***'
  END as email,
  -- Secure sales value
  CASE 
    WHEN public.get_task_data_access_level(t.id) = 'full' THEN t.sales_value
    WHEN public.get_task_data_access_level(t.id) = 'limited' THEN t.sales_value
    ELSE NULL
  END as sales_value,
  -- Add security metadata
  (public.get_task_data_access_level(t.id) != 'full') as is_masked,
  public.get_task_data_access_level(t.id) as access_level,
  -- Include all other non-sensitive fields
  t.task_type,
  t.start_date,
  t.end_date,
  t.start_time,
  t.end_time,
  t.observations,
  t.priority,
  t.status,
  t.created_by,
  t.created_at,
  t.updated_at,
  t.is_prospect,
  t.sales_confirmed,
  t.sales_type,
  t.prospect_notes,
  t.family_product,
  t.equipment_quantity,
  t.equipment_list,
  t.propertyhectares,
  t.initial_km,
  t.final_km,
  t.check_in_location,
  t.photos,
  t.documents,
  t.clientcode
FROM public.tasks t
WHERE 
  -- Apply same RLS logic as tasks table
  (auth.uid() = t.created_by) OR 
  (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')) OR
  (EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p1.role = 'supervisor' 
    AND p2.user_id = t.created_by 
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
  )) OR
  (EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p1.role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
    AND p2.user_id = t.created_by 
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
  ));

-- 4. Fix search paths for existing functions that are missing it
-- Note: Some functions already have search_path set, only updating those that don't

-- Update functions that don't have search_path set
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 5. Create security configuration check function
CREATE OR REPLACE FUNCTION public.check_security_configuration()
 RETURNS TABLE(
   check_name text,
   status text,
   risk_level integer,
   description text,
   recommendation text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Check for high-risk security events
  RETURN QUERY
  SELECT 
    'High Risk Events'::text,
    CASE 
      WHEN COUNT(*) > 100 THEN 'CRITICAL'
      WHEN COUNT(*) > 50 THEN 'HIGH'
      WHEN COUNT(*) > 10 THEN 'MEDIUM'
      ELSE 'LOW'
    END::text,
    CASE 
      WHEN COUNT(*) > 100 THEN 5
      WHEN COUNT(*) > 50 THEN 4
      WHEN COUNT(*) > 10 THEN 3
      ELSE 1
    END::integer,
    CONCAT('Found ', COUNT(*), ' high-risk security events in the last 24 hours')::text,
    'Investigate and address high-risk security events immediately'::text
  FROM public.security_audit_log
  WHERE risk_score >= 4 AND created_at > now() - interval '24 hours';
  
  -- Check for missing secure functions
  RETURN QUERY
  SELECT 
    'Secure Functions'::text,
    CASE 
      WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_secure_task_data') THEN 'OK'
      ELSE 'MISSING'
    END::text,
    CASE 
      WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_secure_task_data') THEN 1
      ELSE 5
    END::integer,
    'Secure task data access functions'::text,
    'Deploy secure data access functions to protect customer information'::text;
END;
$function$;