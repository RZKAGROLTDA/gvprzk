-- FASE 1 & 2: ANÁLISE E UNIFICAÇÃO DAS TABELAS
-- Backup e migração da estrutura do banco

-- 1. Criar tabela de backup da tasks antiga
CREATE TABLE IF NOT EXISTS tasks_backup AS SELECT * FROM tasks;

-- 2. Adicionar foreign keys que estão faltando na tabela tasks_new
ALTER TABLE tasks_new 
ADD CONSTRAINT fk_tasks_new_vendedor 
FOREIGN KEY (vendedor_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Adicionar foreign key para opportunities
ALTER TABLE opportunities 
ADD CONSTRAINT fk_opportunities_task 
FOREIGN KEY (task_id) REFERENCES tasks_new(id) ON DELETE CASCADE;

-- 4. Adicionar foreign key para opportunity_items
ALTER TABLE opportunity_items 
ADD CONSTRAINT fk_opportunity_items_opportunity 
FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE;

-- 5. Adicionar foreign key para profiles
ALTER TABLE profiles 
ADD CONSTRAINT fk_profiles_filial 
FOREIGN KEY (filial_id) REFERENCES filiais(id) ON DELETE SET NULL;

-- 6. Adicionar foreign keys para a tabela tasks antiga (products e reminders)
ALTER TABLE products 
ADD CONSTRAINT fk_products_task 
FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE reminders 
ADD CONSTRAINT fk_reminders_task 
FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

-- 7. Adicionar foreign key para user_invitations
ALTER TABLE user_invitations 
ADD CONSTRAINT fk_user_invitations_created_by 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 8. Adicionar foreign key para clients
ALTER TABLE clients 
ADD CONSTRAINT fk_clients_created_by 
FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 9. Adicionar foreign key para task_creation_log
ALTER TABLE task_creation_log 
ADD CONSTRAINT fk_task_creation_log_task 
FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

-- 10. Criar índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_tasks_new_vendedor_id ON tasks_new(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_tasks_new_data ON tasks_new(data);
CREATE INDEX IF NOT EXISTS idx_opportunities_task_id ON opportunities(task_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_items_opportunity_id ON opportunity_items(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_products_task_id ON products(task_id);
CREATE INDEX IF NOT EXISTS idx_reminders_task_id ON reminders(task_id);
CREATE INDEX IF NOT EXISTS idx_profiles_filial_id ON profiles(filial_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_id ON security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created_at ON security_audit_log(created_at);

-- 11. Função para migrar dados da tasks antiga para tasks_new
CREATE OR REPLACE FUNCTION migrate_tasks_to_new_structure()
RETURNS TABLE(
  action text,
  old_task_id uuid,
  new_task_id uuid,
  client_name text,
  status text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  task_record record;
  new_task_id uuid;
  opportunity_id uuid;
BEGIN
  -- Migrar tasks antigas que não têm correspondente em tasks_new
  FOR task_record IN 
    SELECT t.* FROM tasks t
    WHERE NOT EXISTS (
      SELECT 1 FROM tasks_new tn 
      WHERE tn.vendedor_id = t.created_by 
      AND tn.cliente_nome = t.client 
      AND tn.data = t.start_date
    )
  LOOP
    -- Criar nova task em tasks_new
    INSERT INTO tasks_new (
      vendedor_id,
      data,
      tipo,
      cliente_nome,
      cliente_email,
      filial,
      notas,
      created_at,
      updated_at
    ) VALUES (
      task_record.created_by,
      task_record.start_date,
      task_record.task_type,
      task_record.client,
      task_record.email,
      task_record.filial,
      task_record.observations,
      task_record.created_at,
      task_record.updated_at
    ) RETURNING id INTO new_task_id;

    -- Criar opportunity correspondente se for prospect
    IF task_record.is_prospect THEN
      INSERT INTO opportunities (
        task_id,
        cliente_nome,
        filial,
        valor_total_oportunidade,
        valor_venda_fechada,
        status,
        data_criacao,
        data_fechamento
      ) VALUES (
        new_task_id,
        task_record.client,
        task_record.filial,
        COALESCE(task_record.sales_value, 0),
        CASE 
          WHEN task_record.sales_confirmed THEN COALESCE(task_record.sales_value, 0)
          ELSE 0
        END,
        CASE 
          WHEN task_record.sales_confirmed THEN 'Ganho'
          WHEN task_record.is_prospect THEN 'Prospect'
          ELSE 'Perdido'
        END,
        task_record.created_at,
        CASE WHEN task_record.sales_confirmed THEN task_record.updated_at ELSE NULL END
      ) RETURNING id INTO opportunity_id;

      -- Migrar products para opportunity_items
      INSERT INTO opportunity_items (
        opportunity_id,
        produto,
        sku,
        preco_unit,
        qtd_ofertada,
        qtd_vendida,
        subtotal_ofertado,
        subtotal_vendido
      )
      SELECT 
        opportunity_id,
        p.name,
        p.category,
        COALESCE(p.price, 0),
        COALESCE(p.quantity, 0),
        CASE WHEN p.selected AND task_record.sales_confirmed THEN COALESCE(p.quantity, 0) ELSE 0 END,
        COALESCE(p.price, 0) * COALESCE(p.quantity, 0),
        CASE WHEN p.selected AND task_record.sales_confirmed 
             THEN COALESCE(p.price, 0) * COALESCE(p.quantity, 0) 
             ELSE 0 END
      FROM products p
      WHERE p.task_id = task_record.id;
    END IF;

    RETURN QUERY SELECT 
      'MIGRATED'::text,
      task_record.id,
      new_task_id,
      task_record.client,
      CASE WHEN task_record.is_prospect THEN 'PROSPECT' ELSE 'REGULAR' END;
  END LOOP;

  RETURN QUERY SELECT 
    'MIGRATION_COMPLETE'::text,
    NULL::uuid,
    NULL::uuid,
    ''::text,
    ''::text;
END;
$$;

-- 12. Função para limpeza de dados órfãos
CREATE OR REPLACE FUNCTION cleanup_orphaned_data()
RETURNS TABLE(
  table_name text,
  action text,
  count bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  orphan_count bigint;
BEGIN
  -- Limpar products órfãos
  DELETE FROM products 
  WHERE task_id NOT IN (SELECT id FROM tasks);
  
  GET DIAGNOSTICS orphan_count = ROW_COUNT;
  RETURN QUERY SELECT 'products'::text, 'DELETED_ORPHANS'::text, orphan_count;

  -- Limpar reminders órfãos
  DELETE FROM reminders 
  WHERE task_id NOT IN (SELECT id FROM tasks);
  
  GET DIAGNOSTICS orphan_count = ROW_COUNT;
  RETURN QUERY SELECT 'reminders'::text, 'DELETED_ORPHANS'::text, orphan_count;

  -- Limpar opportunity_items órfãos
  DELETE FROM opportunity_items 
  WHERE opportunity_id NOT IN (SELECT id FROM opportunities);
  
  GET DIAGNOSTICS orphan_count = ROW_COUNT;
  RETURN QUERY SELECT 'opportunity_items'::text, 'DELETED_ORPHANS'::text, orphan_count;

  -- Limpar opportunities órfãs
  DELETE FROM opportunities 
  WHERE task_id NOT IN (SELECT id FROM tasks_new);
  
  GET DIAGNOSTICS orphan_count = ROW_COUNT;
  RETURN QUERY SELECT 'opportunities'::text, 'DELETED_ORPHANS'::text, orphan_count;
END;
$$;

-- 13. Criar função para validar integridade dos dados
CREATE OR REPLACE FUNCTION validate_data_integrity()
RETURNS TABLE(
  check_name text,
  status text,
  count bigint,
  details text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verificar tasks_new sem profiles válidos
  RETURN QUERY
  SELECT 
    'tasks_new_without_profiles'::text,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'ERROR' END::text,
    COUNT(*),
    'Tasks in tasks_new without corresponding profiles'::text
  FROM tasks_new tn
  WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = tn.vendedor_id);

  -- Verificar opportunities sem tasks_new
  RETURN QUERY
  SELECT 
    'opportunities_without_tasks'::text,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'ERROR' END::text,
    COUNT(*),
    'Opportunities without corresponding tasks_new'::text
  FROM opportunities o
  WHERE NOT EXISTS (SELECT 1 FROM tasks_new tn WHERE tn.id = o.task_id);

  -- Verificar opportunity_items sem opportunities
  RETURN QUERY
  SELECT 
    'items_without_opportunities'::text,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'ERROR' END::text,
    COUNT(*),
    'Opportunity items without corresponding opportunities'::text
  FROM opportunity_items oi
  WHERE NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.id = oi.opportunity_id);

  -- Verificar profiles sem filiais válidas
  RETURN QUERY
  SELECT 
    'profiles_with_invalid_filial'::text,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END::text,
    COUNT(*),
    'Profiles with filial_id not in filiais table'::text
  FROM profiles p
  WHERE p.filial_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM filiais f WHERE f.id = p.filial_id);
END;
$$;

-- 14. Atualizar RLS policies para funcionar com foreign keys
-- Remover policies duplicadas e criar policies mais eficientes

-- Para tasks_new
DROP POLICY IF EXISTS "Tasks: Access control" ON tasks_new;
CREATE POLICY "Enhanced tasks_new access control"
ON tasks_new FOR ALL
TO authenticated
USING (
  vendedor_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'manager')
)
WITH CHECK (
  vendedor_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'manager')
);

-- Para opportunities
DROP POLICY IF EXISTS "Enhanced opportunities access control" ON opportunities;
CREATE POLICY "Opportunities access control with foreign keys"
ON opportunities FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tasks_new tn 
    WHERE tn.id = opportunities.task_id 
    AND (
      tn.vendedor_id = auth.uid() OR 
      EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'manager')
    )
  )
);

-- Para opportunity_items
DROP POLICY IF EXISTS "Opportunity Items: Access control" ON opportunity_items;
CREATE POLICY "Opportunity items access control with foreign keys"
ON opportunity_items FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM opportunities o
    JOIN tasks_new tn ON tn.id = o.task_id
    WHERE o.id = opportunity_items.opportunity_id
    AND (
      tn.vendedor_id = auth.uid() OR 
      EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'manager')
    )
  )
);

-- Conceder permissões necessárias
GRANT EXECUTE ON FUNCTION migrate_tasks_to_new_structure() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_orphaned_data() TO authenticated;
GRANT EXECUTE ON FUNCTION validate_data_integrity() TO authenticated;