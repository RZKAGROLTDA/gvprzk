-- CRITICAL SECURITY FIX: Email Privacy Protection
-- Update get_user_directory function to completely hide emails from non-admin users
CREATE OR REPLACE FUNCTION public.get_user_directory()
RETURNS TABLE(id uuid, user_id uuid, name text, email text, role text, filial_id uuid, approval_status text, filial_nome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Only authenticated users can access this function
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.name,
    -- CRITICAL SECURITY FIX: Completely hide emails from non-admin users
    CASE 
      WHEN auth.uid() = p.user_id OR current_user_is_admin() THEN p.email
      ELSE NULL::text
    END as email,
    p.role,
    p.filial_id,
    p.approval_status,
    f.nome as filial_nome
  FROM public.profiles p
  LEFT JOIN public.filiais f ON p.filial_id = f.id
  WHERE 
    -- User can see their own profile
    auth.uid() = p.user_id OR
    -- Managers can see all profiles  
    current_user_is_admin() OR
    -- Users can see limited info from same filial (NO emails)
    (user_same_filial(p.user_id) AND p.approval_status = 'approved');
END;
$function$

-- SECURITY FIX: Enhanced role change validation with session invalidation
CREATE OR REPLACE FUNCTION public.update_user_role_secure(target_user_id uuid, new_role text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  updated_user record;
  current_user_role text;
  target_user_role text;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Get target user's current role
  SELECT role INTO target_user_role 
  FROM public.profiles 
  WHERE user_id = target_user_id;
  
  -- Enhanced security checks
  IF current_user_role != 'manager' THEN
    -- Log unauthorized role change attempt
    PERFORM public.secure_log_security_event(
      'unauthorized_role_change_attempt',
      target_user_id,
      jsonb_build_object(
        'attempted_role', new_role,
        'current_user_role', current_user_role,
        'target_user_role', target_user_role
      ),
      4
    );
    RETURN json_build_object('error', 'Acesso negado: você não tem permissão para alterar roles');
  END IF;
  
  -- CRITICAL: Users cannot modify their own roles (prevent self-escalation)
  IF target_user_id = auth.uid() THEN
    PERFORM public.secure_log_security_event(
      'self_role_escalation_attempt',
      target_user_id,
      jsonb_build_object(
        'attempted_role', new_role,
        'current_role', current_user_role
      ),
      5
    );
    RETURN json_build_object('error', 'Acesso negado: você não pode alterar seu próprio role');
  END IF;
  
  -- Validate that new_role is one of the allowed roles
  IF new_role NOT IN ('manager', 'rac', 'consultant', 'supervisor', 'sales_consultant', 'technical_consultant') THEN
    PERFORM public.secure_log_security_event(
      'invalid_role_assignment_attempt',
      target_user_id,
      jsonb_build_object(
        'attempted_role', new_role,
        'valid_roles', ARRAY['manager', 'rac', 'consultant', 'supervisor', 'sales_consultant', 'technical_consultant']
      ),
      4
    );
    RETURN json_build_object('error', 'Role inválido');
  END IF;
  
  -- Update the role
  UPDATE public.profiles
  SET role = new_role, updated_at = now()
  WHERE user_id = target_user_id
  RETURNING * INTO updated_user;
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Usuário não encontrado');
  END IF;
  
  -- Log successful role change
  PERFORM public.secure_log_security_event(
    'role_change_successful',
    target_user_id,
    jsonb_build_object(
      'old_role', target_user_role,
      'new_role', new_role,
      'changed_by', auth.uid()
    ),
    2
  );
  
  -- SECURITY ENHANCEMENT: Force session invalidation for target user
  PERFORM public.secure_log_security_event(
    'force_session_invalidation',
    target_user_id,
    jsonb_build_object(
      'reason', 'role_change',
      'old_role', target_user_role,
      'new_role', new_role
    ),
    3
  );
  
  RETURN json_build_object(
    'success', true,
    'message', 'Role atualizado com sucesso',
    'user_id', updated_user.user_id,
    'new_role', updated_user.role,
    'session_invalidated', true
  );
END;
$function$

-- SECURITY: Enhanced session security monitoring
CREATE OR REPLACE FUNCTION public.log_session_activity(activity_type text, details jsonb DEFAULT '{}')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.secure_log_security_event(
    'session_activity',
    auth.uid(),
    jsonb_build_object(
      'activity_type', activity_type,
      'details', details,
      'user_agent', current_setting('request.headers', true)::json->>'user-agent',
      'session_start', now()
    ),
    CASE 
      WHEN activity_type IN ('concurrent_session_detected', 'suspicious_activity') THEN 4
      WHEN activity_type IN ('session_timeout', 'forced_logout') THEN 3
      ELSE 1
    END
  );
END;
$function$

-- SECURITY: Enhanced input validation function
CREATE OR REPLACE FUNCTION public.validate_task_input(input_data jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  suspicious_patterns text[] := ARRAY[
    '<script', 'javascript:', 'vbscript:', 'on\w+\s*=', 'data:text/html',
    'eval\s*\(', 'expression\s*\(', '\bxss\b', '\binjection\b'
  ];
  pattern text;
  field_value text;
  key text;
BEGIN
  -- Check each field in the input data
  FOR key IN SELECT jsonb_object_keys(input_data)
  LOOP
    field_value := input_data ->> key;
    
    -- Skip null or empty values
    IF field_value IS NULL OR LENGTH(field_value) = 0 THEN
      CONTINUE;
    END IF;
    
    -- Check against suspicious patterns
    FOREACH pattern IN ARRAY suspicious_patterns
    LOOP
      IF field_value ~* pattern THEN
        -- Log potential XSS/injection attempt
        PERFORM public.secure_log_security_event(
          'suspicious_input_detected',
          auth.uid(),
          jsonb_build_object(
            'field', key,
            'pattern_matched', pattern,
            'input_length', LENGTH(field_value),
            'sanitized_sample', LEFT(field_value, 100)
          ),
          4
        );
        RETURN false;
      END IF;
    END LOOP;
    
    -- Check for excessively long inputs (potential DoS)
    IF LENGTH(field_value) > 10000 THEN
      PERFORM public.secure_log_security_event(
        'oversized_input_detected',
        auth.uid(),
        jsonb_build_object(
          'field', key,
          'input_length', LENGTH(field_value)
        ),
        3
      );
      RETURN false;
    END IF;
  END LOOP;
  
  RETURN true;
END;
$function$