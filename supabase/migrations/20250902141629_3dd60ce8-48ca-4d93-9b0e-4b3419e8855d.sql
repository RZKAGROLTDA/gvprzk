-- Enhanced Security Fixes Implementation

-- 1. Create enhanced login rate limiting function
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  failed_attempts integer;
  last_attempt_time timestamp with time zone;
BEGIN
  -- Count failed login attempts in last hour
  SELECT COUNT(*), MAX(created_at) INTO failed_attempts, last_attempt_time
  FROM public.security_audit_log
  WHERE event_type = 'login_attempt_failed'
    AND metadata->>'email' = user_email
    AND created_at > now() - interval '1 hour';
  
  -- Block if more than 5 failed attempts in last hour
  IF failed_attempts >= 5 THEN
    -- Log rate limit exceeded
    PERFORM public.secure_log_security_event(
      'login_rate_limit_exceeded',
      NULL,
      jsonb_build_object(
        'email', user_email,
        'failed_attempts', failed_attempts,
        'last_attempt', last_attempt_time
      ),
      5
    );
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- 2. Create suspicious login pattern detection
CREATE OR REPLACE FUNCTION public.check_suspicious_login_pattern(user_email text, ip_address inet DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  recent_locations integer;
  rapid_attempts integer;
BEGIN
  -- Check for logins from multiple IP addresses in short time
  SELECT COUNT(DISTINCT ip_address) INTO recent_locations
  FROM public.security_audit_log
  WHERE event_type = 'login_attempt'
    AND metadata->>'email' = user_email
    AND created_at > now() - interval '15 minutes'
    AND ip_address IS NOT NULL;
  
  -- Check for rapid successive attempts
  SELECT COUNT(*) INTO rapid_attempts
  FROM public.security_audit_log
  WHERE event_type = 'login_attempt'
    AND metadata->>'email' = user_email
    AND created_at > now() - interval '5 minutes';
  
  -- Flag as suspicious if multiple locations or rapid attempts
  IF recent_locations > 2 OR rapid_attempts > 10 THEN
    PERFORM public.secure_log_security_event(
      'suspicious_login_pattern_detected',
      NULL,
      jsonb_build_object(
        'email', user_email,
        'recent_locations', recent_locations,
        'rapid_attempts', rapid_attempts,
        'ip_address', ip_address
      ),
      4
    );
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- 3. Enhanced session security monitoring
CREATE OR REPLACE FUNCTION public.monitor_session_security()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  concurrent_sessions integer;
  user_agent_changes integer;
BEGIN
  -- Check for excessive concurrent sessions per user
  SELECT COUNT(*) INTO concurrent_sessions
  FROM public.security_audit_log
  WHERE event_type = 'concurrent_session_detected'
    AND user_id = auth.uid()
    AND created_at > now() - interval '1 hour';
  
  -- Check for user agent changes (potential session hijacking)
  SELECT COUNT(DISTINCT user_agent) INTO user_agent_changes
  FROM public.security_audit_log
  WHERE user_id = auth.uid()
    AND created_at > now() - interval '1 hour'
    AND user_agent IS NOT NULL;
  
  -- Log high-risk session activity
  IF concurrent_sessions > 3 OR user_agent_changes > 2 THEN
    PERFORM public.secure_log_security_event(
      'high_risk_session_activity',
      auth.uid(),
      jsonb_build_object(
        'concurrent_sessions', concurrent_sessions,
        'user_agent_changes', user_agent_changes
      ),
      4
    );
  END IF;
END;
$$;

-- 4. Input validation and sanitization function
CREATE OR REPLACE FUNCTION public.validate_and_sanitize_input(
  input_data jsonb,
  validation_rules jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  sanitized_data jsonb := '{}'::jsonb;
  key text;
  value text;
  max_length integer;
  is_suspicious boolean := false;
BEGIN
  -- Loop through input data
  FOR key, value IN SELECT * FROM jsonb_each_text(input_data)
  LOOP
    -- Get max length for this field
    max_length := COALESCE((validation_rules->key->>'max_length')::integer, 1000);
    
    -- Check for suspicious patterns
    IF value ~ '<script|javascript:|data:|vbscript:' OR
       value ~ 'union.*select|drop.*table|insert.*into' OR
       length(value) > max_length THEN
      is_suspicious := true;
      -- Log suspicious input
      PERFORM public.secure_log_security_event(
        'suspicious_input_detected',
        auth.uid(),
        jsonb_build_object(
          'field', key,
          'value_length', length(value),
          'suspicious_content', left(value, 100)
        ),
        4
      );
      -- Sanitize suspicious content
      value := '[SANITIZED_CONTENT]';
    END IF;
    
    -- Truncate if too long
    IF length(value) > max_length THEN
      value := left(value, max_length);
    END IF;
    
    -- Add to sanitized data
    sanitized_data := sanitized_data || jsonb_build_object(key, value);
  END LOOP;
  
  RETURN sanitized_data;
END;
$$;

-- 5. Database integrity monitoring function
CREATE OR REPLACE FUNCTION public.check_data_integrity()
RETURNS TABLE(
  table_name text,
  issue_type text,
  issue_count bigint,
  severity text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Check for orphaned records
  RETURN QUERY
  SELECT 
    'tasks'::text,
    'orphaned_records'::text,
    COUNT(*),
    'MEDIUM'::text
  FROM public.tasks t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.user_id = t.created_by
  );
  
  -- Check for duplicate customer data
  RETURN QUERY
  SELECT 
    'tasks'::text,
    'duplicate_customers'::text,
    COUNT(*) - COUNT(DISTINCT (client, email)),
    'LOW'::text
  FROM public.tasks
  WHERE client IS NOT NULL AND email IS NOT NULL;
  
  -- Check for suspicious data patterns
  RETURN QUERY
  SELECT 
    'security_audit_log'::text,
    'high_risk_events'::text,
    COUNT(*),
    'HIGH'::text
  FROM public.security_audit_log
  WHERE risk_score >= 4
    AND created_at > now() - interval '24 hours';
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.check_login_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_suspicious_login_pattern TO authenticated;
GRANT EXECUTE ON FUNCTION public.monitor_session_security TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_sanitize_input TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_data_integrity TO authenticated;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_security_audit_log_email ON public.security_audit_log 
USING HASH ((metadata->>'email')) WHERE event_type LIKE '%login%';

CREATE INDEX IF NOT EXISTS idx_security_audit_log_risk_score ON public.security_audit_log (risk_score, created_at) 
WHERE risk_score >= 3;