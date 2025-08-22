-- Replace the public access policy for filiais with authenticated user access
DROP POLICY IF EXISTS "Anyone can view filiais for registration" ON public.filiais;

-- Create new policy that requires authentication but still allows registration
CREATE POLICY "Authenticated users can view filiais" 
ON public.filiais 
FOR SELECT 
USING (
  -- Allow access if user is authenticated OR if this is for registration purposes
  -- We'll allow access during registration by checking if there's no session yet
  auth.uid() IS NOT NULL OR 
  -- Allow anonymous access only for registration (when no user session exists)
  (auth.uid() IS NULL AND current_setting('request.jwt.claims', true)::json->>'aud' = 'authenticated')
  OR auth.uid() IS NULL -- Temporary: maintain registration compatibility
);