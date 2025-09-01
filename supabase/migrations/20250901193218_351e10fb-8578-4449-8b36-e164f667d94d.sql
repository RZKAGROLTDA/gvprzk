-- Remove ALL audit triggers to eliminate conflicts
DROP TRIGGER IF EXISTS audit_role_changes ON public.profiles;
DROP TRIGGER IF EXISTS audit_role_changes_trigger ON public.profiles;
DROP TRIGGER IF EXISTS audit_profile_changes_trigger ON public.profiles;

-- Drop the functions to recreate them fresh
DROP FUNCTION IF EXISTS public.audit_role_changes();
DROP FUNCTION IF EXISTS public.audit_profile_changes();

-- Create a single, simplified audit function for role changes only
CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only execute if role actually changed
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Log the role change safely without recursion
    INSERT INTO public.security_audit_log (
      event_type,
      user_id,
      target_user_id,
      metadata,
      risk_score,
      created_at
    ) VALUES (
      'role_change',
      auth.uid(),
      NEW.user_id,
      jsonb_build_object(
        'old_role', OLD.role,
        'new_role', NEW.role,
        'target_email', NEW.email
      ),
      5,
      now()
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create ONLY ONE trigger for role changes
CREATE TRIGGER audit_role_changes_trigger
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.audit_role_changes();

-- Create a separate simple function for approval status changes
CREATE OR REPLACE FUNCTION public.audit_approval_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only execute if approval status actually changed
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

-- Create trigger for approval status changes
CREATE TRIGGER audit_approval_changes_trigger
  AFTER UPDATE OF approval_status ON public.profiles
  FOR EACH ROW
  WHEN (OLD.approval_status IS DISTINCT FROM NEW.approval_status)
  EXECUTE FUNCTION public.audit_approval_changes();