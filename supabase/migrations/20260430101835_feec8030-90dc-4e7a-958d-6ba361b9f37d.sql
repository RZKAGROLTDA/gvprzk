
-- 1. Drop and recreate is_user_admin with approval check
DROP FUNCTION IF EXISTS public.is_user_admin(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.is_user_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'admin'::app_role
      AND p.approval_status = 'approved'
  );
$$;

-- Recreate dropped policies on user_roles (CASCADE removed them)
CREATE POLICY user_roles_admin_delete ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_user_admin(auth.uid()));

CREATE POLICY user_roles_admin_insert ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_user_admin(auth.uid()));

CREATE POLICY user_roles_admin_update ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.is_user_admin(auth.uid()))
  WITH CHECK (public.is_user_admin(auth.uid()));

-- 2. Secure simple_is_manager: use user_roles instead of profiles.role
CREATE OR REPLACE FUNCTION public.simple_is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::app_role, 'manager'::app_role)
      AND p.approval_status = 'approved'
  );
$$;

-- 3. Trigger to prevent privilege escalation on profiles
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status
     AND NEW.filial_id IS NOT DISTINCT FROM OLD.filial_id
     AND NEW.email IS NOT DISTINCT FROM OLD.email
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::app_role, 'manager'::app_role)
      AND p.approval_status = 'approved'
  ) INTO is_privileged;

  IF NOT is_privileged THEN
    RAISE EXCEPTION 'Permissão negada: somente administradores aprovados podem alterar role, approval_status, filial_id, email ou user_id'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trigger ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
