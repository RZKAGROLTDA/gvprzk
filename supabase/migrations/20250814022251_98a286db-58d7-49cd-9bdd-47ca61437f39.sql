-- Fix infinite recursion in RLS policies for profiles table
-- The issue is that is_admin() and get_user_filial_id() functions are trying to access
-- the profiles table while RLS policies on profiles are being evaluated, causing recursion

-- First, drop all current policies on profiles to stop the recursion
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update user roles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile data" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles from same filial" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Recreate is_admin() function with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  );
END;
$$;

-- Recreate get_user_filial_id() function with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.get_user_filial_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT filial_id FROM public.profiles 
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Create a helper function to check if user is admin (using SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  );
$$;

-- Create simplified RLS policies that don't cause recursion
-- Policy 1: Users can view their own profile
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

-- Policy 2: Users can insert their own profile
CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Policy 3: Users can update their own profile
CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy 4: Admins can manage all profiles (using the helper function)
CREATE POLICY "Admins can manage all profiles" 
ON public.profiles 
FOR ALL 
USING (current_user_is_admin());

-- Policy 5: Users can view profiles from same filial (simplified version)
CREATE POLICY "Users can view profiles from same filial" 
ON public.profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = profiles.user_id 
    AND p1.filial_id = p2.filial_id 
    AND p1.filial_id IS NOT NULL
  )
);

-- Update the filiais table policies to use the corrected function
DROP POLICY IF EXISTS "Usuários podem ver sua própria filial" ON public.filiais;
CREATE POLICY "Users can view their own filial" 
ON public.filiais 
FOR SELECT 
USING (id = get_user_filial_id());

-- Update tasks policies to use the corrected function  
DROP POLICY IF EXISTS "Users can view tasks from their filial" ON public.tasks;
CREATE POLICY "Users can view tasks from their filial" 
ON public.tasks 
FOR SELECT 
USING (
  current_user_is_admin() OR 
  EXISTS (
    SELECT 1 FROM public.profiles p1, public.profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = tasks.created_by 
    AND p1.filial_id = p2.filial_id
  )
);