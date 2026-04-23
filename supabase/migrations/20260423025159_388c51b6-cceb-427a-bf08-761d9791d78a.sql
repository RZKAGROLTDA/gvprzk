-- 1. Simplificar a policy de UPDATE do próprio perfil (validação de campos vai para a trigger)
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update_own
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 2. Trigger SECURITY DEFINER que bloqueia escalação de privilégios
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se quem está atualizando é admin ou manager, permitir tudo
  IF public.has_role(auth.uid(), 'admin'::app_role) 
     OR public.has_role(auth.uid(), 'manager'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Para usuários comuns: bloquear alteração de campos administrativos
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Permission denied: cannot modify role field'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.filial_id IS DISTINCT FROM OLD.filial_id THEN
    RAISE EXCEPTION 'Permission denied: cannot modify filial_id field'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    RAISE EXCEPTION 'Permission denied: cannot modify approval_status field'
      USING ERRCODE = '42501';
  END IF;

  -- Bloquear também alteração do user_id (ownership)
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Permission denied: cannot modify user_id field'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Anexar a trigger à tabela profiles
DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trigger ON public.profiles;

CREATE TRIGGER prevent_profile_privilege_escalation_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();