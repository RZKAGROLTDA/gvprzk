-- Phase 1: Fix Branch Data Exposure (High Priority)
-- Remove the public access policy that allows anyone to view branch data
DROP POLICY IF EXISTS "Public can view filiais for registration" ON public.filiais;

-- Create a new policy that only allows authenticated users to view branch data
CREATE POLICY "Authenticated users can view filiais for registration" 
ON public.filiais 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Phase 3: Enhance Security Monitoring - Add IP address tracking
-- Update the security logging function to capture IP addresses
CREATE OR REPLACE FUNCTION public.secure_log_security_event(
  event_type text, 
  target_user_id uuid DEFAULT NULL::uuid, 
  metadata jsonb DEFAULT NULL::jsonb, 
  risk_score integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Insert with enhanced IP tracking and metadata
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    target_user_id,
    metadata,
    risk_score,
    user_agent,
    ip_address,
    created_at
  ) VALUES (
    event_type,
    auth.uid(),
    target_user_id,
    COALESCE(metadata, '{}'::jsonb) || 
    jsonb_build_object(
      'timestamp', now(),
      'session_id', current_setting('request.headers', true)::json->>'x-session-id'
    ),
    risk_score,
    current_setting('request.headers', true)::json->>'user-agent',
    COALESCE(
      (current_setting('request.headers', true)::json->>'x-forwarded-for')::inet,
      (current_setting('request.headers', true)::json->>'x-real-ip')::inet,
      '127.0.0.1'::inet
    ),
    now()
  );
END;
$function$;