-- Phase 3: Create secure logging functions that can bypass RLS
CREATE OR REPLACE FUNCTION public.secure_log_security_event(
  event_type text,
  target_user_id uuid DEFAULT NULL,
  metadata jsonb DEFAULT NULL,
  risk_score integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert directly with elevated privileges
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    target_user_id,
    metadata,
    risk_score,
    user_agent,
    created_at
  ) VALUES (
    event_type,
    auth.uid(),
    target_user_id,
    metadata,
    risk_score,
    current_setting('request.headers', true)::json->>'user-agent',
    now()
  );
END;
$$;

-- Create audit trigger for role changes (simplified)
CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log role changes using the secure function
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    PERFORM public.secure_log_security_event(
      'role_change',
      NEW.user_id,
      json_build_object(
        'old_role', OLD.role,
        'new_role', NEW.role,
        'changed_by', auth.uid()
      ),
      3
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger for role changes
DROP TRIGGER IF EXISTS trigger_audit_role_changes ON public.profiles;
CREATE TRIGGER trigger_audit_role_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_role_changes();

-- Update existing security functions to use secure logging
CREATE OR REPLACE FUNCTION public.log_security_event(event_type text, target_user_id uuid DEFAULT NULL::uuid, metadata jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
BEGIN
  PERFORM public.secure_log_security_event(event_type, target_user_id, metadata, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_high_risk_activity(activity_type text, risk_level integer DEFAULT 1, additional_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
BEGIN
  PERFORM public.secure_log_security_event(
    'high_risk_activity',
    auth.uid(),
    jsonb_build_object(
      'activity_type', activity_type,
      'timestamp', now(),
      'additional_data', additional_data
    ),
    risk_level
  );
END;
$$;