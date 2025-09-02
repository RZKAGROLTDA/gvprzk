-- Create function to get filiais for registration (public access for unauthenticated users)
CREATE OR REPLACE FUNCTION public.get_filiais_for_registration()
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT f.id, f.nome 
  FROM public.filiais f
  ORDER BY f.nome ASC;
$$;

-- Grant execute permissions to anonymous users (for registration)
GRANT EXECUTE ON FUNCTION public.get_filiais_for_registration TO anon;
GRANT EXECUTE ON FUNCTION public.get_filiais_for_registration TO authenticated;