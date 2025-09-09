-- Corrigir migração para garantir que todos os products sejam transferidos para opportunity_items
-- Primeiro, criar opportunities para tasks que têm products mas não têm opportunity

INSERT INTO opportunities (
  task_id,
  cliente_nome,
  filial,
  status,
  valor_total_oportunidade,
  valor_venda_fechada
)
SELECT DISTINCT
  t.id as task_id,
  t.client as cliente_nome,
  COALESCE(t.filial, 'N/A') as filial,
  CASE 
    WHEN t.sales_type = 'ganho' THEN 'Venda Total'
    WHEN t.sales_type = 'parcial' THEN 'Venda Parcial'
    WHEN t.sales_type = 'perdido' THEN 'Perdido'
    WHEN t.is_prospect = true THEN 'Prospect'
    ELSE 'Prospect'
  END as status,
  COALESCE(t.sales_value, 0) as valor_total_oportunidade,
  CASE 
    WHEN t.sales_type IN ('ganho', 'parcial') AND t.sales_confirmed = true 
    THEN COALESCE(t.sales_value, 0)
    ELSE 0
  END as valor_venda_fechada
FROM tasks t
WHERE EXISTS (
  SELECT 1 FROM products p WHERE p.task_id = t.id AND p.selected = true
)
AND NOT EXISTS (
  SELECT 1 FROM opportunities o WHERE o.task_id = t.id
);

-- Agora migrar todos os products selecionados para opportunity_items
INSERT INTO opportunity_items (
  opportunity_id,
  produto,
  sku,
  qtd_ofertada,
  qtd_vendida,
  preco_unit,
  subtotal_ofertado,
  subtotal_vendido
)
SELECT 
  o.id as opportunity_id,
  p.name as produto,
  COALESCE(p.category, 'N/A') as sku,
  COALESCE(p.quantity, 1) as qtd_ofertada,
  -- Calcular qtd_vendida baseado no status da opportunity
  CASE 
    WHEN o.status = 'Venda Total' THEN COALESCE(p.quantity, 1)
    WHEN o.status = 'Venda Parcial' THEN COALESCE(p.quantity, 1)
    ELSE 0
  END as qtd_vendida,
  COALESCE(p.price, 0) as preco_unit,
  COALESCE(p.quantity, 1) * COALESCE(p.price, 0) as subtotal_ofertado,
  -- Calcular subtotal vendido baseado no status
  CASE 
    WHEN o.status = 'Venda Total' THEN COALESCE(p.quantity, 1) * COALESCE(p.price, 0)
    WHEN o.status = 'Venda Parcial' THEN COALESCE(p.quantity, 1) * COALESCE(p.price, 0)
    ELSE 0
  END as subtotal_vendido
FROM opportunities o
JOIN tasks t ON o.task_id = t.id
JOIN products p ON t.id = p.task_id
WHERE p.selected = true
  AND NOT EXISTS (
    SELECT 1 FROM opportunity_items oi WHERE oi.opportunity_id = o.id AND oi.produto = p.name
  );