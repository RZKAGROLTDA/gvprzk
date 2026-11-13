-- Projeção de Vendas: GERENTE com o mesmo acesso completo do ADMINISTRADOR (apenas neste módulo).
-- projection_is_admin() é usada SOMENTE pelas funções da Projeção (verificado em todas as migrações):
--   projection_scope (todas as filiais), get_projection_filiais, projection_set_divisional,
--   projection_upsert_goals, projection_save_entry, projection_delete_entry.
-- Supervisor continua no caminho atual (Filial Ativa autorizada via get_user_filial_ids_internal).
-- Tele Vendas, versão, motivo obrigatório, históricos imutáveis e validações não mudam.
-- Nenhuma tabela, dado ou função de outro módulo é alterada.
CREATE OR REPLACE FUNCTION public.projection_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_active_approved_user()
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
$$;
COMMENT ON FUNCTION public.projection_is_admin() IS
  'Acesso completo na Projeção de Vendas: administrador ou gerente aprovado e ativo. Uso exclusivo do módulo Projeção.';
REVOKE ALL ON FUNCTION public.projection_is_admin() FROM PUBLIC, anon, authenticated;
