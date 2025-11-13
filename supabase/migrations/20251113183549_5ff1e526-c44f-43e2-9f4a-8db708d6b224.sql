-- SOLUÇÃO DEFINITIVA: Tabela auxiliar sem RLS para metadados de acesso
-- Isso quebra o ciclo de RLS entre opportunities e tasks

-- Criar tabela de metadados de tasks (sem RLS)
CREATE TABLE IF NOT EXISTS task_access_metadata (
  task_id uuid PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  creator_filial_id uuid REFERENCES filiais(id),
  creator_approval_status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_task_access_creator ON task_access_metadata(created_by);
CREATE INDEX IF NOT EXISTS idx_task_access_filial ON task_access_metadata(creator_filial_id);

-- Popular tabela com dados existentes
INSERT INTO task_access_metadata (task_id, created_by, creator_filial_id, creator_approval_status)
SELECT 
  t.id,
  t.created_by,
  p.filial_id,
  p.approval_status
FROM tasks t
JOIN profiles p ON p.user_id = t.created_by
ON CONFLICT (task_id) DO UPDATE SET
  created_by = EXCLUDED.created_by,
  creator_filial_id = EXCLUDED.creator_filial_id,
  creator_approval_status = EXCLUDED.creator_approval_status,
  updated_at = now();

-- Trigger para manter sincronizado
CREATE OR REPLACE FUNCTION sync_task_access_metadata()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    INSERT INTO task_access_metadata (task_id, created_by, creator_filial_id, creator_approval_status)
    SELECT 
      NEW.id,
      NEW.created_by,
      p.filial_id,
      p.approval_status
    FROM profiles p 
    WHERE p.user_id = NEW.created_by
    ON CONFLICT (task_id) DO UPDATE SET
      created_by = EXCLUDED.created_by,
      creator_filial_id = EXCLUDED.creator_filial_id,
      creator_approval_status = EXCLUDED.creator_approval_status,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER sync_task_metadata_trigger
AFTER INSERT OR UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION sync_task_access_metadata();

-- Agora recriar a policy de opportunities usando a tabela auxiliar (SEM RLS)
DROP POLICY IF EXISTS "Users can view opportunities for accessible tasks" ON opportunities;

CREATE POLICY "Users can view opportunities for accessible tasks"
ON opportunities
FOR SELECT
TO authenticated
USING (
  -- Manager vê tudo
  has_role(auth.uid(), 'manager'::app_role)
  OR
  -- Usuário vê suas próprias
  EXISTS (
    SELECT 1 FROM task_access_metadata m
    WHERE m.task_id = opportunities.task_id
      AND m.created_by = auth.uid()
  )
  OR
  -- Supervisor vê tasks de usuários da mesma filial
  (
    has_role(auth.uid(), 'supervisor'::app_role)
    AND EXISTS (
      SELECT 1 
      FROM task_access_metadata m
      CROSS JOIN profiles p_supervisor
      WHERE m.task_id = opportunities.task_id
        AND p_supervisor.user_id = auth.uid()
        AND m.creator_filial_id = p_supervisor.filial_id
        AND m.creator_approval_status = 'approved'
        AND p_supervisor.approval_status = 'approved'
    )
  )
);