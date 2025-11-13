-- Corrigir políticas RLS da tabela opportunities para supervisores
-- O problema: supervisores não conseguem ver opportunities da sua filial

-- Drop das políticas antigas
DROP POLICY IF EXISTS "Users can view opportunities for accessible tasks" ON opportunities;
DROP POLICY IF EXISTS "Users can update opportunities for their tasks" ON opportunities;

-- Nova política de SELECT que inclui supervisores da mesma filial
CREATE POLICY "Users can view opportunities for accessible tasks"
ON opportunities
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM tasks t
    WHERE t.id = opportunities.task_id
    AND (
      -- Criador da task
      t.created_by = auth.uid()
      -- OU Manager
      OR has_role(auth.uid(), 'manager'::app_role)
      -- OU Supervisor da mesma filial
      OR (
        EXISTS (
          SELECT 1
          FROM profiles p1, profiles p2
          WHERE p1.user_id = auth.uid()
          AND p2.user_id = t.created_by
          AND p1.filial_id = p2.filial_id
          AND has_role(auth.uid(), 'supervisor'::app_role)
          AND p1.approval_status = 'approved'
        )
      )
    )
  )
);

-- Nova política de UPDATE que inclui supervisores da mesma filial
CREATE POLICY "Users can update opportunities for their tasks"
ON opportunities
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM tasks t
    WHERE t.id = opportunities.task_id
    AND (
      -- Criador da task
      t.created_by = auth.uid()
      -- OU Manager
      OR has_role(auth.uid(), 'manager'::app_role)
      -- OU Supervisor da mesma filial
      OR (
        EXISTS (
          SELECT 1
          FROM profiles p1, profiles p2
          WHERE p1.user_id = auth.uid()
          AND p2.user_id = t.created_by
          AND p1.filial_id = p2.filial_id
          AND has_role(auth.uid(), 'supervisor'::app_role)
          AND p1.approval_status = 'approved'
        )
      )
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM tasks t
    WHERE t.id = opportunities.task_id
    AND (
      t.created_by = auth.uid()
      OR has_role(auth.uid(), 'manager'::app_role)
      OR (
        EXISTS (
          SELECT 1
          FROM profiles p1, profiles p2
          WHERE p1.user_id = auth.uid()
          AND p2.user_id = t.created_by
          AND p1.filial_id = p2.filial_id
          AND has_role(auth.uid(), 'supervisor'::app_role)
          AND p1.approval_status = 'approved'
        )
      )
    )
  )
);