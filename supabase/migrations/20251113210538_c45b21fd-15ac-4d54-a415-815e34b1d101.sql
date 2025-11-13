-- Remover política antiga de SELECT muito restritiva
DROP POLICY IF EXISTS "Users can view opportunities for accessible tasks" ON opportunities;

-- Criar nova política de SELECT alinhada com as tasks
-- Permite ver opportunities se:
-- 1. É manager (vê tudo)
-- 2. Criou a task associada
-- 3. É supervisor da mesma filial da task
-- 4. Tem acesso via task_access_metadata
CREATE POLICY "opportunities_select_aligned_with_tasks" ON opportunities
FOR SELECT
USING (
  -- Manager vê tudo
  has_role(auth.uid(), 'manager'::app_role)
  OR
  -- Usuário criou a task associada
  EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = opportunities.task_id
    AND t.created_by = auth.uid()
  )
  OR
  -- Supervisor da mesma filial vê opportunities da sua filial
  (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND EXISTS (
      SELECT 1 
      FROM tasks t
      JOIN profiles p1 ON p1.user_id = auth.uid()
      JOIN profiles p2 ON p2.user_id = t.created_by
      WHERE t.id = opportunities.task_id
      AND p1.filial_id = p2.filial_id
      AND p1.approval_status = 'approved'
    )
  )
);