-- Migration: Reparar valor_total_oportunidade corrompido em oportunidades parciais.
--
-- Contexto: uma versão anterior do código sobrescrevia opportunity_items.qtd_ofertada
-- com qtd_vendida durante saves de venda parcial, fazendo valor_total_oportunidade
-- ficar igual a valor_venda_fechada.
--
-- Estratégia de reparo:
--   tasks.sales_value é a única coluna que NUNCA é atualizada após a criação da task
--   (useTaskEditData.ts explicitamente exclui sales_value de qualquer UPDATE).
--   Portanto tasks.sales_value = valor total original ofertado.
--
-- Condição de reparo: só atualiza quando o total da oportunidade é igual ao
-- valor da venda fechada (sinal claro de corrupção) E tasks.sales_value é maior.

UPDATE public.opportunities o
SET
  valor_total_oportunidade = t.sales_value,
  updated_at               = now()
FROM public.tasks t
WHERE t.id = o.task_id
  AND t.sales_value       > 0
  -- Corrigir apenas quando total = fechado (corrupção clássica da venda parcial)
  AND o.valor_venda_fechada > 0
  AND o.valor_total_oportunidade = o.valor_venda_fechada
  -- E o valor da task é diferente (evita tocar registros onde total = parcial é correto)
  AND t.sales_value <> o.valor_total_oportunidade;

-- Relatório: quantos registros foram reparados (visível no output do SQL Editor)
DO $$
DECLARE
  repaired_count integer;
BEGIN
  GET DIAGNOSTICS repaired_count = ROW_COUNT;
  RAISE NOTICE 'Oportunidades reparadas: %', repaired_count;
END $$;
