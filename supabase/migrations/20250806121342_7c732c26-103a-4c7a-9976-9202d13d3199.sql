-- Fix the invitation token function to use gen_random_uuid instead
CREATE OR REPLACE FUNCTION public.generate_invitation_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN replace(gen_random_uuid()::text, '-', '');
END;
$$;