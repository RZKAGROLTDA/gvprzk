DROP POLICY IF EXISTS "Usuarios autenticados leem historico de usuarios removidos" ON public.historical_users;
CREATE POLICY historical_users_select_scoped ON public.historical_users FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  OR (public.has_role(auth.uid(),'supervisor') AND filial_id = ANY (public.get_user_filial_ids(auth.uid())))
);

DROP POLICY IF EXISTS "Authenticated can view account links" ON public.user_account_links;
CREATE POLICY user_account_links_select_scoped ON public.user_account_links FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  OR primary_user_id = auth.uid() OR alias_user_id = auth.uid()
);

DROP POLICY IF EXISTS campaign_clients_master_select_authenticated ON public.campaign_clients_master;
CREATE POLICY campaign_clients_master_select_privileged ON public.campaign_clients_master FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'supervisor')
);