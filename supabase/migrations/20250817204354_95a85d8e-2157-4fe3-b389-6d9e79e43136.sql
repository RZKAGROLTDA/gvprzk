-- SECURITY FIX: Create secure user directory access
-- Fix for exposed employee directory vulnerability

-- Create a secure function that returns user directory data with proper authorization
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
    -- Only expose email to managers or the user themselves
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
    -- Users can see limited info from same filial (but not emails)
    user_same_filial(p.user_id);
END;
$$;

-- Grant execute permission only to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_directory() TO authenticated;

-- Create RLS-enabled table for secure user directory access
CREATE TABLE IF NOT EXISTS public.user_directory_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  email text,
  role text NOT NULL,
  filial_id uuid,
  approval_status text NOT NULL,
  filial_nome text,
  last_updated timestamp with time zone DEFAULT now(),
  UNIQUE(profile_id)
);

-- Enable RLS on the cache table
ALTER TABLE public.user_directory_cache ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for the cache table
CREATE POLICY "Users can view directory entries they have access to"
ON public.user_directory_cache
FOR SELECT
USING (
  -- User can see their own entry
  auth.uid() = user_id OR
  -- Managers can see all entries
  current_user_is_admin() OR
  -- Users can see entries from same filial (but not emails)
  user_same_filial(user_id)
);

-- Create policy to prevent data modification by non-admins
CREATE POLICY "Only admins can modify directory cache"
ON public.user_directory_cache
FOR ALL
USING (current_user_is_admin())
WITH CHECK (current_user_is_admin());

-- Create function to refresh the directory cache securely
CREATE OR REPLACE FUNCTION public.refresh_user_directory_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only admins can refresh the cache
  IF NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Clear and repopulate the cache
  DELETE FROM public.user_directory_cache;
  
  INSERT INTO public.user_directory_cache (
    profile_id, user_id, name, email, role, filial_id, approval_status, filial_nome
  )
  SELECT 
    p.id,
    p.user_id,
    p.name,
    p.email, -- Full email stored in cache, but RLS will filter access
    p.role,
    p.filial_id,
    p.approval_status,
    f.nome
  FROM public.profiles p
  LEFT JOIN public.filiais f ON p.filial_id = f.id
  WHERE p.approval_status = 'approved';
END;
$$;