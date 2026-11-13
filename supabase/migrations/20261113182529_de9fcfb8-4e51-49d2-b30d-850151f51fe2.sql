CREATE OR REPLACE FUNCTION public.projection_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_active_approved_user()
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
$$;
COMMENT ON FUNCTION public.projection_is_admin() IS
  'Acesso completo na Projeção de Vendas: administrador ou gerente aprovado e ativo. Uso exclusivo do módulo Projeção.';
REVOKE ALL ON FUNCTION public.projection_is_admin() FROM PUBLIC, anon, authenticated;