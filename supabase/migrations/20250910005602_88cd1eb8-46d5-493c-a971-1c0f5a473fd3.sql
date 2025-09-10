-- Atualizar somente qtd_vendida para venda total
-- As colunas subtotal_vendido e subtotal_ofertado são calculadas automaticamente
UPDATE opportunity_items 
SET 
  qtd_vendida = qtd_ofertada,
  updated_at = now()
WHERE opportunity_id = '3f69fb9b-02c2-4644-a857-2e401bff004f';

-- Criar trigger para atualizar valor_venda_fechada automaticamente
CREATE OR REPLACE FUNCTION update_opportunity_valor_venda_fechada()
RETURNS TRIGGER AS $$
BEGIN
  -- Atualizar o valor_venda_fechada baseado na soma dos subtotais vendidos
  UPDATE opportunities 
  SET 
    valor_venda_fechada = (
      SELECT COALESCE(SUM(subtotal_vendido), 0) 
      FROM opportunity_items 
      WHERE opportunity_id = COALESCE(NEW.opportunity_id, OLD.opportunity_id)
    ),
    updated_at = now()
  WHERE id = COALESCE(NEW.opportunity_id, OLD.opportunity_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Criar triggers para atualizar automaticamente
DROP TRIGGER IF EXISTS trigger_update_opportunity_valor_venda_fechada_insert ON opportunity_items;
DROP TRIGGER IF EXISTS trigger_update_opportunity_valor_venda_fechada_update ON opportunity_items;
DROP TRIGGER IF EXISTS trigger_update_opportunity_valor_venda_fechada_delete ON opportunity_items;

CREATE TRIGGER trigger_update_opportunity_valor_venda_fechada_insert
  AFTER INSERT ON opportunity_items
  FOR EACH ROW
  EXECUTE FUNCTION update_opportunity_valor_venda_fechada();

CREATE TRIGGER trigger_update_opportunity_valor_venda_fechada_update
  AFTER UPDATE ON opportunity_items
  FOR EACH ROW
  EXECUTE FUNCTION update_opportunity_valor_venda_fechada();

CREATE TRIGGER trigger_update_opportunity_valor_venda_fechada_delete
  AFTER DELETE ON opportunity_items
  FOR EACH ROW
  EXECUTE FUNCTION update_opportunity_valor_venda_fechada();