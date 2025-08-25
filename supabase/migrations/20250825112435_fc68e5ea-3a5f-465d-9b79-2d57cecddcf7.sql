-- Complete remaining security fixes for all functions

-- Drop functions that need return type changes
DROP FUNCTION IF EXISTS public.cleanup_security_audit_logs();
DROP FUNCTION IF EXISTS public.generate_invitation_token(text, text, text, uuid);
DROP FUNCTION IF EXISTS public.get_secure_user_directory();
DROP FUNCTION IF EXISTS public.get_user_directory();
DROP FUNCTION IF EXISTS public.get_user_filial_id();
DROP FUNCTION IF EXISTS public.is_admin_by_email(text);
DROP FUNCTION IF EXISTS public.is_high_value_task(numeric);
DROP FUNCTION IF EXISTS public.log_high_risk_activity(text, json, integer);
DROP FUNCTION IF EXISTS public.log_security_event(text, json, integer);
DROP FUNCTION IF EXISTS public.log_sensitive_data_access(text, text);
DROP FUNCTION IF EXISTS public.log_task_creation();
DROP FUNCTION IF EXISTS public.monitor_directory_access(text);
DROP FUNCTION IF EXISTS public.refresh_user_directory_cache();
DROP FUNCTION IF EXISTS public.secure_log_security_event(text, json, integer);
DROP FUNCTION IF EXISTS public.update_user_role_secure(uuid, text);
DROP FUNCTION IF EXISTS public.validate_task_input(text, text, text);

-- Recreate all functions with proper search_path
CREATE OR REPLACE FUNCTION public.cleanup_security_audit_logs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  deleted_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  ) THEN
    RAISE EXCEPTION 'Access denied: Only managers can cleanup audit logs';
  END IF;

  DELETE FROM public.security_audit_log
  WHERE created_at < (now() - interval '90 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_invitation_token(user_email text, user_role text DEFAULT 'consultant', filial_id_param uuid DEFAULT NULL, invited_by_param uuid DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  token_value text;
  expiry_time timestamp with time zone;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  ) THEN
    RAISE EXCEPTION 'Access denied: Only managers can generate invitation tokens';
  END IF;

  token_value := encode(gen_random_bytes(32), 'base64');
  expiry_time := now() + interval '7 days';
  
  INSERT INTO public.invitation_tokens (
    email, token, role, expires_at, filial_id, invited_by
  ) VALUES (
    user_email, token_value, user_role, expiry_time, filial_id_param, COALESCE(invited_by_param, auth.uid())
  );
  
  INSERT INTO public.security_audit_log (
    event_type, user_id, details, risk_score
  ) VALUES (
    'invitation_generated', auth.uid(),
    json_build_object('email', user_email, 'role', user_role, 'filial_id', filial_id_param),
    3
  );
  
  RETURN token_value;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_secure_user_directory()
 RETURNS TABLE(id uuid, name text, email text, role text, filial_name text, approval_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  ) THEN
    RAISE EXCEPTION 'Access denied: Only managers can access user directory';
  END IF;

  INSERT INTO public.security_audit_log (
    event_type, user_id, details, risk_score
  ) VALUES (
    'directory_access', auth.uid(), json_build_object('type', 'secure_directory'), 2
  );

  RETURN QUERY
  SELECT p.user_id, p.name, p.email, p.role, f.nome, p.approval_status
  FROM public.profiles p
  LEFT JOIN public.filiais f ON p.filial_id = f.id
  ORDER BY p.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_directory()
 RETURNS TABLE(id uuid, name text, role text, filial_name text, approval_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.security_audit_log (
    event_type, user_id, details, risk_score
  ) VALUES (
    'directory_access', auth.uid(), json_build_object('type', 'standard_directory'), 1
  );

  RETURN QUERY
  SELECT p.user_id, p.name, p.role, f.nome, p.approval_status
  FROM public.profiles p
  LEFT JOIN public.filiais f ON p.filial_id = f.id
  WHERE p.role IN ('consultant', 'manager')
  ORDER BY p.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_filial_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT filial_id FROM public.profiles WHERE user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_by_email(user_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE email = user_email AND role = 'manager'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_high_value_task(task_value numeric)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT task_value > 10000;
$function$;

CREATE OR REPLACE FUNCTION public.log_high_risk_activity(activity_type text, activity_details json DEFAULT '{}', risk_level integer DEFAULT 8)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.security_audit_log (
    event_type, user_id, details, risk_score
  ) VALUES (
    activity_type, auth.uid(), activity_details, risk_level
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_security_event(event_type_param text, event_details json DEFAULT '{}', risk_level integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.security_audit_log (
    event_type, user_id, details, risk_score
  ) VALUES (
    event_type_param, auth.uid(), event_details, risk_level
  );
END;
$function$;