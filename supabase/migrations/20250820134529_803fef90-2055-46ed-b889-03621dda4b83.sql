-- Fix the update_user_role_secure function to use qualified schema name
CREATE OR REPLACE FUNCTION public.update_user_role_secure(target_user_id uuid, new_role text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  updated_user record;
BEGIN
  -- Check if current user can modify the target user's role
  IF NOT public.can_modify_user_role(target_user_id, new_role) THEN
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
$function$