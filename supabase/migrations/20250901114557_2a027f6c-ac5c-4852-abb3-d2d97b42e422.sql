-- Fix the remaining SECURITY DEFINER functions by removing the SECURITY DEFINER property

-- Fix the remaining functions one by one
CREATE OR REPLACE FUNCTION public.can_modify_user_role(target_user_id uuid, new_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path = 'public'
AS $function$
DECLARE
  current_user_role text;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Only managers can modify roles
  IF current_user_role != 'manager' THEN
    RETURN false;
  END IF;
  
  -- Users cannot modify their own roles (prevent self-escalation)
  IF target_user_id = auth.uid() THEN
    RETURN false;
  END IF;
  
  -- Validate that new_role is one of the allowed roles
  IF new_role NOT IN ('manager', 'rac', 'consultant', 'supervisor', 'sales_consultant', 'technical_consultant') THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_bi_security_alerts()
 RETURNS TABLE(alert_type text, severity text, count bigint, description text, recommendation text)
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN
  -- Check for unauthorized BI access attempts
  RETURN QUERY
  SELECT 
    'Unauthorized BI Access'::text,
    CASE 
      WHEN COUNT(*) > 50 THEN 'CRITICAL'
      WHEN COUNT(*) > 20 THEN 'HIGH'
      WHEN COUNT(*) > 5 THEN 'MEDIUM'
      ELSE 'LOW'
    END::text,
    COUNT(*),
    CONCAT('Found ', COUNT(*), ' unauthorized BI access attempts in the last 24 hours')::text,
    'Immediately review user permissions and investigate potential security breach'::text
  FROM security_audit_log
  WHERE event_type = 'high_value_bi_access' 
    AND metadata->>'unauthorized_access' = 'true'
    AND created_at > now() - interval '24 hours';
    
  -- Check for excessive BI data access
  RETURN QUERY
  SELECT 
    'Excessive BI Data Access'::text,
    CASE 
      WHEN COUNT(*) > 1000 THEN 'HIGH'
      WHEN COUNT(*) > 500 THEN 'MEDIUM'
      ELSE 'LOW'
    END::text,
    COUNT(*),
    CONCAT('Found ', COUNT(*), ' BI data access events in the last 24 hours')::text,
    'Monitor for unusual access patterns and potential data exfiltration'::text
  FROM security_audit_log
  WHERE event_type LIKE '%bi_%' 
    AND created_at > now() - interval '24 hours';
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_client_operation_rate_limit(operation_type text DEFAULT 'create'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
DECLARE
  recent_operations integer;
  time_window interval;
  max_operations integer;
BEGIN
  -- Set limits based on operation type
  CASE operation_type
    WHEN 'create' THEN
      time_window := interval '1 hour';
      max_operations := 20;
    WHEN 'update' THEN
      time_window := interval '1 hour';
      max_operations := 50;
    WHEN 'delete' THEN
      time_window := interval '1 hour';
      max_operations := 10;
    ELSE
      time_window := interval '1 hour';
      max_operations := 30;
  END CASE;
  
  -- Count recent operations
  SELECT COUNT(*) INTO recent_operations
  FROM public.security_audit_log
  WHERE user_id = auth.uid()
    AND event_type = 'client_' || operation_type
    AND created_at > now() - time_window;
  
  IF recent_operations >= max_operations THEN
    PERFORM public.secure_log_security_event(
      'client_rate_limit_exceeded',
      auth.uid(),
      jsonb_build_object(
        'operation_type', operation_type,
        'recent_operations', recent_operations,
        'time_window', time_window::text,
        'max_allowed', max_operations
      ),
      4
    );
    RETURN false;
  END IF;
  
  RETURN true;
END;
$function$;