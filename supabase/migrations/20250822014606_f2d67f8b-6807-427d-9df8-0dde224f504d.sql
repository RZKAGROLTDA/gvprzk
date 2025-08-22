-- Allow public access to view filiais for registration purposes
-- This is needed so unauthenticated users can see available branches during signup

-- First, drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can view their own filial" ON public.filiais;

-- Create new policies for filiais table
-- Policy 1: Allow public read access to filiais (for registration)
CREATE POLICY "Public can view filiais for registration" 
ON public.filiais 
FOR SELECT 
TO PUBLIC 
USING (true);

-- Policy 2: Only admins can manage filiais (insert, update, delete)
CREATE POLICY "Only admins can manage filiais" 
ON public.filiais 
FOR ALL 
TO authenticated 
USING (is_admin()) 
WITH CHECK (is_admin());