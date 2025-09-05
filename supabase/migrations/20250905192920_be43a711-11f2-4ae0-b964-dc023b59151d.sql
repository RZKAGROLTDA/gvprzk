-- FINAL SECURITY FIXES - Address remaining linter warnings

-- 1. Fix remaining functions that need search_path
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE user_id = auth.uid() LIMIT 1),
    'none'
  );
$$;

CREATE OR REPLACE FUNCTION public.simple_user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1),
    'none'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_customer_data(task_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN auth.uid() = task_owner_id THEN true
    WHEN public.get_user_role() = 'manager' THEN true
    WHEN public.get_user_role() = 'supervisor' AND EXISTS (
      SELECT 1 
      FROM public.profiles p1, public.profiles p2
      WHERE p1.user_id = auth.uid() 
        AND p2.user_id = task_owner_id
        AND p1.filial_id = p2.filial_id
        AND p1.filial_id IS NOT NULL
    ) THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.user_same_filial(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid()
      AND p2.user_id = target_user_id
      AND p1.filial_id = p2.filial_id
      AND p1.filial_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_security_level()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) THEN 'manager'
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'supervisor' 
      AND p.approval_status = 'approved'
    ) THEN 'supervisor'
    WHEN EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.approval_status = 'approved'
    ) THEN 'user'
    ELSE 'none'
  END;
$$;

-- 2. Replace the secure_customer_data_view with a regular function to avoid SECURITY DEFINER view issues
DROP VIEW IF EXISTS public.secure_customer_data_view;

CREATE OR REPLACE FUNCTION public.get_secure_customer_data_view()
RETURNS TABLE(
  id uuid,
  name text,
  responsible text,
  client text,
  email text,
  phone text,
  sales_value numeric,
  is_data_masked boolean,
  start_date date,
  end_date date,
  status text,
  priority text,
  task_type text,
  created_at timestamp with time zone,
  created_by uuid,
  filial text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Log data access
  PERFORM public.log_customer_data_access_enhanced('tasks', 'view', true);
  
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.responsible,
    -- Enhanced client name masking
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = auth.uid() 
        AND p.role = 'manager' 
        AND p.approval_status = 'approved'
      ) OR t.created_by = auth.uid() THEN t.client
      WHEN EXISTS (
        SELECT 1 FROM public.profiles p1, public.profiles p2
        WHERE p1.user_id = auth.uid()
        AND p2.user_id = t.created_by
        AND p1.filial_id = p2.filial_id
        AND p1.role = 'supervisor'
        AND p1.approval_status = 'approved'
      ) THEN t.client
      ELSE LEFT(t.client, 1) || '***' || RIGHT(t.client, 1)
    END,
    -- Enhanced email masking
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = auth.uid() 
        AND p.role = 'manager' 
        AND p.approval_status = 'approved'
      ) OR t.created_by = auth.uid() THEN t.email
      WHEN t.email IS NOT NULL AND t.email != '' THEN
        LEFT(t.email, 1) || '***@***.' || 
        CASE 
          WHEN POSITION('.' IN REVERSE(t.email)) > 0 THEN 
            RIGHT(t.email, POSITION('.' IN REVERSE(t.email)) - 1)
          ELSE 'com'
        END
      ELSE NULL
    END,
    -- Enhanced phone masking
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = auth.uid() 
        AND p.role = 'manager' 
        AND p.approval_status = 'approved'
      ) OR t.created_by = auth.uid() THEN t.phone
      WHEN t.phone IS NOT NULL AND t.phone != '' THEN
        '(***) ***-' || RIGHT(t.phone, 4)
      ELSE NULL
    END,
    -- Sales value protection
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = auth.uid() 
        AND p.role = 'manager' 
        AND p.approval_status = 'approved'
      ) OR t.created_by = auth.uid() THEN t.sales_value
      WHEN EXISTS (
        SELECT 1 FROM public.profiles p1, public.profiles p2
        WHERE p1.user_id = auth.uid()
        AND p2.user_id = t.created_by
        AND p1.filial_id = p2.filial_id
        AND p1.role = 'supervisor'
        AND p1.approval_status = 'approved'
      ) THEN t.sales_value
      WHEN COALESCE(t.sales_value, 0) <= 25000 THEN t.sales_value
      ELSE NULL
    END,
    -- Data masking indicator
    NOT (
      EXISTS (
        SELECT 1 FROM public.profiles p 
        WHERE p.user_id = auth.uid() 
        AND p.role = 'manager' 
        AND p.approval_status = 'approved'
      ) OR 
      t.created_by = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.profiles p1, public.profiles p2
        WHERE p1.user_id = auth.uid()
        AND p2.user_id = t.created_by
        AND p1.filial_id = p2.filial_id
        AND p1.role = 'supervisor'
        AND p1.approval_status = 'approved'
      )
    ),
    -- Non-sensitive fields
    t.start_date,
    t.end_date,
    t.status,
    t.priority,
    t.task_type,
    t.created_at,
    t.created_by,
    t.filial
  FROM public.tasks t
  WHERE (
    -- Apply same access rules as tasks table
    auth.uid() = t.created_by OR
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.user_id = auth.uid() 
      AND p.role = 'manager' 
      AND p.approval_status = 'approved'
    ) OR
    EXISTS (
      SELECT 1 FROM public.profiles p1, public.profiles p2
      WHERE p1.user_id = auth.uid()
      AND p2.user_id = t.created_by
      AND p1.filial_id = p2.filial_id
      AND p1.role = 'supervisor'
      AND p1.approval_status = 'approved'
    ) OR
    EXISTS (
      SELECT 1 FROM public.profiles p1, public.profiles p2
      WHERE p1.user_id = auth.uid()
      AND p2.user_id = t.created_by
      AND p1.filial_id = p2.filial_id
      AND p1.role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
      AND p1.approval_status = 'approved'
      AND COALESCE(t.sales_value, 0) <= 25000
    )
  );
END;
$$;

-- 3. Create admin-only function to check remaining function security issues
CREATE OR REPLACE FUNCTION public.check_function_security_status()
RETURNS TABLE(
  function_name text,
  has_search_path boolean,
  is_secure boolean,
  recommendation text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only allow managers to run this check
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Access denied - manager role required';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.proname::text as function_name,
    (p.proconfig IS NOT NULL AND 'search_path=public' = ANY(p.proconfig)) as has_search_path,
    (p.proconfig IS NOT NULL AND 'search_path=public' = ANY(p.proconfig)) as is_secure,
    CASE 
      WHEN p.proconfig IS NULL OR NOT ('search_path=public' = ANY(p.proconfig)) THEN 
        'Add SET search_path TO ''public'' to function definition'
      ELSE 'Function is secure'
    END::text as recommendation
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.prosecdef = true  -- Only SECURITY DEFINER functions
  ORDER BY p.proname;
END;
$$;

-- 4. Log the security enhancement completion
SELECT public.secure_log_security_event(
  'security_enhancement_completed',
  auth.uid(),
  jsonb_build_object(
    'phase', 'critical_database_security',
    'fixes_applied', jsonb_build_array(
      'enhanced_rls_policies',
      'function_search_path_security',
      'customer_data_masking',
      'rate_limiting_enhancement',
      'security_audit_indexing',
      'threat_detection_functions'
    ),
    'security_level', 'HIGH'
  ),
  2
);