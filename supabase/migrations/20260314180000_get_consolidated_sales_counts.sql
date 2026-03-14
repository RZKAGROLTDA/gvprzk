-- RPC: Métricas consolidadas em 1 query (substitui 6+ queries do useConsolidatedSalesMetrics)
-- Reduz Disk I/O no carregamento do dashboard

CREATE OR REPLACE FUNCTION public.get_consolidated_sales_counts(
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_filial text DEFAULT NULL,
  p_filial_atendida text DEFAULT NULL,
  p_task_types text[] DEFAULT NULL
)
RETURNS TABLE (
  visitas_count bigint,
  ligacoes_count bigint,
  checklists_count bigint,
  prospects_count bigint,
  prospects_value numeric,
  vendas_ganhas_count bigint,
  vendas_ganhas_value numeric,
  vendas_parciais_count bigint,
  vendas_parciais_value numeric,
  vendas_perdidas_count bigint,
  vendas_perdidas_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_user_filial_id uuid;
  v_is_approved boolean;
  v_base_query text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;

  SELECT p.role, p.filial_id, (p.approval_status = 'approved')
  INTO v_user_role, v_user_filial_id, v_is_approved
  FROM profiles p WHERE p.user_id = v_user_id;

  IF NOT COALESCE(v_is_approved, false) THEN RETURN; END IF;

  -- Uma única passagem na tabela tasks com todos os filtros e agregações
  RETURN QUERY
  WITH filtered AS (
    SELECT t.task_type, t.is_prospect, t.sales_confirmed, t.sales_type, t.sales_value, t.partial_sales_value
    FROM tasks t
    WHERE
      -- Filtro de acesso (igual get_secure_tasks_paginated)
      (v_user_role IN ('admin', 'manager') OR t.created_by = v_user_id)
      AND (p_start_date IS NULL OR t.created_at >= p_start_date)
      AND (p_end_date IS NULL OR t.created_at <= p_end_date)
      AND (p_created_by IS NULL OR t.created_by = p_created_by)
      AND (p_filial IS NULL OR t.filial = p_filial)
      AND (p_filial_atendida IS NULL OR t.filial_atendida = p_filial_atendida)
      AND (p_task_types IS NULL OR t.task_type = ANY(p_task_types))
  )
  SELECT
    COUNT(*) FILTER (WHERE task_type IN ('prospection', 'visita'))::bigint,
    COUNT(*) FILTER (WHERE task_type = 'ligacao')::bigint,
    COUNT(*) FILTER (WHERE task_type = 'checklist')::bigint,
    COUNT(*) FILTER (WHERE is_prospect = true)::bigint,
    COALESCE(SUM(sales_value) FILTER (WHERE is_prospect = true), 0)::numeric,
    COUNT(*) FILTER (WHERE sales_confirmed = true AND sales_type = 'ganho')::bigint,
    COALESCE(SUM(sales_value) FILTER (WHERE sales_confirmed = true AND sales_type = 'ganho'), 0)::numeric,
    COUNT(*) FILTER (WHERE sales_confirmed = true AND sales_type = 'parcial')::bigint,
    COALESCE(SUM(partial_sales_value) FILTER (WHERE sales_confirmed = true AND sales_type = 'parcial'), 0)::numeric,
    COUNT(*) FILTER (WHERE sales_confirmed = true AND sales_type = 'perdido')::bigint,
    COALESCE(SUM(sales_value) FILTER (WHERE sales_confirmed = true AND sales_type = 'perdido'), 0)::numeric
  FROM filtered;
END;
$$;

REVOKE ALL ON FUNCTION public.get_consolidated_sales_counts(timestamptz, timestamptz, uuid, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_consolidated_sales_counts(timestamptz, timestamptz, uuid, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_consolidated_sales_counts(timestamptz, timestamptz, uuid, text, text, text[]) TO service_role;
