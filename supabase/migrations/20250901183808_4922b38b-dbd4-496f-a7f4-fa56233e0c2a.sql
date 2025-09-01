-- Create missing SQL functions that are being called by the frontend

-- Function to get filiais for registration (public access needed for signup)
CREATE OR REPLACE FUNCTION public.get_filiais_for_registration()
RETURNS TABLE(id uuid, nome text)
LANGUAGE plpgsql
STABLE
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT f.id, f.nome
  FROM public.filiais f
  ORDER BY f.nome ASC;
END;
$$;

-- Function to check if email belongs to admin
CREATE OR REPLACE FUNCTION public.is_admin_by_email(check_email text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = 'public'
AS $$
DECLARE
  admin_count integer;
BEGIN
  SELECT COUNT(*) INTO admin_count
  FROM public.profiles p
  WHERE p.email = check_email 
  AND p.role = 'manager'
  AND p.approval_status = 'approved';
  
  RETURN admin_count > 0;
END;
$$;

-- Function to check login rate limit
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(user_email text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = 'public'
AS $$
DECLARE
  recent_attempts integer;
  max_attempts integer := 5;
  time_window interval := interval '1 hour';
BEGIN
  -- Count recent failed login attempts
  SELECT COUNT(*) INTO recent_attempts
  FROM public.security_audit_log
  WHERE event_type = 'login_attempt'
  AND metadata->>'email' = user_email
  AND metadata->>'success' = 'false'
  AND created_at > now() - time_window;
  
  -- Return false if rate limit exceeded
  RETURN recent_attempts < max_attempts;
END;
$$;

-- Fix RLS policy for security_audit_log to allow system inserts
DROP POLICY IF EXISTS "Only system can insert security audit logs" ON public.security_audit_log;

CREATE POLICY "Allow security event logging"
ON public.security_audit_log
FOR INSERT
WITH CHECK (true);

-- Update the secure_log_security_event function to work with new policy
CREATE OR REPLACE FUNCTION public.secure_log_security_event(
  event_type text, 
  target_user_id uuid, 
  metadata jsonb DEFAULT '{}'::jsonb, 
  risk_score integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    target_user_id,
    metadata,
    risk_score,
    created_at
  ) VALUES (
    event_type,
    auth.uid(),
    target_user_id,
    metadata,
    risk_score,
    now()
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Silently fail to prevent blocking application flow
    NULL;
END;
$$;