-- Optimize aggregated stats RPC with increased timeout
CREATE OR REPLACE FUNCTION public.get_reports_aggregated_stats(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_filial text DEFAULT NULL
)
RETURNS TABLE(
  total_tasks integer,
  visitas integer,
  checklist integer,
  ligacoes integer,
  prospects integer,
  prospects_value numeric,
  sales_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '120s'
AS $function$
DECLARE
  v_user_id UUID;
  v_user_role TEXT;
  v_user_filial_id UUID;
  v_is_approved BOOLEAN;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT p.role, p.filial_id, (p.approval_status = 'approved')
  INTO v_user_role, v_user_filial_id, v_is_approved
  FROM profiles p
  WHERE p.user_id = v_user_id
  LIMIT 1;

  IF NOT COALESCE(v_is_approved, FALSE) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH accessible_tasks AS (
    SELECT
      t.id,
      t.task_type,
      t.is_prospect,
      t.sales_confirmed,
      t.sales_type,
      t.sales_value,
      t.partial_sales_value
    FROM tasks t
    WHERE (
      v_user_role IN ('manager', 'admin')
      OR (
        v_user_role = 'supervisor'
        AND v_user_filial_id IS NOT NULL
        AND (
          t.created_by = v_user_id
          OR t.created_by IN (
            SELECT p.user_id FROM profiles p
            WHERE p.filial_id = v_user_filial_id
              AND p.approval_status = 'approved'
          )
        )
      )
      OR (
        v_user_role NOT IN ('manager', 'admin', 'supervisor')
        AND t.created_by = v_user_id
      )
    )
    AND (p_user_id IS NULL OR t.created_by = p_user_id)
    AND (p_filial IS NULL OR t.filial = p_filial)
    AND (p_start_date IS NULL OR t.start_date >= p_start_date)
    AND (p_end_date IS NULL OR t.end_date <= p_end_date)
  ),
  task_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE t.task_type = 'prospection')::int AS visitas,
      COUNT(*) FILTER (WHERE t.task_type = 'checklist')::int AS checklist,
      COUNT(*) FILTER (WHERE t.task_type = 'ligacao')::int AS ligacoes,
      COUNT(*) FILTER (
        WHERE COALESCE(t.is_prospect, FALSE) = TRUE
          AND COALESCE(t.sales_confirmed, FALSE) = FALSE
      )::int AS prospects,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(t.is_prospect, FALSE) = TRUE
           AND COALESCE(t.sales_confirmed, FALSE) = FALSE
          THEN COALESCE(t.sales_value, 0)::numeric
          ELSE 0
        END
      ), 0)::numeric AS prospects_value,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(t.sales_confirmed, FALSE) = TRUE THEN
            CASE
              WHEN t.sales_type = 'parcial' THEN COALESCE(t.partial_sales_value, 0)::numeric
              ELSE COALESCE(t.sales_value, 0)::numeric
            END
          ELSE 0
        END
      ), 0)::numeric AS sales_value
    FROM accessible_tasks t
  ),
  opp_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE o.status = 'Prospect')::int AS opp_prospects,
      COALESCE(SUM(
        CASE WHEN o.status = 'Prospect'
          THEN COALESCE(o.valor_total_oportunidade, 0)::numeric
          ELSE 0
        END
      ), 0)::numeric AS opp_prospects_value,
      COALESCE(SUM(
        CASE
          WHEN o.status = 'Venda Total'
            THEN COALESCE(o.valor_venda_fechada, o.valor_total_oportunidade, 0)::numeric
          WHEN o.status = 'Venda Parcial'
            THEN COALESCE(o.valor_venda_fechada, 0)::numeric
          ELSE 0
        END
      ), 0)::numeric AS opp_sales_value
    FROM opportunities o
    WHERE o.task_id IN (SELECT id FROM accessible_tasks)
      AND (p_filial IS NULL OR o.filial = p_filial)
      AND (p_start_date IS NULL OR o.data_criacao::date >= p_start_date)
      AND (p_end_date IS NULL OR o.data_criacao::date <= p_end_date)
  )
  SELECT
    (ts.visitas + ts.checklist + ts.ligacoes)::int AS total_tasks,
    ts.visitas,
    ts.checklist,
    ts.ligacoes,
    (ts.prospects + os.opp_prospects)::int AS prospects,
    (ts.prospects_value + os.opp_prospects_value)::numeric AS prospects_value,
    (ts.sales_value + os.opp_sales_value)::numeric AS sales_value
  FROM task_stats ts
  CROSS JOIN opp_stats os;
END;
$function$;