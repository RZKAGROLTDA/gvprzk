-- Migration: Remover funções obsoletas que causam IO desnecessário
--
-- get_secure_tasks_with_customer_protection:
--   - SECURITY DEFINER wrapper que chama get_secure_tasks_paginated(500, 0)
--   - Hardcoded em 500 linhas sem nenhum filtro — carrega o dataset completo de uma vez
--   - Nenhum componente ativo a chama; substituída por get_secure_tasks_paginated_filtered
--
-- get_reports_aggregated_stats:
--   - Substituída por get_sales_breakdown + get_task_type_counts + get_prospects_aggregate
--   - Tinha timeout de 120s (sintoma de subqueries encadeadas sem índice)
--   - Não suportava filtro por filial_atendida
--   - Não é mais chamada por nenhum componente após a migração de Reports.tsx e useConsolidatedSalesMetrics

DROP FUNCTION IF EXISTS public.get_secure_tasks_with_customer_protection();

DROP FUNCTION IF EXISTS public.get_reports_aggregated_stats(
  p_start_date date,
  p_end_date   date,
  p_user_id    uuid,
  p_filial     text
);

-- Versões alternativas com tipos diferentes que possam ter sido criadas
DROP FUNCTION IF EXISTS public.get_reports_aggregated_stats(text, text, uuid, text);
DROP FUNCTION IF EXISTS public.get_reports_aggregated_stats(timestamptz, timestamptz, uuid, text);
