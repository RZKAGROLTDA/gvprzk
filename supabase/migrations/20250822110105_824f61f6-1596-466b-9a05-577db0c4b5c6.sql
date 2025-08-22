-- Allow unauthenticated users to view filiais for registration purposes
DROP POLICY IF EXISTS "Authenticated users can view filiais for registration" ON public.filiais;

CREATE POLICY "Anyone can view filiais for registration"
  ON public.filiais
  FOR SELECT
  USING (true);