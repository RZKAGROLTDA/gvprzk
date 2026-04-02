
CREATE OR REPLACE FUNCTION public.get_management_product_analysis(
  p_start_date text DEFAULT NULL,
  p_end_date text DEFAULT NULL,
  p_filial text DEFAULT NULL,
  p_task_types text[] DEFAULT NULL,
  p_product text DEFAULT NULL
)
RETURNS TABLE(
  produto text,
  clientes_ofertados bigint,
  qtd_atividades bigint,
  oportunidade_gerada numeric,
  valor_convertido numeric,
  taxa_conversao numeric,
  ticket_medio numeric,
  ultima_oferta timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_security_level text;
  v_filial_nome text;
BEGIN
  -- Check security level
  v_security_level := get_user_security_level();
  
  -- Only managers/admins and supervisors can access
  IF v_security_level NOT IN ('admin', 'manager', 'supervisor') THEN
    RETURN;
  END IF;

  -- Get supervisor filial if applicable
  IF v_security_level = 'supervisor' THEN
    SELECT f.nome INTO v_filial_nome
    FROM profiles p
    JOIN filiais f ON p.filial_id = f.id
    WHERE p.user_id = v_user_id AND p.approval_status = 'approved'
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH product_data AS (
    -- Source 1: opportunity_items joined to opportunities and tasks
    SELECT
      oi.produto AS product_name,
      o.cliente_nome,
      t.id AS task_id,
      t.start_date,
      (oi.qtd_ofertada * oi.preco_unit) AS valor_oportunidade,
      (oi.qtd_vendida * oi.preco_unit) AS valor_venda,
      t.task_type,
      t.filial,
      t.created_at AS activity_date
    FROM opportunity_items oi
    JOIN opportunities o ON o.id = oi.opportunity_id
    JOIN tasks t ON t.id = o.task_id
    WHERE (p_start_date IS NULL OR t.start_date >= p_start_date::date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date::date)
      AND (p_filial IS NULL OR t.filial = p_filial)
      AND (p_task_types IS NULL OR t.task_type = ANY(p_task_types))
      AND (p_product IS NULL OR oi.produto ILIKE '%' || p_product || '%')
      AND (v_security_level IN ('admin', 'manager') OR t.filial = v_filial_nome)

    UNION ALL

    -- Source 2: products table (for tasks without opportunities)
    SELECT
      pr.name AS product_name,
      t.client AS cliente_nome,
      t.id AS task_id,
      t.start_date,
      CASE WHEN pr.selected THEN COALESCE(pr.quantity, 0) * COALESCE(pr.price, 0) ELSE 0 END AS valor_oportunidade,
      CASE 
        WHEN t.sales_type = 'ganho' AND pr.selected THEN COALESCE(pr.quantity, 0) * COALESCE(pr.price, 0)
        WHEN t.sales_type = 'parcial' AND pr.selected THEN COALESCE(pr.quantity, 0) * COALESCE(pr.price, 0)
        ELSE 0
      END AS valor_venda,
      t.task_type,
      t.filial,
      t.created_at AS activity_date
    FROM products pr
    JOIN tasks t ON t.id = pr.task_id
    WHERE pr.selected = true
      AND NOT EXISTS (
        SELECT 1 FROM opportunities o2
        JOIN opportunity_items oi2 ON oi2.opportunity_id = o2.id
        WHERE o2.task_id = t.id AND oi2.produto = pr.name
      )
      AND (p_start_date IS NULL OR t.start_date >= p_start_date::date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date::date)
      AND (p_filial IS NULL OR t.filial = p_filial)
      AND (p_task_types IS NULL OR t.task_type = ANY(p_task_types))
      AND (p_product IS NULL OR pr.name ILIKE '%' || p_product || '%')
      AND (v_security_level IN ('admin', 'manager') OR t.filial = v_filial_nome)

    UNION ALL

    -- Source 3: fallback family_product from tasks (no product detail)
    SELECT
      t.family_product AS product_name,
      t.client AS cliente_nome,
      t.id AS task_id,
      t.start_date,
      COALESCE(t.sales_value, 0) AS valor_oportunidade,
      CASE WHEN t.sales_type IN ('ganho', 'parcial') THEN COALESCE(t.sales_value, 0) ELSE 0 END AS valor_venda,
      t.task_type,
      t.filial,
      t.created_at AS activity_date
    FROM tasks t
    WHERE t.family_product IS NOT NULL AND t.family_product != ''
      AND NOT EXISTS (SELECT 1 FROM products pr WHERE pr.task_id = t.id AND pr.selected = true)
      AND NOT EXISTS (SELECT 1 FROM opportunities o3 WHERE o3.task_id = t.id)
      AND (p_start_date IS NULL OR t.start_date >= p_start_date::date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date::date)
      AND (p_filial IS NULL OR t.filial = p_filial)
      AND (p_task_types IS NULL OR t.task_type = ANY(p_task_types))
      AND (p_product IS NULL OR t.family_product ILIKE '%' || p_product || '%')
      AND (v_security_level IN ('admin', 'manager') OR t.filial = v_filial_nome)
  )
  SELECT
    pd.product_name,
    COUNT(DISTINCT pd.cliente_nome)::bigint AS clientes_ofertados,
    COUNT(DISTINCT pd.task_id)::bigint AS qtd_atividades,
    COALESCE(SUM(pd.valor_oportunidade), 0)::numeric AS oportunidade_gerada,
    COALESCE(SUM(pd.valor_venda), 0)::numeric AS valor_convertido,
    CASE 
      WHEN SUM(pd.valor_oportunidade) > 0 
      THEN ROUND((SUM(pd.valor_venda) / SUM(pd.valor_oportunidade)) * 100, 1)
      ELSE 0
    END::numeric AS taxa_conversao,
    CASE
      WHEN COUNT(DISTINCT pd.cliente_nome) > 0
      THEN ROUND(SUM(pd.valor_venda) / COUNT(DISTINCT pd.cliente_nome), 2)
      ELSE 0
    END::numeric AS ticket_medio,
    MAX(pd.activity_date) AS ultima_oferta
  FROM product_data pd
  WHERE pd.product_name IS NOT NULL AND pd.product_name != ''
  GROUP BY pd.product_name
  ORDER BY SUM(pd.valor_oportunidade) DESC;
END;
$$;
