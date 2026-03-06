-- Migration: RPCs de agregação para substituir client-side aggregation em
-- useConsolidatedSalesMetrics. Retornam apenas linhas agrupadas (GROUP BY),
-- eliminando a necessidade de buscar todos os registros brutos e agregar em JS.

-- ============================================================
-- get_sales_breakdown: agrega vendas confirmadas por tipo
-- Substitui: salesQuery (.select + .limit(5000) + JS reduce)
-- Retorna: 1 linha por sales_type (ganho/parcial/perdido) — máximo 3 linhas
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_sales_breakdown(
  p_start_date  timestamptz DEFAULT NULL,
  p_end_date    timestamptz DEFAULT NULL,
  p_created_by  uuid        DEFAULT NULL,
  p_filial      text        DEFAULT NULL,
  p_filial_atendida text    DEFAULT NULL,
  p_task_types  text[]      DEFAULT NULL
)
RETURNS TABLE (
  sales_type         text,
  count              bigint,
  total_value        numeric,
  total_partial_value numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.sales_type,
    COUNT(*)::bigint,
    COALESCE(SUM(t.sales_value), 0)::numeric,
    COALESCE(SUM(t.partial_sales_value), 0)::numeric
  FROM public.tasks t
  WHERE t.sales_confirmed = true
    AND (p_start_date    IS NULL OR t.created_at  >= p_start_date)
    AND (p_end_date      IS NULL OR t.created_at  <= p_end_date)
    AND (p_created_by    IS NULL OR t.created_by   = p_created_by)
    AND (p_filial        IS NULL OR t.filial        = p_filial)
    AND (p_filial_atendida IS NULL OR t.filial_atendida = p_filial_atendida)
    AND (p_task_types    IS NULL OR t.task_type    = ANY(p_task_types))
  GROUP BY t.sales_type;
END;
$$;

-- ============================================================
-- get_task_type_counts: conta tasks por tipo com filtros opcionais
-- Substitui: countQuery (.select('task_type') + .limit(5000) + JS reduce)
-- Retorna: 1 linha por task_type — máximo ~10 linhas
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_task_type_counts(
  p_start_date  timestamptz DEFAULT NULL,
  p_end_date    timestamptz DEFAULT NULL,
  p_created_by  uuid        DEFAULT NULL,
  p_filial      text        DEFAULT NULL,
  p_filial_atendida text    DEFAULT NULL,
  p_task_types  text[]      DEFAULT NULL
)
RETURNS TABLE (
  task_type text,
  count     bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.task_type,
    COUNT(*)::bigint
  FROM public.tasks t
  WHERE (p_start_date    IS NULL OR t.created_at  >= p_start_date)
    AND (p_end_date      IS NULL OR t.created_at  <= p_end_date)
    AND (p_created_by    IS NULL OR t.created_by   = p_created_by)
    AND (p_filial        IS NULL OR t.filial        = p_filial)
    AND (p_filial_atendida IS NULL OR t.filial_atendida = p_filial_atendida)
    AND (p_task_types    IS NULL OR t.task_type    = ANY(p_task_types))
  GROUP BY t.task_type;
END;
$$;

-- ============================================================
-- get_prospects_aggregate: agrega prospects com filtros opcionais
-- Substitui: prospectsQuery (.select('id, sales_value') + JS reduce)
-- Retorna: 1 única linha com count + soma de valores
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_prospects_aggregate(
  p_start_date      timestamptz DEFAULT NULL,
  p_end_date        timestamptz DEFAULT NULL,
  p_created_by      uuid        DEFAULT NULL,
  p_filial          text        DEFAULT NULL,
  p_filial_atendida text        DEFAULT NULL,
  p_task_types      text[]      DEFAULT NULL
)
RETURNS TABLE (
  count       bigint,
  total_value numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(t.sales_value), 0)::numeric
  FROM public.tasks t
  WHERE t.is_prospect = true
    AND (p_start_date    IS NULL OR t.created_at  >= p_start_date)
    AND (p_end_date      IS NULL OR t.created_at  <= p_end_date)
    AND (p_created_by    IS NULL OR t.created_by   = p_created_by)
    AND (p_filial        IS NULL OR t.filial        = p_filial)
    AND (p_filial_atendida IS NULL OR t.filial_atendida = p_filial_atendida)
    AND (p_task_types    IS NULL OR t.task_type    = ANY(p_task_types));
END;
$$;
