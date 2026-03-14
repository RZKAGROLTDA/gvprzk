-- RPC: Agregação de performance por vendedor (evita fetch de 1000 tasks)
-- Usado por PerformanceBySeller.tsx

CREATE OR REPLACE FUNCTION public.get_performance_by_seller(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  user_name text,
  user_role text,
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
  WITH approved_sellers AS (
    SELECT DISTINCT ON (p.user_id) p.user_id, p.name, ur.role
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.user_id
    WHERE p.approval_status = 'approved'
      AND ur.role IN ('consultant', 'manager', 'admin')
    ORDER BY p.user_id, p.name
  ),
  task_stats AS (
    SELECT
      t.created_by,
      COUNT(*) FILTER (WHERE t.task_type IN ('prospection', 'visita'))::bigint AS visitas,
      COUNT(*) FILTER (WHERE t.task_type = 'checklist')::bigint AS checklist,
      COUNT(*) FILTER (WHERE t.task_type = 'ligacao')::bigint AS ligacoes,
      COUNT(*) FILTER (WHERE t.is_prospect = true)::bigint AS prospects,
      COALESCE(SUM(t.sales_value) FILTER (WHERE t.is_prospect = true), 0)::numeric AS prospects_value,
      COALESCE(SUM(t.sales_value) FILTER (WHERE t.sales_confirmed = true), 0)::numeric AS sales_value
    FROM tasks t
    JOIN approved_sellers s ON s.user_id = t.created_by
    WHERE (p_date_from IS NULL OR t.start_date >= p_date_from)
      AND (p_date_to IS NULL OR t.end_date <= p_date_to)
    GROUP BY t.created_by
  )
  SELECT
    s.user_id,
    s.name::text,
    s.role::text,
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
  FROM approved_sellers s
  LEFT JOIN task_stats ts ON ts.created_by = s.user_id
  ORDER BY COALESCE(ts.sales_value, 0) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_performance_by_seller(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_performance_by_seller(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_performance_by_seller(date, date) TO service_role;
