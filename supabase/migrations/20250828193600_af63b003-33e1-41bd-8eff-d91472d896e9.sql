-- Correção da migração - usar nomes corretos das colunas

-- 1. Criar tabela tasks simplificada
CREATE TABLE public.tasks_new (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('Ligação', 'Visita', 'Checklist')),
  vendedor_id UUID NOT NULL,
  cliente_nome TEXT NOT NULL,
  cliente_email TEXT,
  filial TEXT NOT NULL,
  data DATE NOT NULL,
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Criar tabela opportunities
CREATE TABLE public.opportunities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks_new(id) ON DELETE CASCADE,
  cliente_nome TEXT NOT NULL,
  filial TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Prospect' CHECK (status IN ('Prospect', 'Venda Total', 'Venda Parcial', 'Venda Perdida')),
  valor_total_oportunidade NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_venda_fechada NUMERIC(12,2) NOT NULL DEFAULT 0,
  data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  data_fechamento TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Criar tabela opportunity_items
CREATE TABLE public.opportunity_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  produto TEXT NOT NULL,
  sku TEXT,
  preco_unit NUMERIC(10,2) NOT NULL,
  qtd_ofertada NUMERIC(10,2) NOT NULL,
  qtd_vendida NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal_ofertado NUMERIC(12,2) GENERATED ALWAYS AS (preco_unit * qtd_ofertada) STORED,
  subtotal_vendido NUMERIC(12,2) GENERATED ALWAYS AS (preco_unit * qtd_vendida) STORED,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT check_qtd_vendida_valid CHECK (qtd_vendida >= 0 AND qtd_vendida <= qtd_ofertada)
);

-- 4. Migrar dados da tabela tasks existente
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
WHERE client IS NOT NULL AND filial IS NOT NULL;

-- 5. Migrar oportunidades da tabela tasks (usando nomes corretos das colunas)
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

-- 6. Migrar produtos/itens das oportunidades
INSERT INTO public.opportunity_items (
  opportunity_id, produto, sku, preco_unit, qtd_ofertada, qtd_vendida
)
SELECT 
  o.id as opportunity_id,
  p.name as produto,
  p.category as sku,
  COALESCE(p.price, 0) as preco_unit,
  COALESCE(p.quantity, 1) as qtd_ofertada,
  CASE 
    WHEN o.status = 'Venda Total' THEN COALESCE(p.quantity, 1)
    WHEN o.status = 'Venda Parcial' AND p.selected = true THEN COALESCE(p.quantity, 1)
    ELSE 0
  END as qtd_vendida
FROM public.opportunities o
JOIN public.tasks_new t ON o.task_id = t.id
JOIN public.products p ON p.task_id = t.id
WHERE p.name IS NOT NULL;

-- 7. Criar função para atualizar totais das oportunidades
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

-- 8. Criar triggers para manter totais atualizados
CREATE TRIGGER trigger_update_opportunity_totals_insert
  AFTER INSERT ON public.opportunity_items
  FOR EACH ROW EXECUTE FUNCTION public.update_opportunity_totals();

CREATE TRIGGER trigger_update_opportunity_totals_update
  AFTER UPDATE ON public.opportunity_items
  FOR EACH ROW EXECUTE FUNCTION public.update_opportunity_totals();

CREATE TRIGGER trigger_update_opportunity_totals_delete
  AFTER DELETE ON public.opportunity_items
  FOR EACH ROW EXECUTE FUNCTION public.update_opportunity_totals();

-- 9. Criar função para gerenciar fechamento de oportunidades
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

-- 10. Criar trigger para gerenciar fechamento
CREATE TRIGGER trigger_manage_opportunity_closure
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.manage_opportunity_closure();

-- 11. Criar view para KPIs
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

-- 12. Habilitar RLS nas novas tabelas
ALTER TABLE public.tasks_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_items ENABLE ROW LEVEL SECURITY;

-- 13. Criar políticas RLS
CREATE POLICY "Tasks: Consultant can view own tasks" ON public.tasks_new
  FOR SELECT USING (
    vendedor_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')
  );

CREATE POLICY "Tasks: Consultant can create own tasks" ON public.tasks_new
  FOR INSERT WITH CHECK (vendedor_id = auth.uid());

CREATE POLICY "Tasks: Consultant can update own tasks" ON public.tasks_new
  FOR UPDATE USING (
    vendedor_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')
  );

CREATE POLICY "Opportunities: Access based on task ownership" ON public.opportunities
  FOR SELECT USING (
    task_id IN (
      SELECT id FROM public.tasks_new 
      WHERE vendedor_id = auth.uid() OR
      EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')
    )
  );

CREATE POLICY "Opportunities: Insert based on task ownership" ON public.opportunities
  FOR INSERT WITH CHECK (
    task_id IN (SELECT id FROM public.tasks_new WHERE vendedor_id = auth.uid())
  );

CREATE POLICY "Opportunities: Update with restrictions" ON public.opportunities
  FOR UPDATE USING (
    (task_id IN (SELECT id FROM public.tasks_new WHERE vendedor_id = auth.uid()) 
     AND NOT (OLD.status IN ('Venda Total', 'Venda Perdida') AND NEW.status = 'Prospect'))
    OR
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')
  );

CREATE POLICY "Opportunity Items: Access based on opportunity" ON public.opportunity_items
  FOR ALL USING (
    opportunity_id IN (
      SELECT o.id FROM public.opportunities o
      JOIN public.tasks_new t ON o.task_id = t.id
      WHERE t.vendedor_id = auth.uid() OR
      EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')
    )
  );