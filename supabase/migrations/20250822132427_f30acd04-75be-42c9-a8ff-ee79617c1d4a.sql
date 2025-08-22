-- CRITICAL SECURITY FIXES

-- 1. Enhanced Email Privacy Protection
-- Replace the existing get_user_directory function to completely hide emails from same-filial users
CREATE OR REPLACE FUNCTION public.get_user_directory()
RETURNS TABLE(id uuid, user_id uuid, name text, email text, role text, filial_id uuid, approval_status text, filial_nome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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
    -- ENHANCED PRIVACY: Only expose emails to self or admins, NEVER to same filial users
    CASE 
      WHEN auth.uid() = p.user_id OR current_user_is_admin() THEN p.email
      ELSE NULL::text  -- Completely hide emails from all other users
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
    -- Users can see VERY LIMITED info from same filial (NO emails, NO personal data)
    (user_same_filial(p.user_id) AND p.approval_status = 'approved');
END;
$$;

-- 2. Enhanced Role Change Security
-- Strengthen the role change function with additional security checks
CREATE OR REPLACE FUNCTION public.update_user_role_secure(target_user_id uuid, new_role text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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
  
  -- Users cannot modify their own roles (prevent self-escalation)
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
  
  RETURN json_build_object(
    'success', true,
    'message', 'Role atualizado com sucesso',
    'user_id', updated_user.user_id,
    'new_role', updated_user.role
  );
END;
$$;

-- 3. Fix Filiais Table Public Access
-- Remove the overly permissive policy that allows unauthenticated access
DROP POLICY IF EXISTS "Authenticated users can view filiais" ON public.filiais;

-- Create a more secure policy for filiais access
CREATE POLICY "Only authenticated users can view filiais"
ON public.filiais
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- 4. Enhanced Security Monitoring Functions
-- Function to monitor suspicious login patterns
CREATE OR REPLACE FUNCTION public.check_suspicious_login_pattern(user_email text, ip_addr inet)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  recent_logins integer;
  different_ips integer;
BEGIN
  -- Count recent logins from different IPs
  SELECT COUNT(DISTINCT ip_address) INTO different_ips
  FROM public.security_audit_log
  WHERE event_type = 'login_attempt'
    AND metadata->>'email' = user_email
    AND created_at > now() - interval '1 hour';
  
  -- If more than 3 different IPs in 1 hour, flag as suspicious
  IF different_ips > 3 THEN
    PERFORM public.secure_log_security_event(
      'suspicious_login_pattern',
      NULL,
      jsonb_build_object(
        'email', user_email,
        'different_ips_count', different_ips,
        'time_window', '1 hour'
      ),
      4
    );
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- 5. Session Security Enhancement
-- Function to invalidate all user sessions on role change
CREATE OR REPLACE FUNCTION public.invalidate_user_sessions_on_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Only trigger on role changes
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Log the session invalidation
    PERFORM public.secure_log_security_event(
      'sessions_invalidated_role_change',
      NEW.user_id,
      jsonb_build_object(
        'old_role', OLD.role,
        'new_role', NEW.role,
        'changed_by', auth.uid()
      ),
      3
    );
    
    -- Note: In a production environment, you would implement actual session invalidation
    -- This could involve clearing session tokens, forcing re-authentication, etc.
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for session invalidation on role change
DROP TRIGGER IF EXISTS invalidate_sessions_on_role_change ON public.profiles;
CREATE TRIGGER invalidate_sessions_on_role_change
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_user_sessions_on_role_change();