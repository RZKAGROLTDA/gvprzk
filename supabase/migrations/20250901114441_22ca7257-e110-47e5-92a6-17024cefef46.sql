-- Continue fixing remaining SECURITY DEFINER functions

-- 3. Fix all remaining security-related functions
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