-- Fix infinite recursion in user_roles RLS policies
-- Drop the problematic policies
DROP POLICY IF EXISTS "user_roles_select_manager" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_insert_manager" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_update_manager" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_delete_manager" ON public.user_roles;

-- Create simple, non-recursive SELECT policy
-- Users can view their own roles
CREATE POLICY "user_roles_select_own_simple" 
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Create function to check if user is admin (using SECURITY DEFINER to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_user_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
    AND role = 'admin'::app_role
  )
$$;

-- Only admins can manage user_roles
CREATE POLICY "user_roles_admin_insert" 
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.is_user_admin(auth.uid()));

CREATE POLICY "user_roles_admin_update" 
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.is_user_admin(auth.uid()))
WITH CHECK (public.is_user_admin(auth.uid()));

CREATE POLICY "user_roles_admin_delete" 
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.is_user_admin(auth.uid()));