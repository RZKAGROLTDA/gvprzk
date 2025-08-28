-- Etapa 2: Criar funções e triggers, depois migrar dados

-- 1. Criar função para atualizar totais das oportunidades
CREATE OR REPLACE FUNCTION public.update_opportunity_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.opportunities 
  SET 
    valor_total_oportunidade = (
      SELECT COALESCE(SUM(subtotal_ofertado), 0)
      FROM public.opportunity_items 
      WHERE opportunity_id = COALESCE(NEW.opportunity_id, OLD.opportunity_id)
    ),
    valor_venda_fechada = (
      SELECT COALESCE(SUM(subtotal_vendido), 0)
      FROM public.opportunity_items 
      WHERE opportunity_id = COALESCE(NEW.opportunity_id, OLD.opportunity_id)
    ),
    updated_at = now()
  WHERE id = COALESCE(NEW.opportunity_id, OLD.opportunity_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 2. Criar triggers para manter totais atualizados
CREATE TRIGGER trigger_update_opportunity_totals_insert
  AFTER INSERT ON public.opportunity_items
  FOR EACH ROW EXECUTE FUNCTION public.update_opportunity_totals();

CREATE TRIGGER trigger_update_opportunity_totals_update
  AFTER UPDATE ON public.opportunity_items
  FOR EACH ROW EXECUTE FUNCTION public.update_opportunity_totals();

CREATE TRIGGER trigger_update_opportunity_totals_delete
  AFTER DELETE ON public.opportunity_items
  FOR EACH ROW EXECUTE FUNCTION public.update_opportunity_totals();

-- 3. Criar função para gerenciar fechamento de oportunidades
CREATE OR REPLACE FUNCTION public.manage_opportunity_closure()
RETURNS TRIGGER AS $$
BEGIN
  -- Se mudou para status de fechamento e não tinha data_fechamento
  IF NEW.status IN ('Venda Total', 'Venda Parcial', 'Venda Perdida') 
     AND OLD.status = 'Prospect' 
     AND NEW.data_fechamento IS NULL THEN
    NEW.data_fechamento = now();
  END IF;
  
  -- Se voltou para Prospect, limpar data_fechamento
  IF NEW.status = 'Prospect' AND OLD.status != 'Prospect' THEN
    NEW.data_fechamento = NULL;
  END IF;
  
  -- Ajustar qtd_vendida baseado no status
  IF NEW.status != OLD.status THEN
    IF NEW.status = 'Venda Total' THEN
      UPDATE public.opportunity_items 
      SET qtd_vendida = qtd_ofertada 
      WHERE opportunity_id = NEW.id;
    ELSIF NEW.status = 'Venda Perdida' THEN
      UPDATE public.opportunity_items 
      SET qtd_vendida = 0 
      WHERE opportunity_id = NEW.id;
    END IF;
  END IF;
  
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Criar trigger para gerenciar fechamento
CREATE TRIGGER trigger_manage_opportunity_closure
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.manage_opportunity_closure();

-- 5. Criar view para KPIs
CREATE OR REPLACE VIEW public.vw_oportunidades_kpis AS
SELECT 
  o.id,
  o.filial,
  o.cliente_nome,
  o.status,
  o.valor_total_oportunidade,
  o.valor_venda_fechada,
  CASE 
    WHEN o.valor_total_oportunidade > 0 THEN 
      ROUND((o.valor_venda_fechada / o.valor_total_oportunidade * 100), 2)
    ELSE 0
  END as conversao_pct,
  o.data_criacao,
  o.data_fechamento,
  t.vendedor_id,
  t.tipo as tipo_task
FROM public.opportunities o
JOIN public.tasks_new t ON o.task_id = t.id;

-- 6. Migrar dados da tabela tasks existente
INSERT INTO public.tasks_new (
  id, tipo, vendedor_id, cliente_nome, cliente_email, filial, data, notas, created_at, updated_at
)
SELECT 
  id,
  CASE 
    WHEN task_type = 'call' THEN 'Ligação'
    WHEN task_type = 'field_visit' THEN 'Visita'
    WHEN task_type = 'workshop_checklist' THEN 'Checklist'
    ELSE 'Ligação'
  END as tipo,
  created_by as vendedor_id,
  client as cliente_nome,
  email as cliente_email,
  filial,
  start_date as data,
  COALESCE(observations, prospect_notes) as notas,
  created_at,
  updated_at
FROM public.tasks
WHERE client IS NOT NULL AND filial IS NOT NULL AND start_date IS NOT NULL;

-- 7. Migrar oportunidades da tabela tasks
INSERT INTO public.opportunities (
  id, task_id, cliente_nome, filial, status, valor_total_oportunidade, valor_venda_fechada, 
  data_criacao, data_fechamento, created_at, updated_at
)
SELECT 
  gen_random_uuid() as id,
  t.id as task_id,
  t.cliente_nome,
  t.filial,
  CASE 
    WHEN old_t.is_prospect = true AND old_t.sales_confirmed IS NULL THEN 'Prospect'
    WHEN old_t.sales_confirmed = true AND old_t.sales_type = 'ganho' THEN 'Venda Total'
    WHEN old_t.sales_confirmed = true AND old_t.sales_type = 'parcial' THEN 'Venda Parcial'
    WHEN old_t.sales_confirmed = false OR old_t.sales_type = 'perdido' THEN 'Venda Perdida'
    ELSE 'Prospect'
  END as status,
  COALESCE(old_t.sales_value, 0) as valor_total_oportunidade,
  CASE 
    WHEN old_t.sales_confirmed = true AND old_t.sales_type = 'ganho' THEN COALESCE(old_t.sales_value, 0)
    WHEN old_t.sales_confirmed = true AND old_t.sales_type = 'parcial' THEN COALESCE(old_t.sales_value, 0)
    ELSE 0
  END as valor_venda_fechada,
  old_t.created_at as data_criacao,
  CASE 
    WHEN old_t.sales_confirmed IS NOT NULL THEN old_t.updated_at
    ELSE NULL
  END as data_fechamento,
  old_t.created_at,
  old_t.updated_at
FROM public.tasks_new t
JOIN public.tasks old_t ON t.id = old_t.id;