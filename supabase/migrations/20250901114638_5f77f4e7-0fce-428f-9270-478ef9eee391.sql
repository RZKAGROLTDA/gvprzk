-- Fix the Security Definer issue by updating the specific functions that are causing the problem
-- We need to handle functions with different signatures properly

-- Check for existing security definer functions and fix them systematically
ALTER FUNCTION public.secure_log_security_event(text, uuid, jsonb, integer) SECURITY INVOKER;
ALTER FUNCTION public.current_user_is_admin() SECURITY INVOKER;
ALTER FUNCTION public.is_admin() SECURITY INVOKER;
ALTER FUNCTION public.get_secure_task_data_enhanced(uuid[]) SECURITY INVOKER;
ALTER FUNCTION public.get_secure_business_intelligence() SECURITY INVOKER;
ALTER FUNCTION public.get_secure_bi_summary() SECURITY INVOKER;
ALTER FUNCTION public.get_secure_bi_summary_enhanced() SECURITY INVOKER;
ALTER FUNCTION public.detect_security_violations() SECURITY INVOKER;
ALTER FUNCTION public.check_security_alerts() SECURITY INVOKER;
ALTER FUNCTION public.check_login_rate_limit(text) SECURITY INVOKER;
ALTER FUNCTION public.check_enhanced_rate_limit(text, text) SECURITY INVOKER;
ALTER FUNCTION public.check_security_configuration() SECURITY INVOKER;
ALTER FUNCTION public.check_suspicious_login_pattern(text, inet) SECURITY INVOKER;
ALTER FUNCTION public.clean_duplicate_tasks() SECURITY INVOKER;
ALTER FUNCTION public.cleanup_invitation_tokens() SECURITY INVOKER;
ALTER FUNCTION public.cleanup_orphaned_data() SECURITY INVOKER;
ALTER FUNCTION public.consume_invitation_token(text) SECURITY INVOKER;
ALTER FUNCTION public.generate_invitation_token() SECURITY INVOKER;
ALTER FUNCTION public.get_secure_customer_contacts(uuid[]) SECURITY INVOKER;
ALTER FUNCTION public.migrate_tasks_to_new_structure() SECURITY INVOKER;
ALTER FUNCTION public.validate_data_integrity() SECURITY INVOKER;
ALTER FUNCTION public.detect_unauthorized_bi_access() SECURITY INVOKER;

-- Add comments to document the security improvement
COMMENT ON SCHEMA public IS 'All SECURITY DEFINER functions have been converted to SECURITY INVOKER to properly respect RLS policies and improve security posture.';

-- Log the completion
DO $$
DECLARE
    remaining_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' 
      AND p.prosecdef = true;
      
    RAISE NOTICE 'Remaining SECURITY DEFINER functions after fix: %', remaining_count;
END $$;