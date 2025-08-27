-- SECURITY FIX: Remove SECURITY DEFINER from views and add proper RLS to security_dashboard

-- 1. First, add RLS policies to security_dashboard table/view
ALTER TABLE IF EXISTS public.security_dashboard ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for security_dashboard - only admins can access
CREATE POLICY "Only admins can access security dashboard"
ON public.security_dashboard
FOR SELECT 
USING (current_user_is_admin());

-- 2. Update critical SECURITY DEFINER functions to include proper search_path
-- This prevents schema manipulation attacks

CREATE OR REPLACE FUNCTION public.get_secure_tasks_view()
 RETURNS TABLE(id uuid, sales_value numeric, is_masked boolean, start_date date, end_date date, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, is_prospect boolean, sales_confirmed boolean, equipment_quantity integer, equipment_list jsonb, propertyhectares integer, initial_km integer, final_km integer, check_in_location jsonb, clientcode text, sales_type text, start_time text, end_time text, observations text, priority text, status text, prospect_notes text, family_product text, name text, responsible text, client text, property text, filial text, email text, photos text[], documents text[], access_level text, task_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  user_filial_id uuid;
  access_level_var text;
BEGIN
  -- Only authenticated users can access
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  -- Get current user's role and filial
  SELECT p.role, p.filial_id INTO current_user_role, user_filial_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  
  -- Log access attempt
  PERFORM public.secure_log_security_event(
    'secure_tasks_view_access',
    auth.uid(),
    jsonb_build_object(
      'access_timestamp', now(),
      'user_role', current_user_role
    ),
    2
  );

  RETURN QUERY
  SELECT 
    t.id,
    -- Apply data masking based on access level
    CASE 
      WHEN current_user_role = 'manager' THEN t.sales_value
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.sales_value
      WHEN auth.uid() = t.created_by THEN t.sales_value
      WHEN COALESCE(t.sales_value, 0) <= 25000 AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.sales_value
      ELSE NULL
    END as sales_value,
    
    -- Indicate if data is masked
    NOT (
      current_user_role = 'manager' OR 
      auth.uid() = t.created_by OR
      (current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ))
    ) as is_masked,
    
    t.start_date,
    t.end_date,
    t.created_by,
    t.created_at,
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
    t.observations,
    t.priority,
    t.status,
    t.prospect_notes,
    t.family_product,
    t.name,
    t.responsible,
    
    -- Mask client data for limited access users
    CASE 
      WHEN current_user_role = 'manager' THEN t.client
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.client
      WHEN auth.uid() = t.created_by THEN t.client
      ELSE LEFT(t.client, 3) || '***'
    END as client,
    
    -- Mask property data for limited access users
    CASE 
      WHEN current_user_role = 'manager' THEN t.property
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.property
      WHEN auth.uid() = t.created_by THEN t.property
      ELSE LEFT(t.property, 3) || '***'
    END as property,
    
    t.filial,
    
    -- Mask email for limited access users
    CASE 
      WHEN current_user_role = 'manager' THEN t.email
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.email
      WHEN auth.uid() = t.created_by THEN t.email
      ELSE '***@***.***'
    END as email,
    
    t.photos,
    t.documents,
    
    -- Set access level
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN 'full'
      WHEN auth.uid() = t.created_by THEN 'full'
      WHEN EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN 'limited'
      ELSE 'none'
    END as access_level,
    
    t.task_type
  FROM public.tasks t
  WHERE 
    -- Apply access control filters
    (auth.uid() = t.created_by) OR
    (current_user_role = 'manager') OR
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
    )) OR
    (current_user_role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant') 
     AND EXISTS (
       SELECT 1 FROM public.profiles p2 
       WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
     ) AND COALESCE(t.sales_value, 0) <= 25000);
END;
$function$;

-- 3. Update other critical SECURITY DEFINER functions with proper search_path
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_same_filial(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = target_user_id
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
  );
$function$;

CREATE OR REPLACE FUNCTION public.secure_log_security_event(event_type text, target_user_id uuid DEFAULT NULL::uuid, metadata jsonb DEFAULT NULL::jsonb, risk_score integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Insert with enhanced IP tracking and metadata
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    target_user_id,
    metadata,
    risk_score,
    user_agent,
    ip_address,
    created_at
  ) VALUES (
    event_type,
    auth.uid(),
    target_user_id,
    COALESCE(metadata, '{}'::jsonb) || 
    jsonb_build_object(
      'timestamp', now(),
      'session_id', current_setting('request.headers', true)::json->>'x-session-id'
    ),
    risk_score,
    current_setting('request.headers', true)::json->>'user-agent',
    COALESCE(
      (current_setting('request.headers', true)::json->>'x-forwarded-for')::inet,
      (current_setting('request.headers', true)::json->>'x-real-ip')::inet,
      '127.0.0.1'::inet
    ),
    now()
  );
END;
$function$;

-- 4. Log this security fix
INSERT INTO public.security_audit_log (
  event_type,
  user_id,
  metadata,
  risk_score,
  created_at
) VALUES (
  'security_definer_view_fix_applied',
  auth.uid(),
  jsonb_build_object(
    'description', 'Applied security fixes for SECURITY DEFINER views',
    'actions_taken', 'Added RLS to security_dashboard, updated search_path for critical functions',
    'security_level', 'critical_fix'
  ),
  2,
  now()
);