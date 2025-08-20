-- Phase 1: Critical Security Fixes for Audit Logs
-- Add restrictive policies to prevent unauthorized writes to audit logs

-- Drop existing policies that might be too permissive
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "Only admins can view security audit log" ON public.security_audit_log;

-- Recreate with proper restrictions
CREATE POLICY "Admins can view audit logs" 
ON public.audit_log 
FOR SELECT 
USING (current_user_is_admin());

CREATE POLICY "Only system can insert audit logs" 
ON public.audit_log 
FOR INSERT 
WITH CHECK (false);  -- No direct inserts allowed

CREATE POLICY "Only system can update audit logs" 
ON public.audit_log 
FOR UPDATE 
USING (false);  -- No updates allowed

CREATE POLICY "Only system can delete audit logs" 
ON public.audit_log 
FOR DELETE 
USING (false);  -- No deletes allowed

CREATE POLICY "Only admins can view security audit log" 
ON public.security_audit_log 
FOR SELECT 
USING (current_user_is_admin());

CREATE POLICY "Only system can insert security audit logs" 
ON public.security_audit_log 
FOR INSERT 
WITH CHECK (false);  -- No direct inserts allowed

CREATE POLICY "Only system can update security audit logs" 
ON public.security_audit_log 
FOR UPDATE 
USING (false);  -- No updates allowed

CREATE POLICY "Only system can delete security audit logs" 
ON public.security_audit_log 
FOR DELETE 
USING (false);  -- No deletes allowed

-- Phase 2: Tighten User Invitation Security
-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage all invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Users can view their own invitation" ON public.user_invitations;

-- Create more restrictive policies
CREATE POLICY "Only admins can create invitations" 
ON public.user_invitations 
FOR INSERT 
WITH CHECK (current_user_is_admin());

CREATE POLICY "Only admins can view all invitations" 
ON public.user_invitations 
FOR SELECT 
USING (current_user_is_admin() OR (email = auth.email() AND status = 'pending' AND expires_at > now()));

CREATE POLICY "Only admins can update invitations" 
ON public.user_invitations 
FOR UPDATE 
USING (current_user_is_admin())
WITH CHECK (current_user_is_admin());

CREATE POLICY "Only admins can delete invitations" 
ON public.user_invitations 
FOR DELETE 
USING (current_user_is_admin());

-- Phase 3: Strengthen Role Management
-- Add policy to prevent users from updating their own roles
CREATE POLICY "Users cannot update their own role" 
ON public.profiles 
FOR UPDATE 
USING (
  CASE 
    WHEN NEW.role IS DISTINCT FROM OLD.role THEN 
      current_user_is_admin() AND auth.uid() != user_id
    ELSE 
      auth.uid() = user_id OR current_user_is_admin()
  END
);

-- Create audit trigger for role changes
CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log role changes
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Use a bypass mechanism for system logging
    PERFORM pg_catalog.set_config('app.bypass_rls', 'true', true);
    
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
      json_build_object('old_role', OLD.role, 'user_id', OLD.user_id),
      json_build_object('new_role', NEW.role, 'user_id', NEW.user_id),
      auth.uid(),
      now()
    );
    
    PERFORM pg_catalog.set_config('app.bypass_rls', '', true);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_audit_role_changes ON public.profiles;
CREATE TRIGGER trigger_audit_role_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_role_changes();

-- Phase 4: Create secure logging functions
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
  -- Bypass RLS for system logging
  PERFORM pg_catalog.set_config('app.bypass_rls', 'true', true);
  
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
  
  PERFORM pg_catalog.set_config('app.bypass_rls', '', true);
END;
$$;