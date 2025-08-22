-- Fix critical email privacy vulnerability
-- Update get_user_directory to completely hide emails from non-admin/non-owner users
CREATE OR REPLACE FUNCTION public.get_user_directory()
 RETURNS TABLE(id uuid, user_id uuid, name text, email text, role text, filial_id uuid, approval_status text, filial_nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Only authenticated users can access this function
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.name,
    -- CRITICAL PRIVACY FIX: Only expose emails to self or admins, NEVER to same filial users
    CASE 
      WHEN auth.uid() = p.user_id OR current_user_is_admin() THEN p.email
      ELSE NULL::text  -- Completely hide emails from all other users
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
    -- Users can see VERY LIMITED info from same filial (NO emails, NO personal data)
    (user_same_filial(p.user_id) AND p.approval_status = 'approved');
END;
$function$

-- Update get_secure_user_directory to match the same privacy protection
CREATE OR REPLACE FUNCTION public.get_secure_user_directory()
 RETURNS TABLE(id uuid, user_id uuid, name text, email text, role text, filial_id uuid, approval_status text, filial_nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Only authenticated users can access
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: Authentication required';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.name,
    -- CRITICAL PRIVACY FIX: Only expose emails to self or admins
    CASE 
      WHEN auth.uid() = p.user_id OR current_user_is_admin() THEN p.email
      ELSE NULL::text
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
    -- Users can see limited info from same filial
    user_same_filial(p.user_id);
END;
$function$

-- Log security fix implementation
SELECT public.secure_log_security_event(
  'security_fix_applied',
  NULL,
  jsonb_build_object(
    'fix_type', 'email_privacy_protection',
    'functions_updated', ARRAY['get_user_directory', 'get_secure_user_directory'],
    'implemented_by', 'system_security_review'
  ),
  2
);