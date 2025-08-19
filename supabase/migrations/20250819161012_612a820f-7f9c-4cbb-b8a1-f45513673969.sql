-- Primeiro, vamos atualizar a política RLS que depende da função
-- Remover a política que está causando dependência
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Recriar a política sem dependência da função can_modify_user_role
CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Agora podemos remover e recriar as funções
DROP FUNCTION IF EXISTS public.can_modify_user_role(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.update_user_role_secure(uuid, text) CASCADE;

-- Recriar a função can_modify_user_role
CREATE OR REPLACE FUNCTION public.can_modify_user_role(target_user_id uuid, new_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  current_user_role text;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
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

-- Recriar a função update_user_role_secure que retorna JSON
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
    RETURN json_build_object('error', 'Acesso negado: você não tem permissão para alterar este role');
  END IF;
  
  -- Update the role
  UPDATE public.profiles
  SET role = new_role, updated_at = now()
  WHERE user_id = target_user_id
  RETURNING * INTO updated_user;
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Usuário não encontrado');
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Role atualizado com sucesso',
    'user_id', updated_user.user_id,
    'new_role', updated_user.role
  );
END;
$$;