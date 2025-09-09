-- Fix RLS policy to allow supervisors to view all tasks in their filial regardless of sales value
DROP POLICY IF EXISTS "secure_task_select_enhanced" ON public.tasks;

CREATE POLICY "secure_task_select_enhanced" 
ON public.tasks 
FOR SELECT 
USING (
  (auth.uid() = created_by) OR 
  (EXISTS ( 
    SELECT 1
    FROM profiles p
    WHERE p.user_id = auth.uid() 
    AND p.role = 'manager' 
    AND p.approval_status = 'approved'
  )) OR 
  (EXISTS ( 
    SELECT 1
    FROM profiles p1, profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = tasks.created_by 
    AND p1.filial_id = p2.filial_id 
    AND p1.role = 'supervisor' 
    AND p1.approval_status = 'approved'
  )) OR 
  (EXISTS ( 
    SELECT 1
    FROM profiles p1, profiles p2
    WHERE p1.user_id = auth.uid() 
    AND p2.user_id = tasks.created_by 
    AND p1.filial_id = p2.filial_id 
    AND p1.role IN ('rac', 'consultant', 'sales_consultant', 'technical_consultant') 
    AND p1.approval_status = 'approved' 
    AND COALESCE(tasks.sales_value, 0) <= 15000
  ))
);