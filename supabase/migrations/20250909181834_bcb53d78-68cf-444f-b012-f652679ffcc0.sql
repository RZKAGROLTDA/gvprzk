-- Migrar produtos das tasks para opportunity_items das opportunities correspondentes
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
  'N/A' as sku,
  COALESCE(p.quantity, 1) as qtd_ofertada,
  -- Se é Venda Total, qtd_vendida = qtd_ofertada, senão 0
  CASE 
    WHEN o.status = 'Venda Total' THEN COALESCE(p.quantity, 1)
    WHEN o.status = 'Venda Parcial' THEN COALESCE(p.quantity, 1) -- Para parcial, assumir que vendeu a quantidade toda inicialmente
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
WHERE p.selected = true  -- Só produtos selecionados
  AND NOT EXISTS (
    SELECT 1 FROM opportunity_items oi WHERE oi.opportunity_id = o.id
  );