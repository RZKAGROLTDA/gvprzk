-- Fix products INSERT policy to allow managers and supervisors
DROP POLICY IF EXISTS "Users can create products for their tasks" ON products;

CREATE POLICY "Users can create products for their tasks"
ON products
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM tasks t
    WHERE t.id = products.task_id
    AND (
      -- Task owner can insert
      t.created_by = auth.uid()
      OR
      -- Managers can insert for any task
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.user_id = auth.uid()
        AND p.role = 'manager'
        AND p.approval_status = 'approved'
      )
      OR
      -- Supervisors can insert for tasks in their filial
      EXISTS (
        SELECT 1 FROM profiles p1, profiles p2
        WHERE p1.user_id = auth.uid()
        AND p2.user_id = t.created_by
        AND p1.filial_id = p2.filial_id
        AND p1.role = 'supervisor'
        AND p1.approval_status = 'approved'
      )
    )
  )
);