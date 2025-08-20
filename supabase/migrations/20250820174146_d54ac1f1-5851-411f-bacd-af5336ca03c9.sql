-- CRITICAL SECURITY FIX: Remove overly permissive profile access policy
-- This policy currently allows users from same filial to view each other's personal data
-- which violates privacy and enables email harvesting attacks

-- Drop the problematic policy that has a broken CASE statement
DROP POLICY IF EXISTS "Users can view limited profiles from same filial" ON public.profiles;

-- Create a new, secure policy that only allows very limited access for directory purposes
-- This policy should only be used by the secure directory function, not for general profile access
CREATE POLICY "Restricted profile access for directory function" 
ON public.profiles 
FOR SELECT 
USING (
  -- Users can only see their own profile OR admins can see all profiles
  auth.uid() = user_id OR current_user_is_admin()
);

-- Update the get_user_directory function to be more secure about email exposure
CREATE OR REPLACE FUNCTION public.get_user_directory()
RETURNS TABLE(id uuid, user_id uuid, name text, email text, role text, filial_id uuid, approval_status text, filial_nome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Only authenticated users can access this function
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.name,
    -- Enhanced email privacy: only expose to self or admins, NEVER to same filial users
    CASE 
      WHEN auth.uid() = p.user_id OR current_user_is_admin() THEN p.email
      ELSE NULL::text  -- Completely hide emails from non-admins
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
    -- Users can see VERY LIMITED info from same filial (NO emails, NO personal data)
    (user_same_filial(p.user_id) AND p.approval_status = 'approved');
END;
$$;