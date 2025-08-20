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