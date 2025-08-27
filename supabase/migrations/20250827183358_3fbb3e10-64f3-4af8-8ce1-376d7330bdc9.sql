-- Phase 2: Fix specific security warnings and enhance authentication

-- 1. Fix remaining functions without search_path (critical security fix)
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_filial_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT filial_id FROM public.profiles 
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_same_filial(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_by_email(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE email = check_email AND is_active = true
  );
$$;

-- 2. Enhanced RLS policies for customer data protection
DROP POLICY IF EXISTS "Enhanced customer data protection" ON public.tasks;
CREATE POLICY "Enhanced customer data protection"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  -- Allow full access for task owners and managers
  (auth.uid() = created_by) OR
  (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')) OR
  -- Supervisors can see tasks from their filial
  (EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p1.role = 'supervisor'
    AND p2.user_id = tasks.created_by 
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
  )) OR
  -- Limited access for consultants: same filial AND low-value sales only
  (EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p1.role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant')
    AND p2.user_id = tasks.created_by 
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
    AND COALESCE(tasks.sales_value, 0) <= 25000
  ))
);

-- 3. Create security monitoring view for admins
CREATE OR REPLACE VIEW public.security_dashboard AS
SELECT 
  'Recent High-Risk Events' as metric_name,
  COUNT(*) as count,
  'Last 24 hours' as time_period
FROM public.security_audit_log 
WHERE risk_score >= 4 AND created_at > now() - interval '24 hours'
UNION ALL
SELECT 
  'Customer Data Access Attempts' as metric_name,
  COUNT(*) as count,
  'Last 24 hours' as time_period
FROM public.security_audit_log 
WHERE event_type LIKE '%customer_data%' AND created_at > now() - interval '24 hours'
UNION ALL
SELECT 
  'High-Value Sales Access' as metric_name,
  COUNT(*) as count,
  'Last 24 hours' as time_period
FROM public.security_audit_log 
WHERE event_type LIKE '%high_value%' AND created_at > now() - interval '24 hours';

-- Apply RLS to security dashboard (admin only)
ALTER VIEW public.security_dashboard OWNER TO postgres;
GRANT SELECT ON public.security_dashboard TO authenticated;

-- 4. Enhanced data export logging
CREATE OR REPLACE FUNCTION public.log_data_export(
  export_type text,
  record_count integer,
  filters_applied jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_role text;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Log the export with high risk level
  PERFORM public.secure_log_security_event(
    'data_export_performed',
    auth.uid(),
    jsonb_build_object(
      'export_type', export_type,
      'record_count', record_count,
      'filters_applied', filters_applied,
      'user_role', current_user_role,
      'timestamp', now()
    ),
    4
  );
END;
$$;

-- 5. Create secure password strength validation
CREATE OR REPLACE FUNCTION public.validate_password_strength(password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
  score integer := 0;
  feedback text[] := ARRAY[]::text[];
BEGIN
  -- Check length
  IF length(password) >= 12 THEN
    score := score + 2;
  ELSIF length(password) >= 8 THEN
    score := score + 1;
  ELSE
    feedback := array_append(feedback, 'Password must be at least 8 characters long');
  END IF;
  
  -- Check for uppercase
  IF password ~ '[A-Z]' THEN
    score := score + 1;
  ELSE
    feedback := array_append(feedback, 'Password must contain at least one uppercase letter');
  END IF;
  
  -- Check for lowercase
  IF password ~ '[a-z]' THEN
    score := score + 1;
  ELSE
    feedback := array_append(feedback, 'Password must contain at least one lowercase letter');
  END IF;
  
  -- Check for numbers
  IF password ~ '[0-9]' THEN
    score := score + 1;
  ELSE
    feedback := array_append(feedback, 'Password must contain at least one number');
  END IF;
  
  -- Check for special characters
  IF password ~ '[^A-Za-z0-9]' THEN
    score := score + 1;
  ELSE
    feedback := array_append(feedback, 'Password must contain at least one special character');
  END IF;
  
  -- Build result
  result := jsonb_build_object(
    'score', score,
    'max_score', 6,
    'strength', CASE 
      WHEN score >= 5 THEN 'strong'
      WHEN score >= 3 THEN 'medium'
      ELSE 'weak'
    END,
    'feedback', to_jsonb(feedback),
    'is_valid', score >= 4
  );
  
  RETURN result;
END;
$$;

-- 6. Create audit trail for role changes
CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Log role changes with high security priority
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    PERFORM public.secure_log_security_event(
      'critical_role_change',
      NEW.user_id,
      jsonb_build_object(
        'old_role', OLD.role,
        'new_role', NEW.role,
        'changed_by', auth.uid(),
        'target_user_email', NEW.email,
        'security_alert', true
      ),
      5
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply the role change audit trigger
DROP TRIGGER IF EXISTS audit_role_changes ON public.profiles;
CREATE TRIGGER audit_role_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_role_changes();

-- 7. Create function to check for security violations
CREATE OR REPLACE FUNCTION public.detect_security_violations()
RETURNS TABLE(
  violation_type text,
  user_id uuid,
  risk_score integer,
  details jsonb,
  occurred_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Detect multiple failed login attempts
  RETURN QUERY
  SELECT 
    'multiple_failed_logins'::text,
    logs.user_id,
    5::integer,
    jsonb_build_object(
      'failed_attempts', COUNT(*),
      'time_window', '1 hour'
    ),
    MAX(logs.created_at)
  FROM public.security_audit_log logs
  WHERE logs.event_type = 'failed_login'
    AND logs.created_at > now() - interval '1 hour'
  GROUP BY logs.user_id
  HAVING COUNT(*) >= 5;
  
  -- Detect unusual high-value data access
  RETURN QUERY
  SELECT 
    'unusual_high_value_access'::text,
    logs.user_id,
    4::integer,
    jsonb_build_object(
      'access_count', COUNT(*),
      'time_window', '1 hour'
    ),
    MAX(logs.created_at)
  FROM public.security_audit_log logs
  WHERE logs.event_type LIKE '%high_value%'
    AND logs.created_at > now() - interval '1 hour'
  GROUP BY logs.user_id
  HAVING COUNT(*) >= 10;
END;
$$;