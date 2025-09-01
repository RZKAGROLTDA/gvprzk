-- Fix the ambiguous column reference error in get_user_directory_with_fallback
-- The issue is the variable name 'current_user_role' conflicts with column references

DROP FUNCTION IF EXISTS public.get_user_directory_with_fallback();

CREATE OR REPLACE FUNCTION public.get_user_directory_with_fallback()
RETURNS TABLE(id uuid, user_id uuid, name text, email text, role text, approval_status text, filial_id uuid, filial_nome text, created_at timestamp with time zone, updated_at timestamp with time zone, is_masked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_current_role text;  -- Renamed to avoid ambiguity with p.role
  is_admin boolean := false;
  has_manager boolean := false;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  -- Check if there's any manager in the system
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE role = 'manager') INTO has_manager;

  -- Get current user's role (using fully qualified column name)
  SELECT p.role INTO user_current_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  AND p.approval_status = 'approved';
  
  -- Check if user is admin/manager OR if no manager exists (emergency access)
  is_admin := (user_current_role = 'manager') OR (NOT has_manager);
  
  -- Allow access if user is admin OR if no manager exists in system (bootstrap scenario)
  IF NOT is_admin AND has_manager THEN
    RAISE EXCEPTION 'Access denied: Manager role required';
  END IF;
  
  -- Log the access for security audit
  PERFORM public.secure_log_security_event(
    'user_directory_access',
    auth.uid(),
    jsonb_build_object(
      'accessed_by_role', user_current_role,
      'emergency_access', NOT has_manager,
      'timestamp', now()
    ),
    CASE WHEN NOT has_manager THEN 3 ELSE 2 END
  );
  
  -- Return user directory with filial information (using fully qualified column names)
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
  LEFT JOIN public.filiais f ON f.id = p.filial_id
  WHERE p.approval_status = 'approved'
  ORDER BY p.created_at DESC;
END;
$function$;