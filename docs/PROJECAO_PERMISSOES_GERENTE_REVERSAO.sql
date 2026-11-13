-- Reversão: definição anterior de projection_is_admin (somente administrador).
CREATE OR REPLACE FUNCTION public.projection_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_active_approved_user() AND public.has_role(auth.uid(),'admin')
$$;
REVOKE ALL ON FUNCTION public.projection_is_admin() FROM PUBLIC, anon, authenticated;
