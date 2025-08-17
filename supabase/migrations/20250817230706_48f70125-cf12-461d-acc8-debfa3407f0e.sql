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

-- Create function to check if user is admin by email
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