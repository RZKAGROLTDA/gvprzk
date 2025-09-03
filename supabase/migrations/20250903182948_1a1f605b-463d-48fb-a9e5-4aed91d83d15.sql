-- Corrigir política RLS da tabela opportunities para permitir acesso tanto para tasks_new quanto tasks
DROP POLICY IF EXISTS "Opportunities access control with foreign keys" ON opportunities;

CREATE POLICY "Opportunities access control with tasks and tasks_new" 
ON opportunities
FOR ALL
USING (
  -- Verificar se a task existe em tasks_new E o usuário tem acesso
  (EXISTS (
    SELECT 1 FROM tasks_new tn
    WHERE tn.id = opportunities.task_id 
    AND (tn.vendedor_id = auth.uid() OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid() 
      AND profiles.role = 'manager'
    ))
  ))
  OR
  -- Verificar se a task existe em tasks E o usuário tem acesso
  (EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.id = opportunities.task_id 
    AND (t.created_by = auth.uid() OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid() 
      AND profiles.role = 'manager'
    ))
  ))
);