-- Fix RLS policy for filiais table to allow unauthenticated users to view filiais during registration
-- This is necessary because users need to select a filial before they can register and authenticate

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Only authenticated users can view filiais" ON public.filiais;

-- Create a new policy that allows everyone to view filiais (for registration purposes)
-- but keeps other operations restricted to admins
CREATE POLICY "Everyone can view filiais for registration" 
ON public.filiais 
FOR SELECT 
USING (true);

-- Keep the existing admin-only management policies for other operations
-- (These should already exist but let's ensure they're in place)
CREATE POLICY "Only admins can modify filiais" 
ON public.filiais 
FOR ALL 
USING (is_admin()) 
WITH CHECK (is_admin());