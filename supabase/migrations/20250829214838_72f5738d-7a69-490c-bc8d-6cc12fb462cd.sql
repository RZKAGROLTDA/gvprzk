-- SECURITY FIXES - Phase 2: Fix Remaining Security Warnings

-- 1. Fix the remaining functions that are missing search_path
CREATE OR REPLACE FUNCTION public.check_enhanced_rate_limit(user_email text, action_type text DEFAULT 'login'::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  attempt_count integer;
  time_window interval;
  max_attempts integer;
BEGIN
  CASE action_type
    WHEN 'login' THEN
      time_window := interval '15 minutes';
      max_attempts := 5;
    WHEN 'role_change' THEN
      time_window := interval '1 hour';
      max_attempts := 3;
    WHEN 'password_reset' THEN
      time_window := interval '1 hour';
      max_attempts := 3;
    ELSE
      time_window := interval '15 minutes';
      max_attempts := 10;
  END CASE;
  
  SELECT COUNT(*) INTO attempt_count
  FROM security_audit_log
  WHERE event_type = 'failed_' || action_type
    AND metadata->>'email' = user_email
    AND created_at > now() - time_window;
  
  IF attempt_count >= max_attempts THEN
    PERFORM secure_log_security_event(
      'enhanced_rate_limit_exceeded',
      NULL,
      jsonb_build_object(
        'email', user_email,
        'action_type', action_type,
        'attempt_count', attempt_count,
        'time_window', time_window::text
      ),
      5
    );
    RETURN false;
  END IF;
  
  RETURN true;
END;
$function$;

-- 2. Fix check_login_rate_limit function
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(user_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  attempt_count integer;
BEGIN
  -- Count failed attempts in last 15 minutes
  SELECT COUNT(*) INTO attempt_count
  FROM security_audit_log
  WHERE event_type = 'failed_login'
    AND metadata->>'email' = user_email
    AND created_at > now() - interval '15 minutes';
  
  -- Block if more than 5 attempts
  IF attempt_count >= 5 THEN
    -- Log the rate limit event
    INSERT INTO security_audit_log (
      event_type,
      risk_score,
      blocked,
      metadata
    ) VALUES (
      'rate_limit_exceeded',
      5,
      true,
      jsonb_build_object('email', user_email, 'attempt_count', attempt_count)
    );
    
    RETURN false;
  END IF;
  
  RETURN true;
END;
$function$;

-- 3. Fix check_security_configuration function
CREATE OR REPLACE FUNCTION public.check_security_configuration()
RETURNS TABLE(check_name text, status text, risk_level integer, description text, recommendation text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  FROM security_audit_log
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

-- 4. Fix detect_security_violations function
CREATE OR REPLACE FUNCTION public.detect_security_violations()
RETURNS TABLE(violation_type text, user_id uuid, risk_score integer, details jsonb, occurred_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  FROM security_audit_log logs
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
  FROM security_audit_log logs
  WHERE logs.event_type LIKE '%high_value%'
    AND logs.created_at > now() - interval '1 hour'
  GROUP BY logs.user_id
  HAVING COUNT(*) >= 10;
END;
$function$;

-- 5. Add comprehensive security monitoring for BI data access
CREATE OR REPLACE FUNCTION public.monitor_bi_data_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role 
  FROM profiles 
  WHERE user_id = auth.uid();
  
  -- Log all BI data access attempts
  PERFORM secure_log_security_event(
    'bi_data_access_attempt',
    auth.uid(),
    jsonb_build_object(
      'user_role', current_user_role,
      'access_type', TG_OP,
      'table_accessed', TG_TABLE_NAME
    ),
    2
  );
  
  -- Log high-value data access specifically
  IF TG_TABLE_NAME = 'vw_oportunidades_kpis' AND 
     (COALESCE(NEW.valor_total_oportunidade, 0) > 25000 OR 
      COALESCE(NEW.valor_venda_fechada, 0) > 25000) THEN
    PERFORM secure_log_security_event(
      'high_value_bi_access',
      NEW.vendedor_id,
      jsonb_build_object(
        'valor_total_oportunidade', NEW.valor_total_oportunidade,
        'valor_venda_fechada', NEW.valor_venda_fechada,
        'user_role', current_user_role,
        'cliente_nome', LEFT(NEW.cliente_nome, 3) || '***'
      ),
      4
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;