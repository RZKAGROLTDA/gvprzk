-- Corrigir função can_modify_user_role e update_user_role_secure
-- Primeiro, remover as funções existentes se houver problema
DROP FUNCTION IF EXISTS public.can_modify_user_role(uuid, text);
DROP FUNCTION IF EXISTS public.update_user_role_secure(uuid, text);

-- Recriar a função can_modify_user_role com validações corretas
CREATE OR REPLACE FUNCTION public.can_modify_user_role(target_user_id uuid, new_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  current_user_role text;
  target_current_role text;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Get target user's current role
  SELECT role INTO target_current_role
  FROM public.profiles
  WHERE user_id = target_user_id;
  
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
$$;

-- Recriar a função update_user_role_secure
CREATE OR REPLACE FUNCTION public.update_user_role_secure(target_user_id uuid, new_role text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  updated_user record;
BEGIN
  -- Check if current user can modify the target user's role
  IF NOT can_modify_user_role(target_user_id, new_role) THEN
    RETURN json_build_object('error', 'insufficient privilege');
  END IF;
  
  -- Update the role
  UPDATE public.profiles
  SET role = new_role, updated_at = now()
  WHERE user_id = target_user_id
  RETURNING * INTO updated_user;
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'User not found');
  END IF;
  
  -- Log the role change for audit
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    target_user_id,
    metadata
  ) VALUES (
    'role_change',
    auth.uid(),
    target_user_id,
    json_build_object(
      'old_role', (SELECT role FROM public.profiles WHERE user_id = target_user_id),
      'new_role', new_role
    )
  );
  
  RETURN json_build_object(
    'success', true,
    'message', 'Role updated successfully',
    'user_id', updated_user.user_id,
    'new_role', updated_user.role
  );
END;
$$;