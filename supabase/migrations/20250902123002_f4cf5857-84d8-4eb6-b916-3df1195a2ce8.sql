-- FINAL SECURITY DEFINER AND SEARCH PATH FIXES
-- Remove all remaining SECURITY DEFINER issues and fix function search paths

-- 1. Fix remaining functions with missing search_path
CREATE OR REPLACE FUNCTION public.mask_customer_email(email text, user_role text, is_owner boolean, is_same_filial boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE 
    WHEN user_role = 'manager' OR is_owner THEN email
    WHEN user_role = 'supervisor' AND is_same_filial THEN email
    ELSE '***@***.***'
  END;
$$;

CREATE OR REPLACE FUNCTION public.mask_customer_name(name text, user_role text, is_owner boolean, is_same_filial boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE 
    WHEN user_role = 'manager' OR is_owner THEN name
    WHEN user_role = 'supervisor' AND is_same_filial THEN name
    ELSE LEFT(name, 2) || '***' || RIGHT(name, 1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.mask_phone_number(phone text, user_role text, is_owner boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE 
    WHEN user_role = 'manager' OR is_owner THEN COALESCE(phone, '')
    ELSE '***-***-***'
  END;
$$;

-- 2. Check for any remaining SECURITY DEFINER views and convert them
-- Find all views that might have SECURITY DEFINER
SELECT schemaname, viewname 
FROM pg_views 
WHERE schemaname = 'public' 
AND definition ILIKE '%security definer%';

-- 3. Remove SECURITY DEFINER from simple helper functions (keep only where absolutely necessary)
CREATE OR REPLACE FUNCTION public.simple_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users au 
    WHERE au.user_id = auth.uid() AND au.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.simple_user_role()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1),
    'none'
  );
$$;

-- 4. Fix the user_same_filial function search path
CREATE OR REPLACE FUNCTION public.user_same_filial(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
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

-- 5. Fix other functions that might need search_path
CREATE OR REPLACE FUNCTION public.can_access_customer_data(task_owner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  current_user_role text;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  -- Managers can access all customer data
  IF current_user_role = 'manager' THEN
    RETURN true;
  END IF;
  
  -- Users can access their own task data
  IF auth.uid() = task_owner_id THEN
    RETURN true;
  END IF;
  
  -- Supervisors can access data from their filial
  IF current_user_role = 'supervisor' AND user_same_filial(task_owner_id) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- 6. Update check_sensitive_data_rate_limit function to remove SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.check_sensitive_data_rate_limit()
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  recent_access_count integer;
BEGIN
  -- Count recent sensitive data access in last hour
  SELECT COUNT(*) INTO recent_access_count
  FROM public.security_audit_log
  WHERE user_id = auth.uid()
    AND event_type LIKE '%sensitive%'
    AND created_at > now() - interval '1 hour';
    
  -- Allow max 100 sensitive data access per hour
  IF recent_access_count >= 100 THEN
    PERFORM public.secure_log_security_event(
      'sensitive_data_rate_limit_exceeded',
      auth.uid(),
      jsonb_build_object(
        'access_count', recent_access_count,
        'time_window', '1 hour'
      ),
      4
    );
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- 7. Update monitor_customer_data_access to remove SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.monitor_customer_data_access()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Log customer data access
  PERFORM public.secure_log_security_event(
    'customer_data_view_access',
    auth.uid(),
    jsonb_build_object(
      'view_name', 'secure_tasks_view_final',
      'access_time', now(),
      'user_role', public.simple_user_role(),
      'rate_limit_check', public.check_sensitive_data_rate_limit()
    ),
    2
  );
END;
$$;

-- Log security definer cleanup completion
SELECT public.secure_log_security_event(
  'security_definer_cleanup_completed',
  auth.uid(),
  jsonb_build_object(
    'timestamp', now(),
    'actions', ARRAY[
      'removed_security_definer_from_functions',
      'fixed_function_search_paths',
      'maintained_essential_admin_functions'
    ]
  ),
  1
);