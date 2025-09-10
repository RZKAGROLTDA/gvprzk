-- Atualizar o item para venda total (qtd_vendida = qtd_ofertada)
UPDATE opportunity_items 
SET 
  qtd_vendida = qtd_ofertada,
  subtotal_vendido = qtd_ofertada * preco_unit,
  updated_at = now()
WHERE opportunity_id = '3f69fb9b-02c2-4644-a857-2e401bff004f';

-- Atualizar o valor_venda_fechada baseado nos items atualizados
UPDATE opportunities 
SET 
  valor_venda_fechada = (
    SELECT COALESCE(SUM(subtotal_vendido), 0) 
    FROM opportunity_items 
    WHERE opportunity_id = '3f69fb9b-02c2-4644-a857-2e401bff004f'
  ),
  updated_at = now()
WHERE id = '3f69fb9b-02c2-4644-a857-2e401bff004f';