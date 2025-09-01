-- Remove SECURITY DEFINER from all remaining functions to fix security linter warnings
-- These functions will now properly respect RLS policies

-- 1. Fix audit functions by removing SECURITY DEFINER
-- These are system functions that should still work for audit logging
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
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
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_role_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN
  -- Log role changes with high security priority
  IF OLD.role IS DISTINCT FROM NEW.role THEN
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
  END IF;
  
  RETURN NEW;
END;
$function$;

-- 2. Fix access control functions
CREATE OR REPLACE FUNCTION public.can_access_customer_data(task_owner_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path = 'public'
AS $function$
DECLARE
  current_user_role text;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  -- Managers can access all customer data
  IF current_user_role = 'manager' THEN
    RETURN true;
  END IF;
  
  -- Users can access their own task data
  IF auth.uid() = task_owner_id THEN
    RETURN true;
  END IF;
  
  -- Supervisors can access data from their filial
  IF current_user_role = 'supervisor' AND user_same_filial(task_owner_id) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$function$;