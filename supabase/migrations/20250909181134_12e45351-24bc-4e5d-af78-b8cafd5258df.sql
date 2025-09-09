-- Criar opportunities para todas as tasks que têm sales_value mas não têm opportunity
INSERT INTO opportunities (
  task_id,
  cliente_nome,
  filial,
  status,
  valor_total_oportunidade,
  valor_venda_fechada,
  data_criacao,
  data_fechamento
) 
SELECT 
  t.id,
  t.client,
  COALESCE(t.filial, 'Não informado'),
  CASE 
    WHEN t.sales_type = 'perdido' THEN 'Venda Perdida'
    WHEN t.sales_type = 'parcial' OR (t.partial_sales_value > 0 AND t.partial_sales_value < t.sales_value) THEN 'Venda Parcial'
    WHEN t.sales_type = 'ganho' AND t.sales_confirmed = true THEN 'Venda Total'
    WHEN t.sales_value > 0 THEN 'Prospect'
    ELSE 'Prospect'
  END,
  GREATEST(COALESCE(t.sales_value, 0), COALESCE(t.partial_sales_value, 0)),
  CASE 
    WHEN t.sales_type = 'ganho' AND t.sales_confirmed = true THEN t.sales_value
    WHEN t.sales_type = 'parcial' OR (t.partial_sales_value > 0 AND t.partial_sales_value < t.sales_value) THEN t.partial_sales_value
    ELSE 0
  END,
  t.created_at,
  CASE 
    WHEN t.sales_confirmed = true OR t.sales_type IN ('ganho', 'parcial') THEN t.updated_at
    ELSE NULL
  END
FROM tasks t
WHERE t.sales_value > 0
  AND NOT EXISTS (
    SELECT 1 FROM opportunities o WHERE o.task_id = t.id
  );