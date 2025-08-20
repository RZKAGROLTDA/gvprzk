-- Fix search path issues for security functions
CREATE OR REPLACE FUNCTION public.secure_log_security_event(
  event_type text,
  target_user_id uuid DEFAULT NULL,
  metadata jsonb DEFAULT NULL,
  risk_score integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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

-- Fix audit role changes function
CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO ''
AS $$
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
$$;