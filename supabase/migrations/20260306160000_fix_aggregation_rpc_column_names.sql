-- Fix: renomear coluna "count" → "row_count" nas funções de agregação.
-- "count" é palavra reservada do PostgREST (parâmetro especial de contagem de linhas)
-- e causa hanging indefinido nas chamadas via supabase-js.

-- Dropar versões com nome de coluna conflitante
DROP FUNCTION IF EXISTS public.get_sales_breakdown(timestamptz, timestamptz, uuid, text, text, text[]);
DROP FUNCTION IF EXISTS public.get_task_type_counts(timestamptz, timestamptz, uuid, text, text, text[]);
DROP FUNCTION IF EXISTS public.get_prospects_aggregate(timestamptz, timestamptz, uuid, text, text, text[]);

-- ============================================================
-- get_sales_breakdown
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_sales_breakdown(
  p_start_date      timestamptz DEFAULT NULL,
  p_end_date        timestamptz DEFAULT NULL,
  p_created_by      uuid        DEFAULT NULL,
  p_filial          text        DEFAULT NULL,
  p_filial_atendida text        DEFAULT NULL,
  p_task_types      text[]      DEFAULT NULL
)
RETURNS TABLE (
  sales_type          text,
  row_count           bigint,
  total_value         numeric,
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
    AND (p_start_date      IS NULL OR t.created_at       >= p_start_date)
    AND (p_end_date        IS NULL OR t.created_at       <= p_end_date)
    AND (p_created_by      IS NULL OR t.created_by        = p_created_by)
    AND (p_filial          IS NULL OR t.filial             = p_filial)
    AND (p_filial_atendida IS NULL OR t.filial_atendida   = p_filial_atendida)
    AND (p_task_types      IS NULL OR t.task_type         = ANY(p_task_types))
  GROUP BY t.sales_type;
END;
$$;

-- ============================================================
-- get_task_type_counts
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_task_type_counts(
  p_start_date      timestamptz DEFAULT NULL,
  p_end_date        timestamptz DEFAULT NULL,
  p_created_by      uuid        DEFAULT NULL,
  p_filial          text        DEFAULT NULL,
  p_filial_atendida text        DEFAULT NULL,
  p_task_types      text[]      DEFAULT NULL
)
RETURNS TABLE (
  task_type text,
  row_count bigint
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
  WHERE (p_start_date      IS NULL OR t.created_at       >= p_start_date)
    AND (p_end_date        IS NULL OR t.created_at       <= p_end_date)
    AND (p_created_by      IS NULL OR t.created_by        = p_created_by)
    AND (p_filial          IS NULL OR t.filial             = p_filial)
    AND (p_filial_atendida IS NULL OR t.filial_atendida   = p_filial_atendida)
    AND (p_task_types      IS NULL OR t.task_type         = ANY(p_task_types))
  GROUP BY t.task_type;
END;
$$;

-- ============================================================
-- get_prospects_aggregate
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
  row_count   bigint,
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
    AND (p_start_date      IS NULL OR t.created_at       >= p_start_date)
    AND (p_end_date        IS NULL OR t.created_at       <= p_end_date)
    AND (p_created_by      IS NULL OR t.created_by        = p_created_by)
    AND (p_filial          IS NULL OR t.filial             = p_filial)
    AND (p_filial_atendida IS NULL OR t.filial_atendida   = p_filial_atendida)
    AND (p_task_types      IS NULL OR t.task_type         = ANY(p_task_types));
END;
$$;
