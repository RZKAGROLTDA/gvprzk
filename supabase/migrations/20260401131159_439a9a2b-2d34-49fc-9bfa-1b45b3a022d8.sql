
-- Function 1: Seller summary aggregation
CREATE OR REPLACE FUNCTION get_management_seller_summary(
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_filial text DEFAULT NULL,
  p_seller_role text DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL,
  p_task_types text[] DEFAULT NULL
)
RETURNS TABLE (
  seller_id uuid,
  seller_name text,
  seller_role text,
  filial text,
  visitas bigint,
  ligacoes bigint,
  checklists bigint,
  total_atividades bigint,
  clientes_atendidos bigint,
  oportunidade_gerada numeric,
  valor_convertido numeric,
  taxa_conversao numeric,
  ultima_atividade timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_user_filial_name text;
  v_is_approved boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;

  SELECT p.role, f.nome, (p.approval_status = 'approved')
  INTO v_user_role, v_user_filial_name, v_is_approved
  FROM profiles p
  LEFT JOIN filiais f ON f.id = p.filial_id
  WHERE p.user_id = v_user_id
  LIMIT 1;

  IF NOT COALESCE(v_is_approved, false) THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    t.created_by AS seller_id,
    p.name AS seller_name,
    p.role AS seller_role,
    t.filial,
    COUNT(*) FILTER (WHERE t.task_type IN ('prospection', 'visita')) AS visitas,
    COUNT(*) FILTER (WHERE t.task_type = 'ligacao') AS ligacoes,
    COUNT(*) FILTER (WHERE t.task_type = 'checklist') AS checklists,
    COUNT(t.id) AS total_atividades,
    COUNT(DISTINCT t.client) AS clientes_atendidos,
    COALESCE(SUM(o.valor_total_oportunidade), 0) AS oportunidade_gerada,
    COALESCE(SUM(o.valor_venda_fechada), 0) AS valor_convertido,
    CASE
      WHEN COALESCE(SUM(o.valor_total_oportunidade), 0) > 0
      THEN ROUND(COALESCE(SUM(o.valor_venda_fechada), 0) / SUM(o.valor_total_oportunidade) * 100, 2)
      ELSE 0
    END AS taxa_conversao,
    MAX(t.created_at) AS ultima_atividade
  FROM tasks t
  JOIN profiles p ON p.user_id = t.created_by
  LEFT JOIN opportunities o ON o.task_id = t.id
  WHERE
    -- Access control
    (
      v_user_role IN ('admin', 'manager') OR
      (v_user_role = 'supervisor' AND t.filial = v_user_filial_name) OR
      t.created_by = v_user_id
    )
    -- Filters
    AND (p_start_date IS NULL OR t.created_at >= p_start_date)
    AND (p_end_date IS NULL OR t.created_at <= p_end_date)
    AND (p_filial IS NULL OR t.filial = p_filial)
    AND (p_seller_role IS NULL OR p.role = p_seller_role)
    AND (p_seller_id IS NULL OR t.created_by = p_seller_id)
    AND (p_task_types IS NULL OR t.task_type = ANY(p_task_types))
  GROUP BY t.created_by, p.name, p.role, t.filial
  ORDER BY COALESCE(SUM(o.valor_venda_fechada), 0) DESC;
END;
$$;

-- Function 2: Client details aggregation
CREATE OR REPLACE FUNCTION get_management_client_details(
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_filial text DEFAULT NULL,
  p_seller_role text DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL,
  p_task_types text[] DEFAULT NULL
)
RETURNS TABLE (
  client_name text,
  seller_id uuid,
  seller_name text,
  seller_role text,
  filial text,
  total_atividades bigint,
  visitas bigint,
  ligacoes bigint,
  checklists bigint,
  oportunidade_gerada numeric,
  valor_convertido numeric,
  status_cliente text,
  ultima_atividade timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_user_filial_name text;
  v_is_approved boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;

  SELECT p.role, f.nome, (p.approval_status = 'approved')
  INTO v_user_role, v_user_filial_name, v_is_approved
  FROM profiles p
  LEFT JOIN filiais f ON f.id = p.filial_id
  WHERE p.user_id = v_user_id
  LIMIT 1;

  IF NOT COALESCE(v_is_approved, false) THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    t.client AS client_name,
    t.created_by AS seller_id,
    p.name AS seller_name,
    p.role AS seller_role,
    t.filial,
    COUNT(t.id) AS total_atividades,
    COUNT(*) FILTER (WHERE t.task_type IN ('prospection', 'visita')) AS visitas,
    COUNT(*) FILTER (WHERE t.task_type = 'ligacao') AS ligacoes,
    COUNT(*) FILTER (WHERE t.task_type = 'checklist') AS checklists,
    COALESCE(SUM(o.valor_total_oportunidade), 0) AS oportunidade_gerada,
    COALESCE(SUM(o.valor_venda_fechada), 0) AS valor_convertido,
    CASE
      WHEN COALESCE(SUM(o.valor_venda_fechada), 0) > 0 THEN 'Ganho'
      WHEN bool_or(o.status = 'Perdido') THEN 'Perdido'
      WHEN COALESCE(SUM(o.valor_total_oportunidade), 0) > 0 THEN 'Prospect'
      ELSE 'Sem Oportunidade'
    END AS status_cliente,
    MAX(t.created_at) AS ultima_atividade
  FROM tasks t
  JOIN profiles p ON p.user_id = t.created_by
  LEFT JOIN opportunities o ON o.task_id = t.id
  WHERE
    -- Access control
    (
      v_user_role IN ('admin', 'manager') OR
      (v_user_role = 'supervisor' AND t.filial = v_user_filial_name) OR
      t.created_by = v_user_id
    )
    -- Filters
    AND (p_start_date IS NULL OR t.created_at >= p_start_date)
    AND (p_end_date IS NULL OR t.created_at <= p_end_date)
    AND (p_filial IS NULL OR t.filial = p_filial)
    AND (p_seller_role IS NULL OR p.role = p_seller_role)
    AND (p_seller_id IS NULL OR t.created_by = p_seller_id)
    AND (p_task_types IS NULL OR t.task_type = ANY(p_task_types))
  GROUP BY t.client, t.created_by, p.name, p.role, t.filial
  ORDER BY COALESCE(SUM(o.valor_venda_fechada), 0) DESC;
END;
$$;
