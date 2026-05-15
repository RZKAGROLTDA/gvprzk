
-- 1) Fix overly permissive INSERT on campaign_clients_master
DROP POLICY IF EXISTS campaign_clients_master_insert_authenticated ON public.campaign_clients_master;

CREATE POLICY campaign_clients_master_insert_privileged
ON public.campaign_clients_master
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
);

-- 2) Revoke EXECUTE from anon on analytics/v2 SECURITY DEFINER functions that
--    must never be callable without authentication. Keep registration helpers
--    (get_filiais_for_registration, get_invitation_by_token) accessible to anon.
REVOKE EXECUTE ON FUNCTION public.get_activity_metrics_v2(date, date, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_clients_overview_v2(date, date, uuid, uuid, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_consolidated_sales_counts_v2(date, date, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_funnel_metrics_v2(date, date, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_performance_by_filial_v2(date, date, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_performance_by_seller_v2(date, date, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_reports_dataset_v2(date, date, uuid, uuid, integer, integer) FROM anon;
