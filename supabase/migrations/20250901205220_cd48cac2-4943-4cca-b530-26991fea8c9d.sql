-- Criar função para atualização segura de roles de usuários
CREATE OR REPLACE FUNCTION public.update_user_role_secure(target_user_id uuid, new_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_role text;
  target_user_email text;
BEGIN
  -- Verificar se usuário está logado
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Acesso negado: Autenticação necessária');
  END IF;

  -- Obter role do usuário atual
  SELECT role INTO current_user_role
  FROM public.profiles
  WHERE user_id = auth.uid()
  AND approval_status = 'approved';

  -- Verificar se é manager
  IF current_user_role != 'manager' THEN
    RETURN jsonb_build_object('error', 'Acesso negado: Somente administradores podem alterar permissões');
  END IF;

  -- Verificar se não está tentando alterar a própria permissão
  IF target_user_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'Não é possível alterar a própria permissão');
  END IF;

  -- Validar novo role
  IF new_role NOT IN ('manager', 'supervisor', 'rac', 'consultant', 'sales_consultant', 'technical_consultant') THEN
    RETURN jsonb_build_object('error', 'Permissão inválida');
  END IF;

  -- Obter email do usuário alvo para log
  SELECT email INTO target_user_email
  FROM public.profiles
  WHERE user_id = target_user_id;

  IF target_user_email IS NULL THEN
    RETURN jsonb_build_object('error', 'Usuário não encontrado');
  END IF;

  -- Atualizar role
  UPDATE public.profiles
  SET role = new_role, updated_at = now()
  WHERE user_id = target_user_id;

  -- Log da operação
  PERFORM public.secure_log_security_event(
    'user_role_updated',
    auth.uid(),
    jsonb_build_object(
      'target_user_id', target_user_id,
      'target_email', target_user_email,
      'old_role', (SELECT role FROM public.profiles WHERE user_id = target_user_id),
      'new_role', new_role,
      'timestamp', now()
    ),
    3
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Permissão atualizada com sucesso'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', 'Erro interno: ' || SQLERRM);
END;
$$;

-- Verificar e atualizar políticas RLS da tabela profiles para permitir que managers atualizem outros usuários
DROP POLICY IF EXISTS "Managers can update all profiles" ON public.profiles;

CREATE POLICY "Managers can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  -- Manager pode atualizar qualquer perfil
  EXISTS (
    SELECT 1 FROM public.profiles current_user_profile
    WHERE current_user_profile.user_id = auth.uid()
    AND current_user_profile.role = 'manager'
    AND current_user_profile.approval_status = 'approved'
  )
  OR
  -- Usuário pode atualizar próprio perfil (exceto role se não for manager)
  (user_id = auth.uid())
)
WITH CHECK (
  -- Manager pode atualizar qualquer perfil
  EXISTS (
    SELECT 1 FROM public.profiles current_user_profile
    WHERE current_user_profile.user_id = auth.uid()
    AND current_user_profile.role = 'manager'
    AND current_user_profile.approval_status = 'approved'
  )
  OR
  -- Usuário pode atualizar próprio perfil (exceto role se não for manager)
  (user_id = auth.uid())
);