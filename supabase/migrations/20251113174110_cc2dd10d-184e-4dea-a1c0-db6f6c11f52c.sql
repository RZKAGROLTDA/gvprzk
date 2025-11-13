-- Dropar policies existentes
DROP POLICY IF EXISTS "Users can view opportunities for accessible tasks" ON opportunities;
DROP POLICY IF EXISTS "Users can update opportunities for their tasks" ON opportunities;

-- Dropar a função se existir
DROP FUNCTION IF EXISTS public.can_access_opportunity_as_supervisor(uuid, uuid);

-- Criar política de SELECT para opportunities
-- Lógica: Supervisor vê opportunities de tasks criadas por qualquer usuário da mesma filial
CREATE POLICY "Users can view opportunities for accessible tasks"
ON opportunities
FOR SELECT
TO authenticated
USING (
  -- Manager vê tudo
  has_role(auth.uid(), 'manager'::app_role)
  OR
  -- Criador da task vê a opportunity
  EXISTS (
    SELECT 1
    FROM tasks t
    WHERE t.id = opportunities.task_id
    AND t.created_by::uuid = auth.uid()
  )
  OR
  -- Supervisor vê opportunities de tasks criadas por usuários da mesma filial
  (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND EXISTS (
      SELECT 1
      FROM tasks t
      JOIN profiles p_task_creator ON p_task_creator.user_id = t.created_by::uuid
      JOIN profiles p_supervisor ON p_supervisor.user_id = auth.uid()
      WHERE t.id = opportunities.task_id
      AND p_task_creator.filial_id = p_supervisor.filial_id
      AND p_task_creator.approval_status = 'approved'
      AND p_supervisor.approval_status = 'approved'
    )
  )
);

-- Criar política de UPDATE para opportunities
CREATE POLICY "Users can update opportunities for their tasks"
ON opportunities
FOR UPDATE
TO authenticated
USING (
  -- Manager pode atualizar tudo
  has_role(auth.uid(), 'manager'::app_role)
  OR
  -- Criador da task pode atualizar
  EXISTS (
    SELECT 1
    FROM tasks t
    WHERE t.id = opportunities.task_id
    AND t.created_by::uuid = auth.uid()
  )
  OR
  -- Supervisor pode atualizar opportunities da mesma filial
  (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND EXISTS (
      SELECT 1
      FROM tasks t
      JOIN profiles p_task_creator ON p_task_creator.user_id = t.created_by::uuid
      JOIN profiles p_supervisor ON p_supervisor.user_id = auth.uid()
      WHERE t.id = opportunities.task_id
      AND p_task_creator.filial_id = p_supervisor.filial_id
      AND p_task_creator.approval_status = 'approved'
      AND p_supervisor.approval_status = 'approved'
    )
  )
)
WITH CHECK (
  -- Manager pode atualizar tudo
  has_role(auth.uid(), 'manager'::app_role)
  OR
  -- Criador da task pode atualizar
  EXISTS (
    SELECT 1
    FROM tasks t
    WHERE t.id = opportunities.task_id
    AND t.created_by::uuid = auth.uid()
  )
  OR
  -- Supervisor pode atualizar opportunities da mesma filial
  (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND EXISTS (
      SELECT 1
      FROM tasks t
      JOIN profiles p_task_creator ON p_task_creator.user_id = t.created_by::uuid
      JOIN profiles p_supervisor ON p_supervisor.user_id = auth.uid()
      WHERE t.id = opportunities.task_id
      AND p_task_creator.filial_id = p_supervisor.filial_id
      AND p_task_creator.approval_status = 'approved'
      AND p_supervisor.approval_status = 'approved'
    )
  )
);