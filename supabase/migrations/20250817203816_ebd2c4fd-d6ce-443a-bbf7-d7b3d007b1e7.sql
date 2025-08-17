-- Fix security definer view issue by making it a regular view
-- The user_directory view is safe because it has proper RLS enforcement

DROP VIEW IF EXISTS public.user_directory;

-- Create a regular view (not SECURITY DEFINER) for user directory
CREATE VIEW public.user_directory AS
SELECT 
  p.id,
  p.user_id,
  p.name,
  -- Only expose email to managers or the user themselves
  CASE 
    WHEN auth.uid() = p.user_id OR current_user_is_admin() THEN p.email
    ELSE NULL
  END as email,
  p.role,
  p.filial_id,
  p.approval_status,
  f.nome as filial_nome
FROM public.profiles p
LEFT JOIN public.filiais f ON p.filial_id = f.id
WHERE 
  -- User can see their own profile
  auth.uid() = p.user_id OR
  -- Managers can see all profiles  
  current_user_is_admin() OR
  -- Users can see limited info from same filial (but not emails)
  user_same_filial(p.user_id);

-- Grant access to the view
GRANT SELECT ON public.user_directory TO authenticated;