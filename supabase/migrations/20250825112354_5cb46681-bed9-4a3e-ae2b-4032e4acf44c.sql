-- Fix function return type conflicts and complete security fixes

-- Drop and recreate functions with correct signatures
DROP FUNCTION IF EXISTS public.clean_duplicate_tasks();
DROP FUNCTION IF EXISTS public.cleanup_invitation_tokens();

-- Recreate clean_duplicate_tasks with correct return type
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

-- Recreate cleanup_invitation_tokens with correct signature
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

-- Update remaining functions with search_path
CREATE OR REPLACE FUNCTION public.cleanup_security_audit_logs()
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
    RAISE EXCEPTION 'Access denied: Only managers can cleanup audit logs';
  END IF;

  -- Delete logs older than 90 days to maintain data retention policy
  DELETE FROM public.security_audit_log
  WHERE created_at < (now() - interval '90 days');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$function$;

-- Update consume_invitation_token function
CREATE OR REPLACE FUNCTION public.consume_invitation_token(token_value text, user_email text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  token_record record;
  result json;
BEGIN
  -- Find and validate the token
  SELECT * INTO token_record
  FROM public.invitation_tokens
  WHERE token = token_value
    AND email = user_email
    AND used_at IS NULL
    AND expires_at > now();
  
  IF NOT FOUND THEN
    -- Log failed token consumption
    INSERT INTO public.security_audit_log (
      event_type,
      user_id,
      details,
      risk_score
    ) VALUES (
      'invalid_token_usage',
      null,
      json_build_object(
        'email', user_email,
        'token_provided', left(token_value, 8) || '...',
        'reason', 'Token not found, expired, or already used'
      ),
      6
    );
    
    RETURN json_build_object('success', false, 'error', 'Invalid or expired token');
  END IF;
  
  -- Mark token as used
  UPDATE public.invitation_tokens
  SET used_at = now()
  WHERE id = token_record.id;
  
  -- Log successful token consumption
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    details,
    risk_score
  ) VALUES (
    'token_consumed',
    auth.uid(),
    json_build_object(
      'email', user_email,
      'invited_by', token_record.invited_by,
      'filial_id', token_record.filial_id
    ),
    1
  );
  
  RETURN json_build_object(
    'success', true,
    'filial_id', token_record.filial_id,
    'role', token_record.role,
    'invited_by', token_record.invited_by
  );
END;
$function$;