-- Add RLS policy to allow unauthenticated users to view filiais during registration
CREATE POLICY "Allow public access to view filiais for registration" 
ON public.filiais 
FOR SELECT 
USING (true);