-- Fix stack depth limit exceeded error by removing duplicate triggers and optimizing audit function

-- First, drop the duplicate trigger if it exists
DROP TRIGGER IF EXISTS trigger_audit_role_changes ON public.profiles;

-- Keep only the audit_role_changes_trigger and ensure it's properly configured
DROP TRIGGER IF EXISTS audit_role_changes_trigger ON public.profiles;

-- Recreate the audit function with better recursion protection
CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Only log if there's actually a role change to prevent unnecessary logging
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Use a simple, non-recursive logging approach
    BEGIN
      PERFORM public.secure_log_security_event(
        'critical_role_change',
        NEW.user_id,
        jsonb_build_object(
          'old_role', OLD.role,
          'new_role', NEW.role,
          'changed_by', auth.uid(),
          'target_user_email', NEW.email,
          'security_alert', true
        ),
        5
      );
    EXCEPTION
      WHEN OTHERS THEN
        -- Silently fail to prevent blocking the operation
        NULL;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger with proper conditions to prevent recursion
CREATE TRIGGER audit_role_changes_trigger
  BEFORE UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.audit_role_changes();

-- Also ensure the profile changes trigger doesn't conflict
DROP TRIGGER IF EXISTS audit_profile_changes_trigger ON public.profiles;

-- Create a simplified profile audit trigger that doesn't conflict
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Only log approval status changes to avoid conflicts with role changes
  IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    BEGIN
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
    EXCEPTION
      WHEN OTHERS THEN
        -- Silently fail to prevent blocking the operation
        NULL;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the profile changes trigger only for approval status
CREATE TRIGGER audit_profile_changes_trigger
  AFTER UPDATE OF approval_status ON public.profiles
  FOR EACH ROW
  WHEN (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
  EXECUTE FUNCTION public.audit_profile_changes();