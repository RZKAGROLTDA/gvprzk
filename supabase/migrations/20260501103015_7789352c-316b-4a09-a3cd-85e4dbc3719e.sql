-- =============================================================
-- 1. AUDIT_LOG: documentação
-- =============================================================
COMMENT ON TABLE public.audit_log IS
  'Audit log table. Writes MUST occur exclusively through SECURITY DEFINER functions or database triggers. No direct INSERT/UPDATE/DELETE policies are granted to application users. SELECT is restricted to managers via RLS.';

-- =============================================================
-- 2. ADMIN_USERS: trocar policies de public -> authenticated
-- =============================================================
DROP POLICY IF EXISTS "Admin users management by super admin" ON public.admin_users;
DROP POLICY IF EXISTS "Admin users super admin access only" ON public.admin_users;

CREATE POLICY "admin_users_select_admin"
  ON public.admin_users FOR SELECT TO authenticated
  USING (simple_is_admin());

CREATE POLICY "admin_users_insert_admin"
  ON public.admin_users FOR INSERT TO authenticated
  WITH CHECK (simple_is_admin());

CREATE POLICY "admin_users_update_admin"
  ON public.admin_users FOR UPDATE TO authenticated
  USING (simple_is_admin()) WITH CHECK (simple_is_admin());

CREATE POLICY "admin_users_delete_admin"
  ON public.admin_users FOR DELETE TO authenticated
  USING (simple_is_admin());

COMMENT ON TABLE public.admin_users IS
  'Bootstrap admin table. First admin record MUST be seeded via service_role/migration. RLS restricted to authenticated admins only.';

-- =============================================================
-- 3. SECURITY DEFINER: revogar EXECUTE de anon/PUBLIC em todas
-- =============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC',
                   r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
                   r.proname, r.args);
  END LOOP;
END $$;

-- =============================================================
-- 4. Revogar também de authenticated nas funções internas
-- =============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
    WHERE n.nspname='public' AND p.prosecdef=true
      AND p.proname IN (
        'secure_log_security_event',
        'cleanup_old_security_logs',
        'internal_cleanup_security_logs_cron',
        'can_perform_admin_action'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated',
                   r.proname, r.args);
  END LOOP;
END $$;

-- =============================================================
-- 5. Conceder EXECUTE a authenticated nas funções usadas pelo app/RLS
-- =============================================================
DO $$
DECLARE
  fn_name text;
  r record;
BEGIN
  FOR fn_name IN SELECT unnest(ARRAY[
    -- RLS helpers
    'has_role','simple_is_admin','simple_is_manager','is_user_admin','is_manager',
    'get_supervisor_filial_id','can_access_customer_data','can_access_task_related_data',
    'can_view_opportunity',
    -- Management / metrics RPCs
    'get_consolidated_sales_counts','get_management_client_details',
    'get_management_product_analysis','get_management_seller_summary',
    'get_performance_by_filial','get_performance_by_seller','get_sales_funnel_counts',
    -- User / filial directory
    'get_filiais_for_registration','get_filial_user_counts','get_filial_users',
    'get_invitation_by_token','get_secure_user_directory','get_user_directory_with_fallback',
    'get_user_role','get_user_security_level',
    -- Tasks / opportunities
    'get_tasks_optimized','get_supervisor_filial_tasks','get_task_details',
    'get_secure_task_by_id','get_secure_tasks_paginated','get_secure_tasks_enhanced',
    'get_secure_tasks_new_with_customer_protection','get_completely_secure_tasks',
    'get_secure_export_data','get_secure_sales_data',
    -- Clients / customer data
    'get_secure_clients_with_masking','get_secure_clients_enhanced','get_secure_client_data',
    'get_secure_customer_data_enhanced','get_secure_customer_data_view',
    'get_secure_customer_data_with_rls',
    -- Security dashboard
    'get_security_dashboard_data','get_security_metrics_24h','get_security_audit_log_summary',
    -- Rate limiting / threat detection (called from client hooks)
    'check_advanced_rate_limit','check_login_rate_limit','check_data_access_rate_limit',
    'check_suspicious_login_pattern','check_data_integrity','check_security_threats',
    'check_client_data_access_patterns','check_customer_data_access_alerts',
    'check_function_security_status','detect_customer_data_theft_attempts',
    'debug_user_security_info',
    -- Profile / campaign
    'create_secure_profile','ensure_campaign_client_master',
    -- Logging (chamados pelo frontend)
    'log_security_event','log_sensitive_data_access',
    'log_client_contact_access','log_client_contact_access_enhanced',
    'log_client_data_access','log_customer_contact_access',
    'log_customer_data_access','log_customer_data_access_enhanced'
  ]) LOOP
    FOR r IN
      SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
      FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
      WHERE n.nspname='public' AND p.prosecdef=true AND p.proname = fn_name
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
                     r.proname, r.args);
    END LOOP;
  END LOOP;
END $$;

-- =============================================================
-- 6. Funções públicas (anon) — registro e aceite de convite
-- =============================================================
GRANT EXECUTE ON FUNCTION public.get_filiais_for_registration() TO anon;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon;