
-- Fix RLS policy for supervisor to filter by task's filial field, not creator's filial
DROP POLICY IF EXISTS "secure_task_select_enhanced" ON public.tasks;

CREATE POLICY "secure_task_select_enhanced" ON public.tasks
FOR SELECT
USING (
  (auth.uid() = created_by) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  (
    has_role(auth.uid(), 'supervisor'::app_role) AND 
    EXISTS (
      SELECT 1 
      FROM profiles p
      JOIN filiais f ON p.filial_id = f.id
      WHERE p.user_id = auth.uid() 
        AND p.approval_status = 'approved'
        AND tasks.filial = f.nome  -- Compare task's filial field with supervisor's filial name
    )
  )
);
