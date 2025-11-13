-- Adicionar função de debug para verificar o security level de um usuário
CREATE OR REPLACE FUNCTION public.debug_user_security_info()
RETURNS TABLE (
  current_user_id uuid,
  security_level text,
  has_supervisor_role boolean,
  profile_role text,
  profile_approved boolean,
  filial_id uuid,
  filial_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    auth.uid() as current_user_id,
    get_user_security_level() as security_level,
    has_role(auth.uid(), 'supervisor'::app_role) as has_supervisor_role,
    p.role as profile_role,
    (p.approval_status = 'approved') as profile_approved,
    p.filial_id,
    f.nome as filial_name
  FROM profiles p
  LEFT JOIN filiais f ON f.id = p.filial_id
  WHERE p.user_id = auth.uid();
$$;