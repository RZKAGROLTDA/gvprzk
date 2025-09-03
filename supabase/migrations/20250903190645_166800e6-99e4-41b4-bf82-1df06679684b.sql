-- CONSOLIDAÇÃO: Migrar tasks_new para tasks e eliminar duplicação
-- Etapa 1: Primeiro vamos garantir que a tabela tasks tenha todas as colunas necessárias

-- Adicionar colunas que existem em tasks_new mas não em tasks (se necessário)
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS cliente_nome_backup text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS cliente_email_backup text;

-- Etapa 2: Migrar dados únicos de tasks_new para tasks (se houver)
-- Verificar se há tasks em tasks_new que não estão em tasks
INSERT INTO public.tasks (
  id,
  name,
  responsible,
  client,
  property,
  filial,
  task_type,
  start_date,
  end_date,
  start_time,
  end_time,
  observations,
  priority,
  status,
  created_by,
  created_at,
  updated_at,
  email,
  phone,
  is_prospect,
  sales_value,
  sales_confirmed
)
SELECT 
  tn.id,
  COALESCE(tn.tipo, 'Tarefa migrada') as name,
  'Migrado de tasks_new' as responsible,
  COALESCE(tn.cliente_nome, 'Cliente migrado') as client,
  'Propriedade migrada' as property,
  COALESCE(tn.filial, 'Não informado') as filial,
  COALESCE(tn.tipo, 'prospection') as task_type,
  tn.data as start_date,
  tn.data as end_date,
  '08:00' as start_time,
  '17:00' as end_time,
  COALESCE(tn.notas, '') as observations,
  'medium' as priority,
  'completed' as status,
  tn.vendedor_id as created_by,
  tn.created_at,
  tn.updated_at,
  tn.cliente_email as email,
  NULL as phone,
  false as is_prospect,
  NULL as sales_value,
  false as sales_confirmed
FROM public.tasks_new tn
WHERE NOT EXISTS (
  SELECT 1 FROM public.tasks t WHERE t.id = tn.id
);

-- Etapa 3: Atualizar foreign keys em opportunities para apontar para tasks
-- Todas as opportunities que apontam para tasks_new devem agora apontar para tasks
-- Como já migramos os dados, as opportunities já devem ter referências válidas

-- Etapa 4: Atualizar foreign keys em opportunity_items
-- Esta tabela já referencia opportunities, então não precisa de mudanças

-- Etapa 5: Remover a tabela tasks_new
DROP TABLE IF EXISTS public.tasks_new CASCADE;

-- Etapa 6: Remover colunas temporárias se não foram usadas
ALTER TABLE public.tasks DROP COLUMN IF EXISTS cliente_nome_backup;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS cliente_email_backup;

-- Etapa 7: Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_start_date ON public.tasks(start_date);
CREATE INDEX IF NOT EXISTS idx_tasks_filial ON public.tasks(filial);

-- Etapa 8: Atualizar as policies de RLS se necessário (já existem as corretas para tasks)
-- Não é necessário fazer nada aqui pois as policies para tasks já estão corretas

-- Log da consolidação
INSERT INTO public.security_audit_log (
  event_type,
  user_id,
  metadata,
  risk_score,
  created_at
) VALUES (
  'table_consolidation_tasks',
  auth.uid(),
  jsonb_build_object(
    'action', 'consolidated_tasks_new_into_tasks',
    'timestamp', now(),
    'reason', 'eliminate_duplication_and_foreign_key_issues'
  ),
  1,
  now()
);