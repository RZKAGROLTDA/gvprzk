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
$function$;