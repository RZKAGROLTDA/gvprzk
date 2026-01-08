-- Fix get_user_directory_with_fallback to use user_roles table for authorization
-- and include supervisor role in the list of authorized roles

CREATE OR REPLACE FUNCTION public.get_user_directory_with_fallback()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  name text,
  email text,
  role text,
  approval_status text,
  filial_id uuid,
  filial_nome text,
  created_at timestamptz,
  updated_at timestamptz,
  is_masked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_current_role text;
  is_authorized boolean := false;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  -- SECURITY FIX: Check user_roles table instead of profiles.role
  -- Allow admin, manager, or supervisor to access user directory
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'manager', 'supervisor')
  ) INTO is_authorized;
  
  -- Fallback: Also check profiles.role for backwards compatibility
  IF NOT is_authorized THEN
    SELECT p.role INTO user_current_role
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.approval_status = 'approved';
    
    is_authorized := (user_current_role IN ('manager', 'supervisor'));
  END IF;
  
  -- Only authorized users can access user directory
  IF NOT is_authorized THEN
    RAISE EXCEPTION 'Access denied: Manager or Supervisor role required';
  END IF;
  
  -- Determine if current user is admin/manager for full access
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'manager')
  ) INTO is_authorized;
  
  -- Log the access for security audit
  PERFORM public.secure_log_security_event(
    'user_directory_access',
    auth.uid(),
    jsonb_build_object(
      'is_full_access', is_authorized,
      'timestamp', now()
    ),
    2
  );
  
  -- Return user directory with filial information
  -- Include ALL users (pending, approved, rejected) for management
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.name,
    CASE 
      WHEN is_authorized THEN p.email
      ELSE SUBSTRING(p.email FROM 1 FOR 1) || '***@' || SPLIT_PART(p.email, '@', 2)
    END as email,
    p.role,
    p.approval_status,
    p.filial_id,
    COALESCE(f.nome, 'Sem filial') as filial_nome,
    p.created_at,
    p.updated_at,
    (NOT is_authorized) as is_masked
  FROM public.profiles p
  LEFT JOIN public.filiais f ON p.filial_id = f.id
  ORDER BY 
    CASE p.approval_status 
      WHEN 'pending' THEN 1 
      WHEN 'approved' THEN 2 
      WHEN 'rejected' THEN 3 
      ELSE 4 
    END,
    p.created_at DESC;
END;
$$;