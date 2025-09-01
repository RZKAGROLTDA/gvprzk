-- Create initial manager user from first user
-- This solves the issue where get_secure_user_directory() requires a manager but none exists

-- Promote the first user (by registration date) to manager role
UPDATE public.profiles 
SET role = 'manager'
WHERE id = (
  SELECT id 
  FROM public.profiles 
  ORDER BY created_at ASC 
  LIMIT 1
)
AND role != 'manager'; -- Only update if not already manager

-- Alternative approach: create a temporary function that allows broader access
-- until we have a proper manager user
CREATE OR REPLACE FUNCTION public.get_user_directory_with_fallback()
RETURNS TABLE(id uuid, user_id uuid, name text, email text, role text, approval_status text, filial_id uuid, filial_nome text, created_at timestamp with time zone, updated_at timestamp with time zone, is_masked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  is_admin boolean := false;
  has_manager boolean := false;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  -- Check if there's any manager in the system
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE role = 'manager') INTO has_manager;

  -- Get current user's role
  SELECT p.role INTO current_user_role
  FROM public.profiles p
  WHERE p.user_id = auth.uid();
  
  -- Check if user is admin/manager OR if no manager exists (emergency access)
  is_admin := (current_user_role = 'manager') OR (NOT has_manager);
  
  -- Allow access if user is admin OR if no manager exists in system (bootstrap scenario)
  IF NOT is_admin AND has_manager THEN
    RAISE EXCEPTION 'Access denied: Manager role required';
  END IF;
  
  -- Log the access for security audit
  PERFORM public.secure_log_security_event(
    'user_directory_access',
    auth.uid(),
    jsonb_build_object(
      'accessed_by_role', current_user_role,
      'emergency_access', NOT has_manager,
      'timestamp', now()
    ),
    CASE WHEN NOT has_manager THEN 3 ELSE 2 END
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
  LEFT JOIN public.filiais f ON f.id = p.filial_id
  ORDER BY p.created_at DESC;
END;
$function$;