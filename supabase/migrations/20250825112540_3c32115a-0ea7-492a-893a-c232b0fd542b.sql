-- Final security fixes: Add search_path to remaining functions without dropping dependencies

-- Update remaining functions with search_path (keeping existing signatures)
CREATE OR REPLACE FUNCTION public.log_sensitive_data_access(resource_name text, access_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    details,
    risk_score
  ) VALUES (
    'sensitive_data_access',
    auth.uid(),
    json_build_object(
      'resource', resource_name,
      'access_type', access_type,
      'timestamp', now()
    ),
    CASE 
      WHEN access_type = 'read' THEN 3
      WHEN access_type = 'write' THEN 6
      WHEN access_type = 'delete' THEN 8
      ELSE 4
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_task_creation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    details,
    risk_score
  ) VALUES (
    'task_created',
    auth.uid(),
    json_build_object(
      'task_id', NEW.id,
      'task_type', NEW.task_type,
      'is_high_value', (NEW.valor_venda > 10000)
    ),
    CASE WHEN NEW.valor_venda > 10000 THEN 4 ELSE 1 END
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.monitor_directory_access(access_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    details,
    risk_score
  ) VALUES (
    'directory_access_monitor',
    auth.uid(),
    json_build_object(
      'access_type', access_type,
      'timestamp', now()
    ),
    CASE 
      WHEN access_type = 'secure' THEN 3
      WHEN access_type = 'standard' THEN 1
      ELSE 2
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_user_directory_cache()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Only allow managers to refresh cache
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  ) THEN
    RAISE EXCEPTION 'Access denied: Only managers can refresh cache';
  END IF;

  -- Log cache refresh activity
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    details,
    risk_score
  ) VALUES (
    'cache_refresh',
    auth.uid(),
    json_build_object('action', 'refresh_user_directory_cache'),
    1
  );
  
  -- Cache refresh logic would go here
  -- For now, just logging the action
END;
$function$;

CREATE OR REPLACE FUNCTION public.secure_log_security_event(event_type_param text, event_details json DEFAULT '{}', risk_level integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Enhanced version with additional validation
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    ip_address,
    user_agent,
    details,
    risk_score
  ) VALUES (
    event_type_param,
    auth.uid(),
    current_setting('request.headers', true)::json ->> 'x-forwarded-for',
    current_setting('request.headers', true)::json ->> 'user-agent',
    event_details,
    LEAST(risk_level, 10) -- Cap at maximum risk level
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_role_secure(target_user_id uuid, new_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_user_role text;
  target_user_role text;
  update_allowed boolean := false;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  -- Get target user's current role
  SELECT role INTO target_user_role
  FROM public.profiles
  WHERE user_id = target_user_id;
  
  -- Check if update is allowed
  IF current_user_role = 'manager' AND auth.uid() != target_user_id THEN
    update_allowed := true;
  END IF;
  
  -- Log the attempt
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    details,
    risk_score
  ) VALUES (
    'role_update_attempt',
    auth.uid(),
    json_build_object(
      'target_user_id', target_user_id,
      'current_role', target_user_role,
      'requested_role', new_role,
      'allowed', update_allowed
    ),
    CASE WHEN update_allowed THEN 6 ELSE 9 END
  );
  
  -- Perform update if allowed
  IF update_allowed THEN
    UPDATE public.profiles
    SET role = new_role, updated_at = now()
    WHERE user_id = target_user_id;
  END IF;
  
  RETURN update_allowed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_task_input(task_type_param text, client_name text, description_param text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  is_valid boolean := true;
  validation_errors text[] := '{}';
BEGIN
  -- Validate task type
  IF task_type_param NOT IN ('call', 'visit', 'workshop') THEN
    is_valid := false;
    validation_errors := array_append(validation_errors, 'Invalid task type');
  END IF;
  
  -- Validate client name
  IF length(trim(client_name)) < 2 THEN
    is_valid := false;
    validation_errors := array_append(validation_errors, 'Client name too short');
  END IF;
  
  -- Validate description
  IF length(trim(description_param)) < 5 THEN
    is_valid := false;
    validation_errors := array_append(validation_errors, 'Description too short');
  END IF;
  
  -- Log validation attempt
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    details,
    risk_score
  ) VALUES (
    'input_validation',
    auth.uid(),
    json_build_object(
      'task_type', task_type_param,
      'client_name_length', length(client_name),
      'description_length', length(description_param),
      'is_valid', is_valid,
      'errors', validation_errors
    ),
    CASE WHEN is_valid THEN 1 ELSE 3 END
  );
  
  RETURN is_valid;
END;
$function$;