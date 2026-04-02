
-- ==============================================
-- FIX 1: Restrict user_invitations public SELECT policy
-- Remove the overly permissive policy that exposes all pending invitations
-- ==============================================

DROP POLICY IF EXISTS "Valid invitations can be viewed by token holder" ON user_invitations;

-- Create a secure RPC to look up invitation by token (for unauthenticated invite acceptance)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token text)
RETURNS TABLE(
  id uuid,
  email text,
  token text,
  status text,
  expires_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ui.id,
    ui.email,
    ui.token,
    ui.status,
    ui.expires_at,
    ui.created_at
  FROM user_invitations ui
  WHERE ui.token = p_token
    AND ui.status = 'pending'
    AND ui.expires_at > now()
  LIMIT 1;
$$;

-- Grant execute to anon and authenticated so invite acceptance works
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO authenticated;

-- ==============================================
-- FIX 2: Update has_role to check approval_status
-- ==============================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND p.approval_status = 'approved'
  )
$$;

-- ==============================================
-- FIX 3: Restrict profiles INSERT/UPDATE policies to authenticated only
-- ==============================================

-- Drop and recreate profiles_insert_own for authenticated only
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Drop and recreate profiles_update_own for authenticated only
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    (user_id = auth.uid()) AND 
    ((role, filial_id, approval_status) = (
      SELECT p.role, p.filial_id, p.approval_status
      FROM profiles p
      WHERE p.user_id = auth.uid()
    ))
  );

-- Drop and recreate profiles_update_manager for authenticated only
DROP POLICY IF EXISTS "profiles_update_manager" ON profiles;
CREATE POLICY "profiles_update_manager" ON profiles
  FOR UPDATE
  TO authenticated
  USING (simple_is_manager())
  WITH CHECK (simple_is_manager());

-- Also fix profiles_select_manager and profiles_select_own to authenticated
DROP POLICY IF EXISTS "profiles_select_manager" ON profiles;
CREATE POLICY "profiles_select_manager" ON profiles
  FOR SELECT
  TO authenticated
  USING (simple_is_manager());

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
