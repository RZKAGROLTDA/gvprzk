-- CRITICAL SECURITY FIXES - Fixed Version

-- 1. Fix search path security in key functions
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  SELECT p.role, p.filial_id INTO current_user_role, user_filial_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  
  PERFORM public.secure_log_security_event(
    'secure_task_data_access',
    auth.uid(),
    jsonb_build_object(
      'access_timestamp', now(),
      'user_role', current_user_role,
      'task_count', COALESCE(array_length(task_ids, 1), 0)
    ),
    2
  );

  RETURN QUERY
  SELECT 
    t.id,
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
    
    NOT (
      current_user_role = 'manager' OR 
      auth.uid() = t.created_by OR
      (current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ))
    ) as is_masked,
    
    t.start_date, t.end_date, t.created_by, t.created_at, t.updated_at,
    t.is_prospect, t.sales_confirmed, t.equipment_quantity, t.equipment_list,
    t.propertyhectares, t.initial_km, t.final_km, t.check_in_location,
    t.clientcode, t.sales_type, t.start_time, t.end_time, t.observations,
    t.priority, t.status, t.prospect_notes, t.family_product,
    t.name, t.responsible,
    
    CASE 
      WHEN current_user_role = 'manager' THEN t.client
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.client
      WHEN auth.uid() = t.created_by THEN t.client
      ELSE LEFT(t.client, 2) || '***' || RIGHT(t.client, 1)
    END as client,
    
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
    
    CASE 
      WHEN current_user_role = 'manager' THEN t.email
      WHEN current_user_role = 'supervisor' AND EXISTS (
        SELECT 1 FROM public.profiles p2 
        WHERE p2.user_id = t.created_by AND p2.filial_id = user_filial_id
      ) THEN t.email
      WHEN auth.uid() = t.created_by THEN t.email
      ELSE '***@***.***'
    END as email,
    
    t.photos, t.documents,
    
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
  SELECT role INTO current_user_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  SELECT role INTO target_user_role 
  FROM public.profiles 
  WHERE user_id = target_user_id;
  
  IF current_user_role != 'manager' THEN
    PERFORM public.secure_log_security_event(
      'unauthorized_role_change_attempt',
      target_user_id,
      jsonb_build_object(
        'attempted_role', new_role,
        'current_user_role', current_user_role,
        'target_user_role', target_user_role
      ),
      5
    );
    RETURN json_build_object('error', 'Acesso negado: você não tem permissão para alterar roles');
  END IF;
  
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
  
  IF new_role NOT IN ('manager', 'rac', 'consultant', 'supervisor', 'sales_consultant', 'technical_consultant') THEN
    PERFORM public.secure_log_security_event(
      'invalid_role_assignment_attempt',
      target_user_id,
      jsonb_build_object('attempted_role', new_role),
      4
    );
    RETURN json_build_object('error', 'Role inválido');
  END IF;
  
  UPDATE public.profiles
  SET role = new_role, updated_at = now()
  WHERE user_id = target_user_id
  RETURNING * INTO updated_user;
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Usuário não encontrado');
  END IF;
  
  PERFORM public.secure_log_security_event(
    'role_change_successful',
    target_user_id,
    jsonb_build_object(
      'old_role', target_user_role,
      'new_role', new_role,
      'changed_by', auth.uid(),
      'timestamp', now()
    ),
    2
  );
  
  RETURN json_build_object(
    'success', true,
    'message', 'Role atualizado com sucesso',
    'user_id', updated_user.user_id,
    'new_role', updated_user.role
  );
END;
$function$;

-- 3. Enhanced rate limiting function
CREATE OR REPLACE FUNCTION public.check_enhanced_rate_limit(user_email text, action_type text DEFAULT 'login')
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
  FROM public.security_audit_log
  WHERE event_type = 'failed_' || action_type
    AND metadata->>'email' = user_email
    AND created_at > now() - time_window;
  
  IF attempt_count >= max_attempts THEN
    PERFORM public.secure_log_security_event(
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

-- 4. Add security monitoring indexes
CREATE INDEX IF NOT EXISTS idx_security_audit_log_risk_score_time 
ON public.security_audit_log(risk_score, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_event_type_time 
ON public.security_audit_log(event_type, created_at DESC);

-- 5. Enhanced security monitoring function
CREATE OR REPLACE FUNCTION public.monitor_high_risk_activity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  high_risk_count integer;
BEGIN
  SELECT COUNT(*) INTO high_risk_count
  FROM public.security_audit_log
  WHERE risk_score >= 4
    AND created_at > now() - interval '1 hour';
  
  IF high_risk_count > 10 THEN
    PERFORM public.secure_log_security_event(
      'security_alert_threshold_exceeded',
      NULL,
      jsonb_build_object(
        'high_risk_count', high_risk_count,
        'time_window', '1 hour',
        'alert_level', 'critical'
      ),
      5
    );
  END IF;
END;
$function$;