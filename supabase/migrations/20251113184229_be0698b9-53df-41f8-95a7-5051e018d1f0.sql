-- Habilitar RLS na tabela task_access_metadata
ALTER TABLE task_access_metadata ENABLE ROW LEVEL SECURITY;

-- Policy de SELECT: todos os usuários autenticados podem ler (necessário para policies de opportunities)
CREATE POLICY "Authenticated users can read task metadata"
ON task_access_metadata
FOR SELECT
TO authenticated
USING (true);

-- Policy de INSERT/UPDATE/DELETE: apenas triggers/funções SECURITY DEFINER podem modificar
-- (não há policy, então usuários normais não podem modificar diretamente)