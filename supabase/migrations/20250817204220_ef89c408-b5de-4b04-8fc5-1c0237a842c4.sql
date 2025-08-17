-- Drop the existing user_directory view that uses SECURITY DEFINER functions
DROP VIEW IF EXISTS public.user_directory;

-- Create a secure function instead of a view to properly handle RLS
CREATE OR REPLACE FUNCTION public.get_user_directory()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  name text,
  email text,
  role text,
  filial_id uuid,
  approval_status text,
  filial_nome text
)
LANGUAGE sql
STABLE
SECURITY INVOKER  -- Use INVOKER instead of DEFINER for better security
SET search_path = ''
AS $$
  SELECT 
    p.id,
    p.user_id,
    p.name,
    CASE
      WHEN (auth.uid() = p.user_id) THEN p.email  -- Users can see their own email
      WHEN EXISTS(SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager') THEN p.email  -- Managers can see all emails
      ELSE NULL::text  -- Others cannot see emails
    END AS email,
    p.role,
    p.filial_id,
    p.approval_status,
    f.nome AS filial_nome
  FROM public.profiles p
  LEFT JOIN public.filiais f ON p.filial_id = f.id
  WHERE 
    auth.uid() = p.user_id  -- Users can see their own profile
    OR EXISTS(SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')  -- Managers can see all
    OR EXISTS(  -- Users can see profiles from same filial
      SELECT 1 
      FROM public.profiles p1, public.profiles p2
      WHERE p1.user_id = auth.uid() 
      AND p2.user_id = p.user_id
      AND p1.filial_id = p2.filial_id 
      AND p1.filial_id IS NOT NULL
    );
$$;