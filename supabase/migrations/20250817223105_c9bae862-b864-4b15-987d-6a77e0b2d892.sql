-- Corrigir políticas RLS para permitir atualizações de tarefas
-- Remover políticas existentes que podem estar causando conflito
DROP POLICY IF EXISTS "Users can update their own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can view tasks from their filial" ON tasks;
DROP POLICY IF EXISTS "Managers and admins can view all tasks" ON tasks;

-- Recriar política de visualização mais permissiva
CREATE POLICY "Users can view all tasks they have access to" 
ON tasks FOR SELECT 
USING (
  -- Usuários podem ver suas próprias tarefas
  auth.uid() = created_by 
  OR 
  -- Ou tarefas da mesma filial
  user_same_filial(created_by)
  OR
  -- Ou se for manager/admin
  (EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('manager', 'admin')
  ))
);

-- Recriar política de atualização mais permissiva
CREATE POLICY "Users can update accessible tasks" 
ON tasks FOR UPDATE 
USING (
  -- Usuários podem atualizar suas próprias tarefas
  auth.uid() = created_by 
  OR 
  -- Ou se for manager/admin podem atualizar qualquer tarefa
  (EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('manager', 'admin')
  ))
)
WITH CHECK (
  -- Mesma lógica para o check
  auth.uid() = created_by 
  OR 
  (EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('manager', 'admin')
  ))
);

-- Adicionar log para debug
CREATE OR REPLACE FUNCTION log_task_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE NOTICE 'Task update attempt: user=%, task_created_by=%, is_prospect=%, sales_confirmed=%', 
    auth.uid(), NEW.created_by, NEW.is_prospect, NEW.sales_confirmed;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger para debug (temporário)
DROP TRIGGER IF EXISTS log_task_updates ON tasks;
CREATE TRIGGER log_task_updates
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_task_update();