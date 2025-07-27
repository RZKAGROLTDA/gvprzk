-- Corrigir funções com search_path seguro
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER 
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'manager'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_filial_id()
RETURNS UUID 
LANGUAGE plpgsql 
SECURITY DEFINER 
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT filial_id FROM public.profiles 
    WHERE user_id = auth.uid()
  );
END;
$$;