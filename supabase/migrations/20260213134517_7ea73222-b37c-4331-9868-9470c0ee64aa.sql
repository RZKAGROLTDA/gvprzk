-- Allow supervisors to SELECT profiles from their own filial
CREATE POLICY "profiles_select_supervisor_filial"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'supervisor'
  )
  AND filial_id = (
    SELECT p.filial_id FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.approval_status = 'approved'
    LIMIT 1
  )
);