
-- 1. campaign_clients_master: restrict UPDATE
DROP POLICY IF EXISTS campaign_clients_master_update_authenticated ON public.campaign_clients_master;

CREATE POLICY campaign_clients_master_update_privileged
ON public.campaign_clients_master
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
);

-- 2. security_audit_log: allow admin to read
DROP POLICY IF EXISTS "SECURITY_LOG_MANAGER_ONLY" ON public.security_audit_log;

CREATE POLICY "SECURITY_LOG_MANAGER_ADMIN_READ"
ON public.security_audit_log
FOR SELECT
USING (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);
