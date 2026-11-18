-- Backup da definição ATUAL (em produção em 18/11/2026) de update_user_role_secure, para reversão da v5.
CREATE OR REPLACE FUNCTION public.update_user_role_secure(target_user_id uuid, new_role text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  calling_user_role TEXT;
BEGIN
  SELECT role INTO calling_user_role
  FROM public.profiles
  WHERE user_id = auth.uid() AND approval_status = 'approved'
  LIMIT 1;

  IF calling_user_role != 'manager' THEN
    RAISE EXCEPTION 'Only managers can update user roles';
  END IF;

  IF new_role NOT IN ('manager', 'supervisor', 'rac', 'consultant', 'sales_consultant', 'technical_consultant', 'cpa', 'csa', 'admin', 'cpa', 'csa') THEN
    RAISE EXCEPTION 'Invalid role specified';
  END IF;

  UPDATE public.profiles
  SET role = new_role,
      updated_at = now()
  WHERE user_id = target_user_id;

  DELETE FROM public.user_roles
  WHERE user_id = target_user_id;

  INSERT INTO public.user_roles (user_id, role, created_by)
  VALUES (target_user_id, new_role::app_role, auth.uid())
  ON CONFLICT (user_id, role) DO NOTHING;

  PERFORM public.secure_log_security_event(
    'user_role_updated',
    auth.uid(),
    jsonb_build_object(
      'target_user_id', target_user_id,
      'new_role', new_role,
      'updated_by', auth.uid()
    ),
    3
  );
END;
$function$;
-- Permissões atuais a restaurar junto:
-- GRANT EXECUTE ON FUNCTION public.update_user_role_secure(uuid, text) TO authenticated;
-- GRANT INSERT ON public.profiles TO anon;
