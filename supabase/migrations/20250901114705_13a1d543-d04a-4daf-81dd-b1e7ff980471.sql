-- Fix all remaining SECURITY DEFINER functions by converting them to SECURITY INVOKER
-- This should resolve the final Security Definer View error

-- Batch 1: Functions without parameters
ALTER FUNCTION public.cleanup_security_audit_logs() SECURITY INVOKER;
ALTER FUNCTION public.get_filiais_for_registration() SECURITY INVOKER;
ALTER FUNCTION public.get_opportunities_with_tasks() SECURITY INVOKER;
ALTER FUNCTION public.get_secure_tasks_view() SECURITY INVOKER;
ALTER FUNCTION public.get_secure_user_directory() SECURITY INVOKER;
ALTER FUNCTION public.get_security_dashboard() SECURITY INVOKER;
ALTER FUNCTION public.get_user_directory() SECURITY INVOKER;
ALTER FUNCTION public.get_user_filial_id() SECURITY INVOKER;
ALTER FUNCTION public.handle_new_user() SECURITY INVOKER;
ALTER FUNCTION public.invalidate_user_sessions_on_role_change() SECURITY INVOKER;
ALTER FUNCTION public.log_task_creation() SECURITY INVOKER;
ALTER FUNCTION public.monitor_bi_data_access() SECURITY INVOKER;
ALTER FUNCTION public.monitor_directory_access() SECURITY INVOKER;
ALTER FUNCTION public.monitor_high_risk_activity() SECURITY INVOKER;
ALTER FUNCTION public.monitor_high_value_access() SECURITY INVOKER;
ALTER FUNCTION public.monitor_high_value_sales() SECURITY INVOKER;
ALTER FUNCTION public.monitor_security_events() SECURITY INVOKER;
ALTER FUNCTION public.refresh_user_directory_cache() SECURITY INVOKER;
ALTER FUNCTION public.update_updated_at_column() SECURITY INVOKER;
ALTER FUNCTION public.validate_client_before_save() SECURITY INVOKER;

-- Batch 2: Functions with single parameters
ALTER FUNCTION public.diagnostic_query(text) SECURITY INVOKER;
ALTER FUNCTION public.get_opportunity_items(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_secure_task_data(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_task_data_access_level(uuid) SECURITY INVOKER;
ALTER FUNCTION public.is_admin_by_email(text) SECURITY INVOKER;
ALTER FUNCTION public.is_high_value_task(numeric) SECURITY INVOKER;
ALTER FUNCTION public.user_same_filial(uuid) SECURITY INVOKER;
ALTER FUNCTION public.validate_password_strength(text) SECURITY INVOKER;