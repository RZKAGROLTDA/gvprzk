-- Migrate super admins to user_roles table with 'admin' role
INSERT INTO public.user_roles (user_id, role, created_by)
VALUES 
  ('7c4cb176-3730-41de-b1e7-58bdb92da9e9'::uuid, 'admin'::app_role, '7c4cb176-3730-41de-b1e7-58bdb92da9e9'::uuid),
  ('b6543a7f-3b83-42dc-aa69-930dcb56b21d'::uuid, 'admin'::app_role, 'b6543a7f-3b83-42dc-aa69-930dcb56b21d'::uuid)
ON CONFLICT (user_id, role) DO NOTHING;

-- Drop the old manager-only delete policy
DROP POLICY IF EXISTS "secure_task_delete_manager_only" ON public.tasks;

-- Create new admin-only delete policy using the has_role security definer function
CREATE POLICY "secure_task_delete_admin_only" 
ON public.tasks
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
);

-- Log the security policy update
COMMENT ON POLICY "secure_task_delete_admin_only" ON public.tasks IS 
'Only users with admin role in user_roles table can delete tasks. Uses security definer function to prevent RLS recursion.';