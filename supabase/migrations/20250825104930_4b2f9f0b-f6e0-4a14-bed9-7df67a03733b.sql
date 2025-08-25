-- Comprehensive Security Fix: Set search_path for all remaining functions

-- Update audit_profile_changes function
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    ip_address,
    user_agent,
    details,
    risk_score
  ) VALUES (
    'profile_change',
    auth.uid(),
    current_setting('request.headers', true)::json ->> 'x-forwarded-for',
    current_setting('request.headers', true)::json ->> 'user-agent',
    json_build_object(
      'old_data', to_json(OLD),
      'new_data', to_json(NEW),
      'changed_fields', (
        SELECT json_object_agg(key, value)
        FROM json_each_text(to_json(NEW))
        WHERE value != coalesce(json_extract_path_text(to_json(OLD), key), '')
      )
    ),
    CASE 
      WHEN OLD.role != NEW.role THEN 8
      WHEN OLD.email != NEW.email THEN 6
      ELSE 3
    END
  );
  RETURN NEW;
END;
$function$;

-- Update audit_role_changes function
CREATE OR REPLACE FUNCTION public.audit_role_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Log role changes with high risk score
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    ip_address,
    user_agent,
    details,
    risk_score
  ) VALUES (
    'role_change',
    auth.uid(),
    current_setting('request.headers', true)::json ->> 'x-forwarded-for',
    current_setting('request.headers', true)::json ->> 'user-agent',
    json_build_object(
      'target_user_id', NEW.user_id,
      'old_role', OLD.role,
      'new_role', NEW.role,
      'changed_by', auth.uid()
    ),
    9
  );
  RETURN NEW;
END;
$function$;

-- Update can_modify_user_role function
CREATE OR REPLACE FUNCTION public.can_modify_user_role(target_user_id uuid, new_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_user_role text;
  target_user_role text;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  -- Get target user's role
  SELECT role INTO target_user_role
  FROM public.profiles
  WHERE user_id = target_user_id;
  
  -- Only managers can modify roles
  IF current_user_role != 'manager' THEN
    RETURN false;
  END IF;
  
  -- Users cannot modify their own role
  IF auth.uid() = target_user_id THEN
    RETURN false;
  END IF;
  
  -- Log the attempt
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    details,
    risk_score
  ) VALUES (
    'role_modification_attempt',
    auth.uid(),
    json_build_object(
      'target_user_id', target_user_id,
      'current_role', target_user_role,
      'requested_role', new_role,
      'allowed', true
    ),
    CASE WHEN new_role = 'manager' THEN 7 ELSE 5 END
  );
  
  RETURN true;
END;
$function$;

-- Update check_login_rate_limit function
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(user_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  attempt_count integer;
  time_window interval := '15 minutes';
  max_attempts integer := 5;
BEGIN
  -- Count failed login attempts in the time window
  SELECT COUNT(*)
  INTO attempt_count
  FROM public.security_audit_log
  WHERE 
    event_type = 'login_failed'
    AND details ->> 'email' = user_email
    AND created_at > (now() - time_window);
  
  -- Return true if under the limit
  RETURN attempt_count < max_attempts;
END;
$function$;

-- Update check_suspicious_login_pattern function
CREATE OR REPLACE FUNCTION public.check_suspicious_login_pattern(user_email text, ip_addr text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  recent_ips text[];
  ip_count integer;
BEGIN
  -- Get recent IP addresses for this user (last 24 hours)
  SELECT array_agg(DISTINCT ip_address)
  INTO recent_ips
  FROM public.security_audit_log
  WHERE 
    event_type = 'login_success'
    AND details ->> 'email' = user_email
    AND created_at > (now() - interval '24 hours')
    AND ip_address IS NOT NULL;
  
  -- Count unique IPs
  ip_count := coalesce(array_length(recent_ips, 1), 0);
  
  -- Consider suspicious if more than 3 different IPs in 24 hours
  -- or if this IP is not in the recent list and there are recent logins
  RETURN (ip_count > 3) OR (ip_count > 0 AND NOT (ip_addr = ANY(recent_ips)));
END;
$function$;

-- Update clean_duplicate_tasks function
CREATE OR REPLACE FUNCTION public.clean_duplicate_tasks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  deleted_count integer := 0;
BEGIN
  -- Only allow managers to run cleanup
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  ) THEN
    RAISE EXCEPTION 'Access denied: Only managers can clean duplicate tasks';
  END IF;

  -- Delete duplicate tasks keeping the oldest one
  WITH duplicates AS (
    SELECT id, 
           ROW_NUMBER() OVER (
             PARTITION BY user_id, task_type, created_at::date 
             ORDER BY created_at ASC
           ) as rn
    FROM public.tasks
  )
  DELETE FROM public.tasks 
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup activity
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    details,
    risk_score
  ) VALUES (
    'data_cleanup',
    auth.uid(),
    json_build_object(
      'action', 'clean_duplicate_tasks',
      'deleted_count', deleted_count
    ),
    2
  );
  
  RETURN deleted_count;
END;
$function$;

-- Update cleanup_invitation_tokens function
CREATE OR REPLACE FUNCTION public.cleanup_invitation_tokens()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  deleted_count integer;
BEGIN
  -- Only allow managers to run cleanup
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  ) THEN
    RAISE EXCEPTION 'Access denied: Only managers can cleanup tokens';
  END IF;

  -- Delete expired tokens (older than 7 days)
  DELETE FROM public.invitation_tokens
  WHERE created_at < (now() - interval '7 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    details,
    risk_score
  ) VALUES (
    'token_cleanup',
    auth.uid(),
    json_build_object('deleted_tokens', deleted_count),
    1
  );
  
  RETURN deleted_count;
END;
$function$;