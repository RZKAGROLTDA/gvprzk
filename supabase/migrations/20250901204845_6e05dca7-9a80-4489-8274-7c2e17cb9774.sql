-- Corrigir função get_user_directory_with_fallback para resolver ambiguidade da coluna 'role'
DROP FUNCTION IF EXISTS public.get_user_directory_with_fallback();

CREATE OR REPLACE FUNCTION public.get_user_directory_with_fallback()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  name text,
  email text,
  role text,
  approval_status text,
  filial_id uuid,
  filial_nome text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  is_masked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_current_role text; -- Renomeado para evitar ambiguidade
  is_admin boolean := false;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  -- Get current user's role
  SELECT p.role INTO user_current_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  AND p.approval_status = 'approved';
  
  -- Check if user is admin/manager
  is_admin := (user_current_role = 'manager');
  
  -- Only managers can access user directory
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Access denied: Manager role required';
  END IF;
  
  -- Log the access for security audit
  PERFORM public.secure_log_security_event(
    'user_directory_access',
    auth.uid(),
    jsonb_build_object(
      'accessed_by_role', user_current_role,
      'timestamp', now()
    ),
    2
  );
  
  -- Return user directory with filial information
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.name,
    CASE 
      WHEN is_admin THEN p.email
      ELSE SUBSTRING(p.email FROM 1 FOR 1) || '***@' || SPLIT_PART(p.email, '@', 2)
    END as email,
    p.role,
    p.approval_status,
    p.filial_id,
    f.nome as filial_nome,
    p.created_at,
    p.updated_at,
    (NOT is_admin) as is_masked
  FROM public.profiles p
  LEFT JOIN public.filiais f ON p.filial_id = f.id
  WHERE p.approval_status IN ('approved', 'pending')
  ORDER BY p.created_at DESC;
END;
$$;