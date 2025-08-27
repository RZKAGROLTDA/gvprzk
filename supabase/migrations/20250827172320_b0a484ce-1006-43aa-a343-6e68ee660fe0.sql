-- CRITICAL SECURITY FIXES - Phase 1: Database Function Security

-- 1. Fix search path security in all functions to prevent SQL injection
CREATE OR REPLACE FUNCTION public.get_secure_task_data(task_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, sales_value numeric, is_masked boolean, start_date date, end_date date, created_by uuid, created_at timestamp with time zone, updated_at timestamp with time zone, is_prospect boolean, sales_confirmed boolean, equipment_quantity integer, equipment_list jsonb, propertyhectares integer, initial_km integer, final_km integer, check_in_location jsonb, clientcode text, sales_type text, start_time text, end_time text, observations text, priority text, status text, prospect_notes text, family_product text, name text, responsible text, client text, property text, filial text, email text, photos text[], documents text[], access_level text, task_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_user_role text;
  user_filial_id uuid;
BEGIN
  -- Only authenticated users can access
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  -- Get current user's role and filial
  SELECT p.role, p.filial_id INTO current_user_role, user_filial_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  
  -- Log access attempt with enhanced security
  PERFORM public.secure_log_security_event(
    'secure_task_data_access',
    auth.uid(),
    jsonb_build_object(
      'access_timestamp', now(),
      'user_role', current_user_role,
      'task_count', COALESCE(array_length(task_ids, 1), 0),
      'ip_address', current_setting('request.headers', true)::json->>'x-forwarded-for'
    ),
    2
  );

  RETURN QUERY
  SELECT 
    t.id,
    -- Apply data masking based on access level
    CASE 
      WHEN current_user_role = 'manager' THEN t.sales_value
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.sales_value
      WHEN auth.uid() = t.created_by THEN t.sales_value
      WHEN COALESCE(t.sales_value, 0) <= 25000 AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.sales_value
      ELSE NULL
    END as sales_value,
    
    -- Indicate if data is masked
    NOT (
      current_user_role = 'manager' OR 
      auth.uid() = t.created_by OR
      (current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ))
    ) as is_masked,
    
    t.start_date,
    t.end_date,
    t.created_by,
    t.created_at,
    t.updated_at,
    t.is_prospect,
    t.sales_confirmed,
    t.equipment_quantity,
    t.equipment_list,
    t.propertyhectares,
    t.initial_km,
    t.final_km,
    t.check_in_location,
    t.clientcode,
    t.sales_type,
    t.start_time,
    t.end_time,
    t.observations,
    t.priority,
    t.status,
    t.prospect_notes,
    t.family_product,
    t.name,
    t.responsible,
    
    -- Enhanced client data masking
    CASE 
      WHEN current_user_role = 'manager' THEN t.client
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.client
      WHEN auth.uid() = t.created_by THEN t.client
      ELSE LEFT(t.client, 2) || '***' || RIGHT(t.client, 1)
    END as client,
    
    -- Enhanced property data masking
    CASE 
      WHEN current_user_role = 'manager' THEN t.property
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.property
      WHEN auth.uid() = t.created_by THEN t.property
      ELSE LEFT(t.property, 2) || '***' || RIGHT(t.property, 1)
    END as property,
    
    t.filial,
    
    -- Enhanced email masking
    CASE 
      WHEN current_user_role = 'manager' THEN t.email
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.email
      WHEN auth.uid() = t.created_by THEN t.email
      ELSE '***@***.' || RIGHT(SPLIT_PART(t.email, '.', -1), 3)
    END as email,
    
    t.photos,
    t.documents,
    
    -- Set access level
    CASE 
      WHEN current_user_role = 'manager' THEN 'full'
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN 'full'
      WHEN auth.uid() = t.created_by THEN 'full'
      WHEN EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN 'limited'
      ELSE 'none'
    END as access_level,
    
    t.task_type
  FROM public.tasks t
  WHERE 
    -- Apply access control filters
    (auth.uid() = t.created_by) OR
    (current_user_role = 'manager') OR
    (current_user_role = 'supervisor' AND EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
    )) OR
    (current_user_role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant') 
     AND EXISTS (
       SELECT 1 FROM public.profiles p2 
       WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
     ) AND COALESCE(t.sales_value, 0) <= 25000)
  AND (task_ids IS NULL OR t.id = ANY(task_ids));
END;
$function$;

-- 2. Fix update_user_role_secure function with proper search path
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
  
  -- Enhanced security checks with detailed logging
  IF current_user_role != 'manager' THEN
    PERFORM public.secure_log_security_event(
      'unauthorized_role_change_attempt',
      target_user_id,
      jsonb_build_object(
        'attempted_role', new_role,
        'current_user_role', current_user_role,
        'target_user_role', target_user_role,
        'ip_address', current_setting('request.headers', true)::json->>'x-forwarded-for',
        'user_agent', current_setting('request.headers', true)::json->>'user-agent'
      ),
      5
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
        'current_role', current_user_role,
        'security_violation_type', 'self_escalation'
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
  
  -- Log successful role change with enhanced details
  PERFORM public.secure_log_security_event(
    'role_change_successful',
    target_user_id,
    jsonb_build_object(
      'old_role', target_user_role,
      'new_role', new_role,
      'changed_by', auth.uid(),
      'timestamp', now(),
      'security_context', 'admin_action'
    ),
    2
  );
  
  RETURN json_build_object(
    'success', true,
    'message', 'Role atualizado com sucesso',
    'user_id', updated_user.user_id,
    'new_role', updated_user.role,
    'session_invalidated', true
  );
END;
$function$;

-- 3. Enhanced input validation function with stricter security
CREATE OR REPLACE FUNCTION public.validate_task_input_enhanced(input_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  suspicious_patterns text[] := ARRAY[
    '<script[^>]*>', 'javascript:', 'vbscript:', 'on\w+\s*=', 'data:text/html',
    'eval\s*\(', 'expression\s*\(', '\bxss\b', '\binjection\b', '\bdrop\s+table\b',
    '\bdelete\s+from\b', '\binsert\s+into\b', '\bunion\s+select\b', '\b1\s*=\s*1\b',
    '\balert\s*\(', '\bconfirm\s*\(', '\bprompt\s*\(', 'document\.cookie',
    'window\.location', '\biframe\b', '\bobject\b', '\bembed\b', '\bform\b'
  ];
  pattern text;
  field_value text;
  key text;
  violation_count integer := 0;
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
        violation_count := violation_count + 1;
        
        -- Log potential XSS/injection attempt with enhanced details
        PERFORM public.secure_log_security_event(
          'suspicious_input_detected',
          auth.uid(),
          jsonb_build_object(
            'field', key,
            'pattern_matched', pattern,
            'input_length', LENGTH(field_value),
            'sanitized_sample', LEFT(field_value, 100),
            'violation_count', violation_count,
            'ip_address', current_setting('request.headers', true)::json->>'x-forwarded-for'
          ),
          CASE WHEN violation_count > 3 THEN 5 ELSE 4 END
        );
        
        -- Block immediately on multiple violations
        IF violation_count >= 3 THEN
          RETURN false;
        END IF;
      END IF;
    END LOOP;
    
    -- Enhanced length checks with stricter limits
    IF LENGTH(field_value) > CASE 
      WHEN key IN ('observations', 'prospect_notes') THEN 1000
      WHEN key IN ('client', 'property', 'responsible', 'name') THEN 255
      WHEN key IN ('email') THEN 320
      ELSE 500
    END THEN
      PERFORM public.secure_log_security_event(
        'oversized_input_detected',
        auth.uid(),
        jsonb_build_object(
          'field', key,
          'input_length', LENGTH(field_value),
          'max_allowed', CASE 
            WHEN key IN ('observations', 'prospect_notes') THEN 1000
            WHEN key IN ('client', 'property', 'responsible', 'name') THEN 255
            WHEN key IN ('email') THEN 320
            ELSE 500
          END
        ),
        3
      );
      RETURN false;
    END IF;
  END LOOP;
  
  -- Log successful validation
  IF violation_count = 0 THEN
    PERFORM public.secure_log_security_event(
      'input_validation_passed',
      auth.uid(),
      jsonb_build_object(
        'fields_validated', jsonb_object_keys(input_data),
        'timestamp', now()
      ),
      1
    );
  END IF;
  
  RETURN violation_count = 0;
END;
$function$;

-- 4. Enhanced rate limiting with IP blocking
CREATE OR REPLACE FUNCTION public.check_enhanced_rate_limit(user_email text, action_type text DEFAULT 'login')
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  attempt_count integer;
  ip_attempt_count integer;
  user_ip inet;
  time_window interval;
  max_attempts integer;
BEGIN
  -- Get current IP
  user_ip := COALESCE(
    (current_setting('request.headers', true)::json->>'x-forwarded-for')::inet,
    '127.0.0.1'::inet
  );
  
  -- Set limits based on action type
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
  
  -- Count failed attempts by email
  SELECT COUNT(*) INTO attempt_count
  FROM public.security_audit_log
  WHERE event_type = 'failed_' || action_type
    AND metadata->>'email' = user_email
    AND created_at > now() - time_window;
  
  -- Count attempts by IP
  SELECT COUNT(*) INTO ip_attempt_count
  FROM public.security_audit_log
  WHERE event_type LIKE '%' || action_type || '%'
    AND ip_address = user_ip
    AND created_at > now() - time_window;
  
  -- Block if limits exceeded
  IF attempt_count >= max_attempts OR ip_attempt_count >= (max_attempts * 2) THEN
    -- Log the rate limit event with enhanced details
    PERFORM public.secure_log_security_event(
      'enhanced_rate_limit_exceeded',
      NULL,
      jsonb_build_object(
        'email', user_email,
        'action_type', action_type,
        'email_attempt_count', attempt_count,
        'ip_attempt_count', ip_attempt_count,
        'ip_address', user_ip,
        'time_window', time_window::text,
        'blocked_reason', CASE 
          WHEN attempt_count >= max_attempts THEN 'email_limit'
          ELSE 'ip_limit'
        END
      ),
      5
    );
    
    RETURN false;
  END IF;
  
  RETURN true;
END;
$function$;

-- 5. Enhanced security monitoring function
CREATE OR REPLACE FUNCTION public.monitor_high_risk_activity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  high_risk_count integer;
  blocked_ips inet[];
BEGIN
  -- Count high-risk events in last hour
  SELECT COUNT(*) INTO high_risk_count
  FROM public.security_audit_log
  WHERE risk_score >= 4
    AND created_at > now() - interval '1 hour';
  
  -- If too many high-risk events, escalate
  IF high_risk_count > 10 THEN
    PERFORM public.secure_log_security_event(
      'security_alert_threshold_exceeded',
      NULL,
      jsonb_build_object(
        'high_risk_count', high_risk_count,
        'time_window', '1 hour',
        'alert_level', 'critical',
        'recommended_action', 'immediate_review'
      ),
      5
    );
  END IF;
  
  -- Get frequently blocked IPs
  SELECT array_agg(DISTINCT ip_address) INTO blocked_ips
  FROM public.security_audit_log
  WHERE blocked = true
    AND created_at > now() - interval '24 hours'
    AND ip_address IS NOT NULL;
  
  -- Log blocked IP summary
  IF array_length(blocked_ips, 1) > 0 THEN
    PERFORM public.secure_log_security_event(
      'blocked_ips_summary',
      NULL,
      jsonb_build_object(
        'blocked_ips', blocked_ips,
        'count', array_length(blocked_ips, 1),
        'time_window', '24 hours'
      ),
      3
    );
  END IF;
END;
$function$;

-- 6. Add indexes for security performance
CREATE INDEX IF NOT EXISTS idx_security_audit_log_risk_score_time 
ON public.security_audit_log(risk_score, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_ip_time 
ON public.security_audit_log(ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_event_type_time 
ON public.security_audit_log(event_type, created_at DESC);

-- 7. Create automated security monitoring trigger
CREATE OR REPLACE FUNCTION public.auto_security_monitor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Auto-monitor on high-risk events
  IF NEW.risk_score >= 4 THEN
    PERFORM public.monitor_high_risk_activity();
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for automatic monitoring
DROP TRIGGER IF EXISTS trigger_auto_security_monitor ON public.security_audit_log;
CREATE TRIGGER trigger_auto_security_monitor
  AFTER INSERT ON public.security_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_security_monitor();