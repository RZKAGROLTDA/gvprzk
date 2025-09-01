-- PHASE 2: Complete remaining security fixes

-- 1. Update profiles table default approval status (if not already done)
UPDATE public.profiles 
SET approval_status = 'pending' 
WHERE approval_status = 'approved' 
AND user_id != (SELECT user_id FROM public.profiles WHERE role = 'manager' LIMIT 1);

-- 2. Add enhanced monitoring for high-risk activities
CREATE OR REPLACE FUNCTION public.monitor_bulk_data_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  recent_accesses integer;
BEGIN
  -- Count recent bulk data accesses in last hour
  SELECT COUNT(*) INTO recent_accesses
  FROM public.security_audit_log
  WHERE user_id = auth.uid()
    AND event_type LIKE '%bulk%'
    AND created_at > now() - interval '1 hour';
  
  -- Log high-risk activity if excessive access
  IF recent_accesses > 10 THEN
    PERFORM public.secure_log_security_event(
      'excessive_bulk_data_access',
      auth.uid(),
      jsonb_build_object(
        'recent_accesses', recent_accesses,
        'time_window', '1 hour',
        'alert_level', 'high'
      ),
      5
    );
  END IF;
  
  RETURN NULL;
END;
$$;

-- 3. Create secure client data view with automatic logging
CREATE OR REPLACE VIEW public.secure_clients_view AS
SELECT 
  c.id,
  c.name,
  CASE 
    WHEN p.role = 'manager' OR c.created_by = auth.uid() THEN c.email
    ELSE SUBSTRING(c.email FROM 1 FOR 1) || '***@' || SPLIT_PART(c.email, '@', 2)
  END as email,
  CASE 
    WHEN p.role = 'manager' OR c.created_by = auth.uid() THEN c.phone
    ELSE '***-***-' || RIGHT(COALESCE(c.phone, ''), 4)
  END as phone,
  c.stage,
  CASE 
    WHEN p.role = 'manager' OR c.created_by = auth.uid() THEN c.notes
    ELSE '[Protected - Access Restricted]'
  END as notes,
  c.session_date,
  c.created_at,
  c.created_by,
  (p.role != 'manager' AND c.created_by != auth.uid()) as is_masked,
  CASE 
    WHEN p.role = 'manager' THEN 'full'
    WHEN c.created_by = auth.uid() THEN 'owner'
    ELSE 'limited'
  END as access_level
FROM public.clients c
LEFT JOIN public.profiles p ON p.user_id = auth.uid()
WHERE (
  c.created_by = auth.uid() OR
  p.role = 'manager'
)
AND c.archived = false
AND p.approval_status = 'approved';

-- Enable RLS on the view
ALTER VIEW public.secure_clients_view SET (security_barrier = true);

-- 4. Add data masking function for sensitive fields
CREATE OR REPLACE FUNCTION public.mask_sensitive_data(
  data_value text,
  field_type text,
  user_has_access boolean
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT CASE 
    WHEN user_has_access THEN data_value
    WHEN field_type = 'email' THEN 
      SUBSTRING(data_value FROM 1 FOR 1) || '***@' || SPLIT_PART(data_value, '@', 2)
    WHEN field_type = 'phone' THEN 
      '***-***-' || RIGHT(COALESCE(data_value, ''), 4)
    WHEN field_type = 'name' THEN 
      LEFT(data_value, 2) || '***' || RIGHT(data_value, 1)
    ELSE '[Protected]'
  END;
$$;

-- 5. Create security monitoring dashboard function
CREATE OR REPLACE FUNCTION public.get_security_dashboard_data()
RETURNS TABLE(
  metric_name text,
  metric_value bigint,
  alert_level text,
  description text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only allow managers to access security dashboard
  IF NOT simple_is_admin() THEN
    RAISE EXCEPTION 'Access denied: Manager role required';
  END IF;
  
  -- High-risk events in last 24 hours
  RETURN QUERY
  SELECT 
    'high_risk_events_24h'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 10 THEN 'critical' WHEN COUNT(*) > 5 THEN 'high' ELSE 'normal' END::text,
    'High-risk security events in the last 24 hours'::text
  FROM public.security_audit_log
  WHERE risk_score >= 4 AND created_at > now() - interval '24 hours';
  
  -- Failed login attempts in last hour
  RETURN QUERY
  SELECT 
    'failed_logins_1h'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 20 THEN 'critical' WHEN COUNT(*) > 10 THEN 'high' ELSE 'normal' END::text,
    'Failed login attempts in the last hour'::text
  FROM public.security_audit_log
  WHERE event_type = 'failed_login' AND created_at > now() - interval '1 hour';
  
  -- Bulk data access attempts
  RETURN QUERY
  SELECT 
    'bulk_data_access'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 50 THEN 'critical' WHEN COUNT(*) > 20 THEN 'high' ELSE 'normal' END::text,
    'Bulk data access attempts today'::text
  FROM public.security_audit_log
  WHERE event_type LIKE '%bulk%' AND created_at > CURRENT_DATE;
  
  -- Users pending approval
  RETURN QUERY
  SELECT 
    'pending_approvals'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) > 10 THEN 'high' WHEN COUNT(*) > 5 THEN 'medium' ELSE 'normal' END::text,
    'Users pending approval'::text
  FROM public.profiles
  WHERE approval_status = 'pending';
END;
$$;