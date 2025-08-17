-- Security Enhancement: Create database functions for role management authorization
-- These functions prevent privilege escalation by enforcing server-side checks

-- Function to check if current user can modify roles
CREATE OR REPLACE FUNCTION public.can_modify_user_role(target_user_id uuid, new_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_role text;
  target_current_role text;
BEGIN
  -- Get current user's role
  SELECT role INTO current_user_role 
  FROM public.profiles 
  WHERE user_id = auth.uid();
  
  -- Get target user's current role
  SELECT role INTO target_current_role
  FROM public.profiles
  WHERE user_id = target_user_id;
  
  -- Only managers can modify roles
  IF current_user_role != 'manager' THEN
    RETURN false;
  END IF;
  
  -- Users cannot modify their own roles (prevent self-escalation)
  IF target_user_id = auth.uid() THEN
    RETURN false;
  END IF;
  
  -- Validate that new_role is one of the allowed roles
  IF new_role NOT IN ('manager', 'rac', 'consultant', 'supervisor', 'sales_consultant', 'technical_consultant') THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- Enhanced RLS policy for role updates with server-side authorization
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id AND
  -- If role is being changed, check authorization
  (
    role = (SELECT role FROM public.profiles WHERE user_id = auth.uid()) OR
    can_modify_user_role(user_id, role)
  )
);

-- Enhanced RLS for profiles to limit PII exposure
-- Create a view that exposes limited user information for same-filial users
CREATE OR REPLACE VIEW public.user_directory AS
SELECT 
  p.id,
  p.user_id,
  p.name,
  -- Only expose email to managers or the user themselves
  CASE 
    WHEN auth.uid() = p.user_id OR current_user_is_admin() THEN p.email
    ELSE NULL
  END as email,
  p.role,
  p.filial_id,
  p.approval_status,
  f.nome as filial_nome
FROM public.profiles p
LEFT JOIN public.filiais f ON p.filial_id = f.id
WHERE 
  -- User can see their own profile
  auth.uid() = p.user_id OR
  -- Managers can see all profiles  
  current_user_is_admin() OR
  -- Users can see limited info from same filial (but not emails)
  user_same_filial(p.user_id);

-- Enhanced invitation token security
-- Add function to mark tokens as consumed and unreadable
CREATE OR REPLACE FUNCTION public.consume_invitation_token(token_value text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invitation_record record;
  result json;
BEGIN
  -- Find and validate the invitation
  SELECT * INTO invitation_record
  FROM public.user_invitations
  WHERE token = token_value
    AND status = 'pending'
    AND expires_at > now()
    AND used_at IS NULL;
  
  IF NOT FOUND THEN
    RETURN '{"error": "Invalid or expired token"}'::json;
  END IF;
  
  -- Mark token as used
  UPDATE public.user_invitations
  SET 
    status = 'used',
    used_at = now(),
    used_by = auth.uid(),
    -- Clear the token for security
    token = 'CONSUMED'
  WHERE id = invitation_record.id;
  
  -- Return invitation details (without the token)
  result := json_build_object(
    'id', invitation_record.id,
    'email', invitation_record.email,
    'created_by', invitation_record.created_by,
    'created_at', invitation_record.created_at
  );
  
  RETURN result;
END;
$$;

-- Enhanced RLS for user_invitations to prevent token exposure after use
DROP POLICY IF EXISTS "Users can view their own invitation" ON public.user_invitations;

CREATE POLICY "Users can view their own invitation"
ON public.user_invitations
FOR SELECT
USING (
  email = auth.email() AND
  -- Don't expose consumed tokens
  status != 'used'
);

-- Add audit trigger for sensitive profile changes
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
$$;

-- Create audit log table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  operation text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs"
ON public.audit_log
FOR SELECT
USING (current_user_is_admin());

-- Create trigger for profile auditing
DROP TRIGGER IF EXISTS audit_profile_changes_trigger ON public.profiles;
CREATE TRIGGER audit_profile_changes_trigger
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_profile_changes();

-- Clean up expired and used invitation tokens (security maintenance)
CREATE OR REPLACE FUNCTION public.cleanup_invitation_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Delete expired tokens older than 30 days
  DELETE FROM public.user_invitations
  WHERE expires_at < now() - interval '30 days';
  
  -- Clear token values for used invitations older than 7 days
  UPDATE public.user_invitations
  SET token = 'EXPIRED'
  WHERE used_at < now() - interval '7 days'
    AND token != 'CONSUMED'
    AND token != 'EXPIRED';
END;
$$;