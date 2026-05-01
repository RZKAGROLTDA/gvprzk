-- Drop existing UPDATE policies on profiles
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_manager ON public.profiles;

-- (a) User can update own profile - strict, no role/approval references
CREATE POLICY profiles_update_own
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- (b) Approved admin/manager can update any profile
CREATE POLICY profiles_update_admin_manager
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.approval_status = 'approved'
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.approval_status = 'approved'
  )
);