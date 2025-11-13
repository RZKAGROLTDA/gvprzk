-- Remover política atual
DROP POLICY IF EXISTS "opportunities_select_aligned_with_tasks" ON opportunities;

-- Criar nova política que permite supervisor ver TODAS opportunities da sua filial
CREATE POLICY "opportunities_select_with_supervisor_filial_access" ON opportunities
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
  -- Supervisor vê TODAS opportunities da sua filial
  (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND EXISTS (
      SELECT 1 
      FROM profiles p
      JOIN filiais f ON f.id = p.filial_id
      WHERE p.user_id = auth.uid()
      AND p.approval_status = 'approved'
      AND (
        -- Oportunidade tem filial igual ao nome da filial do supervisor
        opportunities.filial = f.nome
        OR
        -- Oportunidade tem filial igual ao ID da filial do supervisor
        opportunities.filial = p.filial_id::text
        OR
        -- Task associada tem a filial do supervisor
        EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.id = opportunities.task_id
          AND (t.filial = f.nome OR t.filial = p.filial_id::text)
        )
      )
    )
  )
);