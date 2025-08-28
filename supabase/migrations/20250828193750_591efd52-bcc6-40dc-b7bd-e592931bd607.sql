-- Apenas migração de dados e criação da view final

-- 1. Migrar produtos/itens das oportunidades (se não existirem)
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
WHERE p.name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.opportunity_items oi 
    WHERE oi.opportunity_id = o.id AND oi.produto = p.name
  );

-- 2. Função para buscar opportunities com tasks
CREATE OR REPLACE FUNCTION public.get_opportunities_with_tasks()
RETURNS TABLE(
  opportunity_id UUID,
  task_id UUID,
  tipo TEXT,
  vendedor_id UUID,
  cliente_nome TEXT,
  cliente_email TEXT,
  filial TEXT,
  data DATE,
  notas TEXT,
  status TEXT,
  valor_total_oportunidade NUMERIC,
  valor_venda_fechada NUMERIC,
  conversao_pct NUMERIC,
  data_criacao TIMESTAMPTZ,
  data_fechamento TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) 
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    o.id as opportunity_id,
    t.id as task_id,
    t.tipo,
    t.vendedor_id,
    t.cliente_nome,
    t.cliente_email,
    t.filial,
    t.data,
    t.notas,
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
    o.created_at,
    o.updated_at
  FROM public.opportunities o
  JOIN public.tasks_new t ON o.task_id = t.id
  WHERE 
    t.vendedor_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')
  ORDER BY o.created_at DESC;
$$;

-- 3. Função para buscar itens de uma oportunidade
CREATE OR REPLACE FUNCTION public.get_opportunity_items(opportunity_id_param UUID)
RETURNS TABLE(
  id UUID,
  produto TEXT,
  sku TEXT,
  preco_unit NUMERIC,
  qtd_ofertada NUMERIC,
  qtd_vendida NUMERIC,
  subtotal_ofertado NUMERIC,
  subtotal_vendido NUMERIC,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) 
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    oi.id,
    oi.produto,
    oi.sku,
    oi.preco_unit,
    oi.qtd_ofertada,
    oi.qtd_vendida,
    oi.subtotal_ofertado,
    oi.subtotal_vendido,
    oi.created_at,
    oi.updated_at
  FROM public.opportunity_items oi
  JOIN public.opportunities o ON oi.opportunity_id = o.id
  JOIN public.tasks_new t ON o.task_id = t.id
  WHERE oi.opportunity_id = opportunity_id_param
    AND (
      t.vendedor_id = auth.uid() OR
      EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'manager')
    )
  ORDER BY oi.produto;
$$;