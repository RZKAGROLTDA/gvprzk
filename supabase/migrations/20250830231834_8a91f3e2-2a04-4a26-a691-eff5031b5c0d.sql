-- CORREÇÃO DOS PROBLEMAS DE SEGURANÇA DETECTADOS

-- 1. Habilitar RLS na tabela tasks_backup que foi criada
ALTER TABLE tasks_backup ENABLE ROW LEVEL SECURITY;

-- Criar policy para tasks_backup (somente admins podem acessar)
CREATE POLICY "Only admins can access tasks backup"
ON tasks_backup FOR ALL
TO authenticated
USING (current_user_is_admin())
WITH CHECK (current_user_is_admin());

-- 2. Corrigir search_path das funções criadas
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
SET search_path = 'public'
AS $$
DECLARE
  task_record record;
  new_task_id uuid;
  opportunity_id uuid;
BEGIN
  -- Migrar tasks antigas que não têm correspondente em tasks_new
  FOR task_record IN 
    SELECT t.* FROM public.tasks t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.tasks_new tn 
      WHERE tn.vendedor_id = t.created_by 
      AND tn.cliente_nome = t.client 
      AND tn.data = t.start_date
    )
  LOOP
    -- Criar nova task em tasks_new
    INSERT INTO public.tasks_new (
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
      INSERT INTO public.opportunities (
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
      INSERT INTO public.opportunity_items (
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
      FROM public.products p
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

CREATE OR REPLACE FUNCTION cleanup_orphaned_data()
RETURNS TABLE(
  table_name text,
  action text,
  count bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  orphan_count bigint;
BEGIN
  -- Limpar products órfãos
  DELETE FROM public.products 
  WHERE task_id NOT IN (SELECT id FROM public.tasks);
  
  GET DIAGNOSTICS orphan_count = ROW_COUNT;
  RETURN QUERY SELECT 'products'::text, 'DELETED_ORPHANS'::text, orphan_count;

  -- Limpar reminders órfãos
  DELETE FROM public.reminders 
  WHERE task_id NOT IN (SELECT id FROM public.tasks);
  
  GET DIAGNOSTICS orphan_count = ROW_COUNT;
  RETURN QUERY SELECT 'reminders'::text, 'DELETED_ORPHANS'::text, orphan_count;

  -- Limpar opportunity_items órfãos
  DELETE FROM public.opportunity_items 
  WHERE opportunity_id NOT IN (SELECT id FROM public.opportunities);
  
  GET DIAGNOSTICS orphan_count = ROW_COUNT;
  RETURN QUERY SELECT 'opportunity_items'::text, 'DELETED_ORPHANS'::text, orphan_count;

  -- Limpar opportunities órfãs
  DELETE FROM public.opportunities 
  WHERE task_id NOT IN (SELECT id FROM public.tasks_new);
  
  GET DIAGNOSTICS orphan_count = ROW_COUNT;
  RETURN QUERY SELECT 'opportunities'::text, 'DELETED_ORPHANS'::text, orphan_count;
END;
$$;

CREATE OR REPLACE FUNCTION validate_data_integrity()
RETURNS TABLE(
  check_name text,
  status text,
  count bigint,
  details text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Verificar tasks_new sem profiles válidos
  RETURN QUERY
  SELECT 
    'tasks_new_without_profiles'::text,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'ERROR' END::text,
    COUNT(*),
    'Tasks in tasks_new without corresponding profiles'::text
  FROM public.tasks_new tn
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = tn.vendedor_id);

  -- Verificar opportunities sem tasks_new
  RETURN QUERY
  SELECT 
    'opportunities_without_tasks'::text,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'ERROR' END::text,
    COUNT(*),
    'Opportunities without corresponding tasks_new'::text
  FROM public.opportunities o
  WHERE NOT EXISTS (SELECT 1 FROM public.tasks_new tn WHERE tn.id = o.task_id);

  -- Verificar opportunity_items sem opportunities
  RETURN QUERY
  SELECT 
    'items_without_opportunities'::text,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'ERROR' END::text,
    COUNT(*),
    'Opportunity items without corresponding opportunities'::text
  FROM public.opportunity_items oi
  WHERE NOT EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = oi.opportunity_id);

  -- Verificar profiles sem filiais válidas
  RETURN QUERY
  SELECT 
    'profiles_with_invalid_filial'::text,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END::text,
    COUNT(*),
    'Profiles with filial_id not in filiais table'::text
  FROM public.profiles p
  WHERE p.filial_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM public.filiais f WHERE f.id = p.filial_id);
END;
$$;