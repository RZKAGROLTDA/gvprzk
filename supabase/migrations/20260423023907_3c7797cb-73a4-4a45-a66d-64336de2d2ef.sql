DROP POLICY IF EXISTS campaign_clients_master_update_managers ON public.campaign_clients_master;

CREATE POLICY campaign_clients_master_update_authenticated
ON public.campaign_clients_master
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);