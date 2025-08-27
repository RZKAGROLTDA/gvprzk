-- SECURITY FIX: Recreate security_dashboard as a secure function instead of view
-- This resolves the Security Definer View vulnerability

-- 1. Drop the existing view
DROP VIEW IF EXISTS public.security_dashboard;

-- 2. Create a secure function that replaces the view functionality
CREATE OR REPLACE FUNCTION public.get_security_dashboard()
 RETURNS TABLE(
   metric_name text,
   count bigint,
   time_period text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only authenticated admins can access security dashboard
  IF NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required for security dashboard';
  END IF;

  -- Log security dashboard access
  PERFORM secure_log_security_event(
    'security_dashboard_access',
    auth.uid(),
    jsonb_build_object(
      'access_timestamp', now(),
      'user_role', (SELECT role FROM profiles WHERE user_id = auth.uid())
    ),
    3
  );

  RETURN QUERY
  SELECT 
    'Recent High-Risk Events'::text AS metric_name,
    count(*) AS count,
    'Last 24 hours'::text AS time_period
  FROM security_audit_log
  WHERE risk_score >= 4 
    AND created_at > (now() - interval '24 hours')
  
  UNION ALL
  
  SELECT 
    'Customer Data Access Attempts'::text AS metric_name,
    count(*) AS count,
    'Last 24 hours'::text AS time_period
  FROM security_audit_log
  WHERE event_type ILIKE '%customer_data%' 
    AND created_at > (now() - interval '24 hours')
  
  UNION ALL
  
  SELECT 
    'High-Value Sales Access'::text AS metric_name,
    count(*) AS count,
    'Last 24 hours'::text AS time_period
  FROM security_audit_log
  WHERE event_type ILIKE '%high_value%' 
    AND created_at > (now() - interval '24 hours')
  
  UNION ALL
  
  SELECT 
    'Failed Login Attempts'::text AS metric_name,
    count(*) AS count,
    'Last 24 hours'::text AS time_period
  FROM security_audit_log
  WHERE event_type = 'failed_login' 
    AND created_at > (now() - interval '24 hours')
  
  UNION ALL
  
  SELECT 
    'Concurrent Sessions Detected'::text AS metric_name,
    count(*) AS count,
    'Last 24 hours'::text AS time_period
  FROM security_audit_log
  WHERE event_type = 'concurrent_session_detected' 
    AND created_at > (now() - interval '24 hours');
END;
$function$;

-- 3. Update critical functions with proper search_path to prevent schema manipulation
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_directory()
 RETURNS TABLE(id uuid, user_id uuid, name text, email text, role text, filial_id uuid, approval_status text, filial_nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only authenticated users can access this function
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  -- Log directory access
  PERFORM secure_log_security_event(
    'user_directory_access',
    auth.uid(),
    jsonb_build_object('access_timestamp', now()),
    2
  );

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

-- 4. Log this critical security fix
INSERT INTO public.security_audit_log (
  event_type,
  user_id,
  metadata,
  risk_score,
  created_at
) VALUES (
  'critical_security_definer_view_fixed',
  auth.uid(),
  jsonb_build_object(
    'description', 'Fixed Security Definer View vulnerability by replacing with secure function',
    'actions_taken', 'Removed insecure view, added admin-only secure function, updated search_path',
    'security_level', 'critical_fix',
    'compliance_status', 'resolved'
  ),
  1,
  now()
);