-- Fix RLS policy for tasks table to check task's filial instead of creator's filial
-- This allows supervisors to see tasks assigned to their filial regardless of who created them

DROP POLICY IF EXISTS "secure_task_select_enhanced" ON public.tasks;

CREATE POLICY "secure_task_select_enhanced" 
ON public.tasks 
FOR SELECT
USING (
  -- Owner can always see their own tasks
  auth.uid() = created_by
  
  -- Managers/admins can see all tasks
  OR has_role(auth.uid(), 'manager'::app_role)
  
  -- Supervisors can see tasks in their filial (checking task.filial, not creator's filial)
  OR (
    has_role(auth.uid(), 'supervisor'::app_role) 
    AND EXISTS (
      SELECT 1 FROM profiles p
      JOIN filiais f ON p.filial_id = f.id
      WHERE p.user_id = auth.uid() 
        AND p.approval_status = 'approved'
        AND f.nome = tasks.filial
    )
  )
  
  -- Same filial users can see low-value tasks (≤10000)
  OR (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN filiais f ON p.filial_id = f.id
      WHERE p.user_id = auth.uid() 
        AND p.approval_status = 'approved'
        AND f.nome = tasks.filial
    )
    AND COALESCE(tasks.sales_value, 0) <= 10000
  )
);