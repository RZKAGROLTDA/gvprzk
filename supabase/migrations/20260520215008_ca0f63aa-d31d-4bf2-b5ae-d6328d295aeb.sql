
-- =========================================================
-- P1.1 — Anti-escalada de privilégios em profiles
-- =========================================================
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_privileged boolean;
BEGIN
  -- Admin ou manager aprovado pode alterar tudo
  v_is_privileged := (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.approval_status = 'approved'
    )
  );

  IF v_is_privileged THEN
    RETURN NEW;
  END IF;

  -- Usuário comum: bloquear alteração de campos sensíveis
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Não autorizado: alteração de role bloqueada';
  END IF;
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    RAISE EXCEPTION 'Não autorizado: alteração de approval_status bloqueada';
  END IF;
  IF NEW.filial_id IS DISTINCT FROM OLD.filial_id THEN
    RAISE EXCEPTION 'Não autorizado: alteração de filial_id bloqueada';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Não autorizado: alteração de email bloqueada';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Não autorizado: alteração de user_id bloqueada';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

REVOKE EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;

-- =========================================================
-- P1.2 — Admin lê security_audit_log
-- =========================================================
-- (Já existe SECURITY_LOG_MANAGER_ADMIN_READ no schema atual, garantir consistência)
DROP POLICY IF EXISTS "AUDIT_LOG_MANAGER_ONLY" ON public.security_audit_log;
DROP POLICY IF EXISTS "SECURITY_LOG_MANAGER_ADMIN_READ" ON public.security_audit_log;
CREATE POLICY "SECURITY_LOG_MANAGER_ADMIN_READ"
ON public.security_audit_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Também aplicar em audit_log (mesma lógica)
DROP POLICY IF EXISTS "AUDIT_LOG_MANAGER_ONLY" ON public.audit_log;
CREATE POLICY "audit_log_manager_admin_read"
ON public.audit_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- P2.1 — Revogar anon de RPCs autenticadas
-- =========================================================
REVOKE EXECUTE ON FUNCTION public.get_activity_metrics_v2 FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_clients_overview_v2 FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_consolidated_sales_counts_v2 FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_funnel_metrics_v2 FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_management_client_details FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_management_product_analysis FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_management_seller_summary FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_performance_by_filial_v2 FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_performance_by_seller_v2 FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_reports_dataset_v2 FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tasks_metrics_v2 FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_visit_schedule_realized FROM anon;

-- Triggers internas: não devem ser chamáveis via REST
REVOKE EXECUTE ON FUNCTION public.special_conditions_fill_seller_name() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.special_conditions_status_guard() FROM PUBLIC, anon, authenticated;
