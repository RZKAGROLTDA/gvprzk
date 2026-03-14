-- RPC: Agregação de performance por filial (evita fetch de 2000 tasks)
-- Usado por PerformanceByFilial.tsx

CREATE OR REPLACE FUNCTION public.get_performance_by_filial(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  filial_id uuid,
  filial_nome text,
  visitas bigint,
  checklist bigint,
  ligacoes bigint,
  prospects bigint,
  prospects_value numeric,
  sales_value numeric,
  conversion_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH filial_users AS (
    SELECT f.id AS filial_id, f.nome AS filial_nome, p.user_id
    FROM filiais f
    JOIN profiles p ON p.filial_id = f.id
  ),
  task_stats AS (
    SELECT
      fu.filial_id,
      fu.filial_nome,
      COUNT(*) FILTER (WHERE t.task_type IN ('prospection', 'visita'))::bigint AS visitas,
      COUNT(*) FILTER (WHERE t.task_type = 'checklist')::bigint AS checklist,
      COUNT(*) FILTER (WHERE t.task_type = 'ligacao')::bigint AS ligacoes,
      COUNT(*) FILTER (WHERE t.is_prospect = true)::bigint AS prospects,
      COALESCE(SUM(t.sales_value) FILTER (WHERE t.is_prospect = true), 0)::numeric AS prospects_value,
      COALESCE(SUM(t.sales_value) FILTER (WHERE t.sales_confirmed = true), 0)::numeric AS sales_value
    FROM tasks t
    JOIN filial_users fu ON fu.user_id = t.created_by
    WHERE (p_date_from IS NULL OR t.start_date >= p_date_from)
      AND (p_date_to IS NULL OR t.end_date <= p_date_to)
    GROUP BY fu.filial_id, fu.filial_nome
  )
  SELECT
    f.id AS filial_id,
    f.nome AS filial_nome,
    COALESCE(ts.visitas, 0)::bigint,
    COALESCE(ts.checklist, 0)::bigint,
    COALESCE(ts.ligacoes, 0)::bigint,
    COALESCE(ts.prospects, 0)::bigint,
    COALESCE(ts.prospects_value, 0)::numeric,
    COALESCE(ts.sales_value, 0)::numeric,
    CASE WHEN COALESCE(ts.prospects_value, 0) > 0
      THEN ROUND((COALESCE(ts.sales_value, 0) / ts.prospects_value * 100)::numeric, 2)
      ELSE 0::numeric
    END
  FROM filiais f
  LEFT JOIN task_stats ts ON ts.filial_id = f.id
  ORDER BY f.nome;
END;
$$;

REVOKE ALL ON FUNCTION public.get_performance_by_filial(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_performance_by_filial(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_performance_by_filial(date, date) TO service_role;
