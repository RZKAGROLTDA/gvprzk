-- Fix critical security vulnerability: Restrict profile access to same filial/organization
-- Currently all users can see all profiles, which violates privacy

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create secure policies that respect organizational boundaries
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can view profiles from same filial" 
ON public.profiles 
FOR SELECT 
USING (
  -- Allow if user is from same filial as the profile being viewed
  EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = profiles.user_id
    AND p1.filial_id = p2.filial_id
    AND p1.filial_id IS NOT NULL
  )
);

CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (is_admin());