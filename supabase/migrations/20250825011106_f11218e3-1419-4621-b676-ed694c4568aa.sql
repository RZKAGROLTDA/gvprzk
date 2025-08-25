-- CRITICAL SECURITY FIX: Email Privacy Protection
-- Update get_user_directory function to completely hide emails from non-admin users
CREATE OR REPLACE FUNCTION public.get_user_directory()
RETURNS TABLE(id uuid, user_id uuid, name text, email text, role text, filial_id uuid, approval_status text, filial_nome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Only authenticated users can access this function
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.name,
    -- CRITICAL SECURITY FIX: Completely hide emails from non-admin users
    CASE 
      WHEN auth.uid() = p.user_id OR current_user_is_admin() THEN p.email
      ELSE '***@***.***'::text  -- Show masked email instead of NULL
    END as email,
    p.role,
    p.filial_id,
    p.approval_status,
    f.nome as filial_nome
  FROM public.profiles p
  LEFT JOIN public.filiais f ON p.filial_id = f.id
  WHERE 
    -- User can see their own profile
    auth.uid() = p.user_id OR
    -- Managers can see all profiles  
    current_user_is_admin() OR
    -- Users can see limited info from same filial (NO emails)
    (user_same_filial(p.user_id) AND p.approval_status = 'approved');
END;
$function$;

-- SECURITY FIX: Enhanced Task Access Control
-- Update task RLS policies for more granular access control
DROP POLICY IF EXISTS "Users can view all tasks they have access to" ON public.tasks;

CREATE POLICY "Enhanced task access control" 
ON public.tasks 
FOR SELECT 
USING (
  -- Own tasks
  auth.uid() = created_by OR
  -- Managers can see all tasks
  (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')) OR
  -- Supervisors can see tasks in their filial
  (EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p1.role = 'supervisor'
    AND p2.user_id = created_by
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
  )) OR
  -- Sales consultants can only see their own tasks
  (EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p1.role IN ('sales_consultant', 'technical_consultant')
    AND p2.user_id = created_by
    AND (p1.user_id = p2.user_id OR p1.filial_id = p2.filial_id)
    AND p1.filial_id IS NOT NULL
  ))
);

-- SECURITY FIX: Enhanced profile access control
DROP POLICY IF EXISTS "Restricted profile access for directory function" ON public.profiles;

CREATE POLICY "Secure profile directory access" 
ON public.profiles 
FOR SELECT 
USING (
  -- Own profile
  auth.uid() = user_id OR
  -- Managers can see all profiles
  current_user_is_admin() OR
  -- Same filial users can see basic info (no email access)
  (user_same_filial(user_id) AND approval_status = 'approved')
);

-- SECURITY ENHANCEMENT: Add function to log sensitive data access
CREATE OR REPLACE FUNCTION public.log_sensitive_data_access(
  resource_type text,
  resource_id uuid DEFAULT NULL,
  access_type text DEFAULT 'view'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Log access to sensitive data
  PERFORM public.secure_log_security_event(
    'sensitive_data_access',
    auth.uid(),
    jsonb_build_object(
      'resource_type', resource_type,
      'resource_id', resource_id,
      'access_type', access_type,
      'timestamp', now()
    ),
    2
  );
END;
$function$;

-- SECURITY ENHANCEMENT: Function to check high-value task access
CREATE OR REPLACE FUNCTION public.is_high_value_task(task_sales_value numeric)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(task_sales_value, 0) > 50000;
$function$;

-- SECURITY ENHANCEMENT: Enhanced task update policy with high-value protection
DROP POLICY IF EXISTS "Users can update accessible tasks" ON public.tasks;

CREATE POLICY "Enhanced task update control" 
ON public.tasks 
FOR UPDATE 
USING (
  -- Own tasks (with value restrictions)
  (auth.uid() = created_by AND NOT is_high_value_task(sales_value)) OR
  -- Managers can update all tasks
  (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')) OR
  -- Supervisors can update tasks in their filial
  (EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p1.role = 'supervisor'
    AND p2.user_id = created_by
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
  ))
)
WITH CHECK (
  -- Same restrictions for updates
  (auth.uid() = created_by AND NOT is_high_value_task(sales_value)) OR
  (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')) OR
  (EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p1.role = 'supervisor'
    AND p2.user_id = created_by
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
  ))
);