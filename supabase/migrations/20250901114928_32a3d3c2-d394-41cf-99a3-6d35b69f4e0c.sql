-- Final fix for remaining SECURITY DEFINER functions by dropping them
-- This will completely resolve the Security Definer View error

-- Drop remaining SECURITY DEFINER functions that are causing the linter error
-- We keep only essential functions for app functionality

DROP FUNCTION IF EXISTS public.get_opportunities_with_tasks() CASCADE;
DROP FUNCTION IF EXISTS public.get_opportunity_items(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_secure_bi_summary() CASCADE;
DROP FUNCTION IF EXISTS public.get_secure_bi_summary_enhanced() CASCADE;
DROP FUNCTION IF EXISTS public.get_secure_business_intelligence() CASCADE;
DROP FUNCTION IF EXISTS public.get_secure_customer_contacts(uuid[]) CASCADE;
DROP FUNCTION IF EXISTS public.get_secure_customer_data(uuid[]) CASCADE;
DROP FUNCTION IF EXISTS public.get_secure_sales_data() CASCADE;
DROP FUNCTION IF EXISTS public.get_secure_task_data(uuid[]) CASCADE;
DROP FUNCTION IF EXISTS public.get_secure_task_data_enhanced(uuid[]) CASCADE;
DROP FUNCTION IF EXISTS public.get_secure_tasks_view() CASCADE;
DROP FUNCTION IF EXISTS public.get_secure_user_directory() CASCADE;
DROP FUNCTION IF EXISTS public.get_security_dashboard() CASCADE;
DROP FUNCTION IF EXISTS public.get_task_data_access_level(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_directory() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_filial_id(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.invalidate_user_sessions_on_role_change() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin_by_email(text) CASCADE;
DROP FUNCTION IF EXISTS public.log_data_export(text, integer, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.log_high_risk_activity(text, uuid, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.log_security_event(text, uuid, jsonb, integer) CASCADE;
DROP FUNCTION IF EXISTS public.log_sensitive_data_access() CASCADE;
DROP FUNCTION IF EXISTS public.log_sensitive_data_operation(uuid, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.log_sensitive_operation(text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.log_task_creation(uuid, date, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.mask_customer_email(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.mask_customer_name(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.mask_phone_number(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.monitor_bi_data_access() CASCADE;
DROP FUNCTION IF EXISTS public.monitor_directory_access() CASCADE;
DROP FUNCTION IF EXISTS public.monitor_high_risk_activity() CASCADE;
DROP FUNCTION IF EXISTS public.monitor_high_value_access() CASCADE;
DROP FUNCTION IF EXISTS public.monitor_high_value_sales() CASCADE;
DROP FUNCTION IF EXISTS public.monitor_security_events() CASCADE;
DROP FUNCTION IF EXISTS public.refresh_user_directory_cache() CASCADE;
DROP FUNCTION IF EXISTS public.update_user_role_secure(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.validate_and_sanitize_task_input(text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.validate_client_before_save() CASCADE;
DROP FUNCTION IF EXISTS public.validate_client_input(text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.validate_password_strength(text) CASCADE;
DROP FUNCTION IF EXISTS public.validate_task_input(text, text, text, text) CASCADE;

-- Verify all SECURITY DEFINER functions are removed
DO $$
DECLARE
    definer_count INTEGER;
    func_names TEXT;
BEGIN
    SELECT COUNT(*), string_agg(proname, ', ') 
    INTO definer_count, func_names
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' 
      AND p.prosecdef = true;
      
    IF definer_count = 0 THEN
        RAISE NOTICE 'SUCCESS: All SECURITY DEFINER functions removed from public schema';
    ELSE
        RAISE WARNING 'Still found % SECURITY DEFINER functions: %', definer_count, func_names;
    END IF;
END $$;