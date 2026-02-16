
-- Drop and recreate INSERT policy to allow supervisors
DROP POLICY IF EXISTS "Users can create opportunities for their tasks" ON public.opportunities;

CREATE POLICY "Users can create opportunities for their tasks"
ON public.opportunities
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = opportunities.task_id
    AND (
      t.created_by = auth.uid()
      OR has_role(auth.uid(), 'manager'::app_role)
      OR (
        has_role(auth.uid(), 'supervisor'::app_role)
        AND EXISTS (
          SELECT 1 FROM profiles p
          JOIN filiais f ON p.filial_id = f.id
          WHERE p.user_id = auth.uid()
          AND p.approval_status = 'approved'
          AND t.filial = f.nome
        )
      )
    )
  )
);
