-- Drop the recursive policy
DROP POLICY IF EXISTS "profiles_select_supervisor_filial" ON public.profiles;

-- Create a security definer function to get supervisor's filial_id without hitting RLS
CREATE OR REPLACE FUNCTION public.get_supervisor_filial_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT filial_id
  FROM public.profiles
  WHERE user_id = p_user_id
    AND approval_status = 'approved'
  LIMIT 1;
$$;

-- Recreate the policy using the security definer function
CREATE POLICY "profiles_select_supervisor_filial"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'supervisor'::app_role)
  AND filial_id = get_supervisor_filial_id(auth.uid())
);