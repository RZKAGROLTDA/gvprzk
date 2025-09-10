-- Corrigir a função com search_path seguro
CREATE OR REPLACE FUNCTION update_opportunity_valor_venda_fechada()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;