-- Enhanced security functions for monitoring and validation

-- Create function to check admin user status
CREATE OR REPLACE FUNCTION public.simple_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = auth.uid() 
    AND au.is_active = true
  );
$$;

-- Enhanced security event logging with risk assessment
CREATE OR REPLACE FUNCTION public.secure_log_security_event(
  event_type text,
  target_user_id uuid DEFAULT NULL,
  metadata jsonb DEFAULT '{}',
  risk_score integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Enhanced logging with automatic risk escalation
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    target_user_id,
    metadata,
    risk_score,
    blocked,
    created_at
  ) VALUES (
    event_type,
    auth.uid(),
    target_user_id,
    metadata || jsonb_build_object(
      'session_id', COALESCE((auth.jwt() ->> 'session_id'), 'unknown'),
      'user_agent', COALESCE((metadata ->> 'user_agent'), 'unknown'),
      'risk_assessment', CASE 
        WHEN risk_score >= 5 THEN 'CRITICAL'
        WHEN risk_score >= 4 THEN 'HIGH'
        WHEN risk_score >= 3 THEN 'MEDIUM'
        ELSE 'LOW'
      END
    ),
    risk_score,
    risk_score >= 5, -- Auto-block critical risk events
    now()
  );

  -- Auto-alert for high-risk events
  IF risk_score >= 4 THEN
    -- This could trigger real-time alerts in a production system
    PERFORM pg_notify('security_alert', jsonb_build_object(
      'event_type', event_type,
      'risk_score', risk_score,
      'user_id', auth.uid(),
      'timestamp', now()
    )::text);
  END IF;
END;
$$;

-- Function to get user directory with enhanced security
CREATE OR REPLACE FUNCTION public.get_user_directory_with_fallback()
RETURNS TABLE(
  id uuid,
  name text,
  email text,
  role text,
  approval_status text,
  filial_nome text,
  is_email_masked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  current_user_role text;
  is_admin_user boolean;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  -- Get current user role and admin status
  SELECT p.role INTO current_user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  is_admin_user := public.simple_is_admin();

  -- Log directory access
  PERFORM public.secure_log_security_event(
    'user_directory_access',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'is_admin', is_admin_user,
      'access_type', 'directory_listing'
    ),
    CASE WHEN is_admin_user THEN 2 ELSE 3 END
  );

  -- Only admins can access full user directory
  IF NOT is_admin_user THEN
    RAISE EXCEPTION 'Access denied: Insufficient permissions for user directory';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    -- Mask emails for non-admin users (additional security layer)
    CASE 
      WHEN is_admin_user THEN p.email
      ELSE SUBSTRING(p.email FROM 1 FOR 1) || '***@' || 
           SPLIT_PART(p.email, '@', 2)
    END as email,
    p.role,
    p.approval_status,
    COALESCE(f.nome, 'Sem Filial') as filial_nome,
    NOT is_admin_user as is_email_masked
  FROM public.profiles p
  LEFT JOIN public.filiais f ON p.filial_id = f.id
  WHERE p.approval_status = 'approved'
  ORDER BY p.name;
END;
$$;

-- Enhanced rate limiting for login attempts
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  recent_attempts integer;
  blocked_until timestamp with time zone;
BEGIN
  -- Count failed login attempts in the last hour
  SELECT COUNT(*) INTO recent_attempts
  FROM public.security_audit_log
  WHERE event_type = 'failed_login'
    AND metadata->>'email' = LOWER(user_email)
    AND created_at > now() - interval '1 hour';

  -- Check if user is temporarily blocked
  SELECT (metadata->>'blocked_until')::timestamp with time zone INTO blocked_until
  FROM public.security_audit_log
  WHERE event_type = 'login_blocked'
    AND metadata->>'email' = LOWER(user_email)
    AND created_at > now() - interval '24 hours'
  ORDER BY created_at DESC
  LIMIT 1;

  -- If user is blocked and block period hasn't expired
  IF blocked_until IS NOT NULL AND blocked_until > now() THEN
    RETURN false;
  END IF;

  -- Block user after 5 failed attempts
  IF recent_attempts >= 5 THEN
    PERFORM public.secure_log_security_event(
      'login_blocked',
      NULL,
      jsonb_build_object(
        'email', LOWER(user_email),
        'failed_attempts', recent_attempts,
        'blocked_until', (now() + interval '1 hour')::text,
        'reason', 'excessive_failed_attempts'
      ),
      5
    );
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- Function to check for suspicious login patterns
CREATE OR REPLACE FUNCTION public.check_suspicious_login_pattern(
  user_email text,
  ip_addr text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  distinct_ips integer;
  rapid_attempts integer;
BEGIN
  -- Check for logins from multiple IPs in short time
  SELECT COUNT(DISTINCT metadata->>'ip_address') INTO distinct_ips
  FROM public.security_audit_log
  WHERE event_type IN ('login_attempt', 'failed_login')
    AND metadata->>'email' = LOWER(user_email)
    AND created_at > now() - interval '1 hour';

  -- Check for rapid login attempts
  SELECT COUNT(*) INTO rapid_attempts
  FROM public.security_audit_log
  WHERE event_type IN ('login_attempt', 'failed_login')
    AND metadata->>'email' = LOWER(user_email)
    AND created_at > now() - interval '10 minutes';

  -- Alert on suspicious patterns
  IF distinct_ips > 3 THEN
    PERFORM public.secure_log_security_event(
      'suspicious_login_pattern',
      NULL,
      jsonb_build_object(
        'email', LOWER(user_email),
        'distinct_ips', distinct_ips,
        'pattern_type', 'multiple_ip_addresses',
        'current_ip', ip_addr
      ),
      4
    );
  END IF;

  IF rapid_attempts > 10 THEN
    PERFORM public.secure_log_security_event(
      'suspicious_login_pattern',
      NULL,
      jsonb_build_object(
        'email', LOWER(user_email),
        'rapid_attempts', rapid_attempts,
        'pattern_type', 'rapid_attempts',
        'current_ip', ip_addr
      ),
      4
    );
  END IF;
END;
$$;