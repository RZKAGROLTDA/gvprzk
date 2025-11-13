-- Criar função para verificar se um usuário pode ver uma opportunity como supervisor
CREATE OR REPLACE FUNCTION public.can_access_opportunity_as_supervisor(
  p_opportunity_task_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tasks t
    JOIN profiles p_task_creator ON p_task_creator.user_id = t.created_by
    JOIN profiles p_current_user ON p_current_user.user_id = p_user_id
    WHERE t.id = p_opportunity_task_id
    AND p_task_creator.filial_id = p_current_user.filial_id
    AND p_task_creator.approval_status = 'approved'
    AND p_current_user.approval_status = 'approved'
    AND has_role(p_user_id, 'supervisor'::app_role)
  );
$$;

-- Recriar políticas de opportunities usando a nova função
DROP POLICY IF EXISTS "Users can view opportunities for accessible tasks" ON opportunities;
DROP POLICY IF EXISTS "Users can update opportunities for their tasks" ON opportunities;

-- Nova política de SELECT simplificada
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
      -- OU Supervisor da mesma filial (usando função)
      OR can_access_opportunity_as_supervisor(t.id, auth.uid())
    )
  )
);

-- Nova política de UPDATE
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
      t.created_by = auth.uid()
      OR has_role(auth.uid(), 'manager'::app_role)
      OR can_access_opportunity_as_supervisor(t.id, auth.uid())
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
      OR can_access_opportunity_as_supervisor(t.id, auth.uid())
    )
  )
);