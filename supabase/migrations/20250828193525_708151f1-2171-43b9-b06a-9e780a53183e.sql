-- Etapa 1: Criar as novas tabelas sem migração de dados primeiro

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

-- 4. Habilitar RLS nas novas tabelas
ALTER TABLE public.tasks_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_items ENABLE ROW LEVEL SECURITY;

-- 5. Criar políticas RLS para tasks_new
CREATE POLICY "Tasks new: Consultant can view own tasks" ON public.tasks_new
  FOR SELECT USING (
    vendedor_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')
  );

CREATE POLICY "Tasks new: Consultant can create own tasks" ON public.tasks_new
  FOR INSERT WITH CHECK (vendedor_id = auth.uid());

CREATE POLICY "Tasks new: Consultant can update own tasks" ON public.tasks_new
  FOR UPDATE USING (
    vendedor_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')
  );

CREATE POLICY "Tasks new: Consultant can delete own tasks" ON public.tasks_new
  FOR DELETE USING (
    vendedor_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')
  );

-- 6. Criar políticas RLS para opportunities
CREATE POLICY "Opportunities: Access based on task ownership" ON public.opportunities
  FOR SELECT USING (
    task_id IN (
      SELECT id FROM public.tasks_new 
      WHERE vendedor_id = auth.uid()
    ) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')
  );

CREATE POLICY "Opportunities: Insert based on task ownership" ON public.opportunities
  FOR INSERT WITH CHECK (
    task_id IN (SELECT id FROM public.tasks_new WHERE vendedor_id = auth.uid())
  );

CREATE POLICY "Opportunities: Update based on ownership" ON public.opportunities
  FOR UPDATE USING (
    task_id IN (
      SELECT id FROM public.tasks_new 
      WHERE vendedor_id = auth.uid()
    ) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')
  );

CREATE POLICY "Opportunities: Delete based on ownership" ON public.opportunities
  FOR DELETE USING (
    task_id IN (
      SELECT id FROM public.tasks_new 
      WHERE vendedor_id = auth.uid()
    ) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')
  );

-- 7. Criar políticas RLS para opportunity_items
CREATE POLICY "Opportunity Items: Access based on opportunity" ON public.opportunity_items
  FOR SELECT USING (
    opportunity_id IN (
      SELECT o.id FROM public.opportunities o
      JOIN public.tasks_new t ON o.task_id = t.id
      WHERE t.vendedor_id = auth.uid() OR
      EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')
    )
  );

CREATE POLICY "Opportunity Items: Manage based on opportunity" ON public.opportunity_items
  FOR ALL USING (
    opportunity_id IN (
      SELECT o.id FROM public.opportunities o
      JOIN public.tasks_new t ON o.task_id = t.id
      WHERE t.vendedor_id = auth.uid() OR
      EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')
    )
  );