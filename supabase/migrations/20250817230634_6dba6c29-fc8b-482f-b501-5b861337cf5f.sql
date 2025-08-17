-- Create admin users table to replace hardcoded admin emails
CREATE TABLE public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Only existing admins can view admin users table
CREATE POLICY "Only admins can view admin users"
ON public.admin_users
FOR SELECT
USING (current_user_is_admin());

-- Only existing admins can manage admin users table
CREATE POLICY "Only admins can manage admin users"
ON public.admin_users
FOR ALL
USING (current_user_is_admin())
WITH CHECK (current_user_is_admin());

-- Insert current admin emails as initial admin users
INSERT INTO public.admin_users (email, user_id, created_by)
SELECT 
  email,
  id,
  id
FROM auth.users 
WHERE email IN ('robson.ferro@rzkagro.com.br', 'hugo@rzkagro.com.br')
ON CONFLICT (email) DO NOTHING;

-- Create function to check if user is admin by email or user_id
CREATE OR REPLACE FUNCTION public.is_admin_by_email(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE email = check_email AND is_active = true
  );
$$;

-- Create function to check if current user is admin by their profile or admin table
CREATE OR REPLACE FUNCTION public.current_user_is_admin_enhanced()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    -- Check if user is admin in profiles table (manager role)
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND role = 'manager'
    ) OR
    -- Check if user is in admin_users table
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
$$;

-- Update existing function to use enhanced admin check
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT current_user_is_admin_enhanced();
$$;

-- Create audit log for security events
CREATE TABLE public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  target_user_id uuid REFERENCES auth.users(id),
  ip_address inet,
  user_agent text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on security audit log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view security audit log
CREATE POLICY "Only admins can view security audit log"
ON public.security_audit_log
FOR SELECT
USING (current_user_is_admin());

-- Create function to log security events
CREATE OR REPLACE FUNCTION public.log_security_event(
  event_type text,
  target_user_id uuid DEFAULT NULL,
  metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.security_audit_log (
    event_type,
    user_id,
    target_user_id,
    metadata
  ) VALUES (
    event_type,
    auth.uid(),
    target_user_id,
    metadata
  );
END;
$$;

-- Enhanced role update function with better security and audit logging
CREATE OR REPLACE FUNCTION public.update_user_role_secure(target_user_id uuid, new_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_role text;
  target_current_role text;
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  -- Check if current user can modify the target user's role
  IF NOT can_modify_user_role(target_user_id, new_role) THEN
    -- Log unauthorized attempt
    PERFORM log_security_event(
      'unauthorized_role_change_attempt',
      target_user_id,
      jsonb_build_object(
        'attempted_role', new_role,
        'reason', 'insufficient_privilege'
      )
    );
    RAISE EXCEPTION 'insufficient privilege';
  END IF;
  
  -- Additional check: prevent self-escalation to admin/manager
  IF target_user_id = current_user_id AND new_role = 'manager' THEN
    PERFORM log_security_event(
      'self_escalation_attempt',
      target_user_id,
      jsonb_build_object('attempted_role', new_role)
    );
    RAISE EXCEPTION 'self escalation not allowed';
  END IF;
  
  -- Get current roles for audit
  SELECT role INTO current_user_role FROM public.profiles WHERE user_id = current_user_id;
  SELECT role INTO target_current_role FROM public.profiles WHERE user_id = target_user_id;
  
  -- Update the role
  UPDATE public.profiles
  SET role = new_role, updated_at = now()
  WHERE user_id = target_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Log successful role change
  PERFORM log_security_event(
    'role_change_success',
    target_user_id,
    jsonb_build_object(
      'old_role', target_current_role,
      'new_role', new_role,
      'changed_by_role', current_user_role
    )
  );
END;
$$;