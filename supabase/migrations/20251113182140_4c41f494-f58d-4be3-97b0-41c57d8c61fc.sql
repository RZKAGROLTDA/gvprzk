-- SOLUÇÃO DEFINITIVA: Remover dependência de JOINs com RLS
-- Criar view materializada ou usar política direta sem função intermediária

-- Dropar política atual
DROP POLICY IF EXISTS "Users can view opportunities for accessible tasks" ON opportunities;

-- Criar nova política que não depende de função que faz JOINs
CREATE POLICY "Users can view opportunities for accessible tasks"
ON opportunities
FOR SELECT
TO authenticated
USING (
  -- Manager vê tudo
  has_role(auth.uid(), 'manager'::app_role)
  OR
  -- Usuário vê suas próprias (baseado direto em task_id sem JOIN)
  task_id IN (
    SELECT id FROM tasks WHERE created_by = auth.uid()
  )
  OR
  -- Supervisor vê de usuários da mesma filial (query única)
  (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND task_id IN (
      SELECT t.id 
      FROM tasks t
      WHERE t.created_by IN (
        SELECT p2.user_id
        FROM profiles p1
        CROSS JOIN profiles p2
        WHERE p1.user_id = auth.uid()
          AND p1.filial_id = p2.filial_id
          AND p1.approval_status = 'approved'
          AND p2.approval_status = 'approved'
      )
    )
  )
);