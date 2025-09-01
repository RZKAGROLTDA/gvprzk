-- First, let's see ALL triggers on the profiles table
SELECT 
    tgname as trigger_name,
    pg_proc.proname as function_name
FROM pg_trigger 
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid
WHERE pg_class.relname = 'profiles'
AND pg_class.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND NOT tgisinternal;

-- Drop ALL existing audit-related triggers
DROP TRIGGER IF EXISTS audit_role_changes ON public.profiles;
DROP TRIGGER IF EXISTS audit_role_changes_trigger ON public.profiles; 
DROP TRIGGER IF EXISTS audit_profile_changes_trigger ON public.profiles;
DROP TRIGGER IF EXISTS audit_approval_changes_trigger ON public.profiles;
DROP TRIGGER IF EXISTS trigger_audit_role_changes ON public.profiles;

-- Drop the functions
DROP FUNCTION IF EXISTS public.audit_role_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_profile_changes() CASCADE;
DROP FUNCTION IF EXISTS public.audit_approval_changes() CASCADE;

-- Create a single, simple audit function that logs directly to audit_log
CREATE OR REPLACE FUNCTION public.simple_audit_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Log role changes
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO public.audit_log (
      table_name,
      operation,
      old_values,
      new_values,
      user_id,
      created_at
    ) VALUES (
      'profiles',
      'role_change',
      json_build_object('old_role', OLD.role),
      json_build_object('new_role', NEW.role),
      auth.uid(),
      now()
    );
  END IF;
  
  -- Log approval status changes  
  IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    INSERT INTO public.audit_log (
      table_name,
      operation,
      old_values,
      new_values,
      user_id,
      created_at
    ) VALUES (
      'profiles',
      'approval_status_change',
      json_build_object('old_approval_status', OLD.approval_status),
      json_build_object('new_approval_status', NEW.approval_status),
      auth.uid(),
      now()
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create ONE simple trigger
CREATE TRIGGER profile_audit_trigger
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.simple_audit_changes();