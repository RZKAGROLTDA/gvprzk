-- Remove the public access policy for filiais registration
DROP POLICY IF EXISTS "Allow public access to view filiais for registration" ON public.filiais;