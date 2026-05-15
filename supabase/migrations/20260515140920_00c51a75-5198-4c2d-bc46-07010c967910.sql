
-- Phase 3.1: Migrate management RPCs to official analytical contract
-- Source operacional: task_followups (activity_date, filial_id, responsible_user_id)
-- Source comercial: tasks + opportunities
-- Auth: has_role() + get_supervisor_filial_id()

DROP FUNCTION IF EXISTS public.get_management_seller_summary(text, text, text, text, text, text[]);
DROP FUNCTION IF EXISTS public.get_management_client_details(text, text, text, text, text, text[]);
DROP FUNCTION IF EXISTS public.get_management_product_analysis(text, text, text, text[], text);

-- =====================================================
-- get_management_seller_summary
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_management_seller_summary(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL,
  p_seller_role text DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL,
  p_task_types text[] DEFAULT NULL
)
RETURNS TABLE(
  seller_id uuid, seller_name text, seller_role text, filial text,
  visitas bigint, ligacoes bigint, checklists bigint,
  total_atividades bigint, clientes_atendidos bigint,
  oportunidade_gerada numeric, valor_convertido numeric,
  taxa_conversao numeric, ultima_atividade timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_supervisor boolean;
  v_supervisor_filial uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  v_is_admin := has_role(v_user_id, 'admin'::app_role);
  v_is_manager := has_role(v_user_id, 'manager'::app_role);
  v_is_supervisor := has_role(v_user_id, 'supervisor'::app_role);
  IF v_is_supervisor THEN v_supervisor_filial := get_supervisor_filial_id(v_user_id); END IF;

  RETURN QUERY
  WITH ops AS (
    SELECT
      tf.responsible_user_id AS seller_id,
      tf.filial_id,
      COUNT(*) FILTER (WHERE tf.activity_type::text IN ('visita','prospection')) AS visitas,
      COUNT(*) FILTER (WHERE tf.activity_type::text = 'ligacao') AS ligacoes,
      COUNT(*) FILTER (WHERE tf.activity_type::text = 'checklist') AS checklists,
      COUNT(*) AS total_atividades,
      COUNT(DISTINCT COALESCE(NULLIF(tf.client_code,''), LOWER(TRIM(tf.client_name)))) AS clientes_atendidos,
      MAX(tf.activity_date) AS ultima_atividade
    FROM task_followups tf
    WHERE
      (p_start_date IS NULL OR tf.activity_date::date >= p_start_date)
      AND (p_end_date IS NULL OR tf.activity_date::date <= p_end_date)
      AND (p_filial_id IS NULL OR tf.filial_id = p_filial_id)
      AND (p_seller_id IS NULL OR tf.responsible_user_id = p_seller_id)
      AND (p_task_types IS NULL OR tf.activity_type::text = ANY(p_task_types))
      AND (
        v_is_admin OR v_is_manager
        OR (v_is_supervisor AND tf.filial_id = v_supervisor_filial)
        OR tf.responsible_user_id = v_user_id
      )
    GROUP BY tf.responsible_user_id, tf.filial_id
  ),
  comm AS (
    SELECT
      t.created_by AS seller_id,
      COALESCE(SUM(o.valor_total_oportunidade), 0) AS oportunidade_gerada,
      COALESCE(SUM(o.valor_venda_fechada), 0) AS valor_convertido
    FROM tasks t
    JOIN profiles pp ON pp.user_id = t.created_by
    LEFT JOIN opportunities o ON o.task_id = t.id
    WHERE
      (p_start_date IS NULL OR t.start_date >= p_start_date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date)
      AND (p_filial_id IS NULL OR pp.filial_id = p_filial_id)
      AND (p_seller_id IS NULL OR t.created_by = p_seller_id)
      AND (
        v_is_admin OR v_is_manager
        OR (v_is_supervisor AND pp.filial_id = v_supervisor_filial)
        OR t.created_by = v_user_id
      )
    GROUP BY t.created_by
  ),
  primary_role AS (
    SELECT ur.user_id, MIN(
      CASE ur.role::text
        WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'supervisor' THEN 3
        WHEN 'rac' THEN 4 ELSE 5 END
    ) AS rk,
    (ARRAY_AGG(ur.role::text ORDER BY
      CASE ur.role::text WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'supervisor' THEN 3 WHEN 'rac' THEN 4 ELSE 5 END
    ))[1] AS role
    FROM user_roles ur
    GROUP BY ur.user_id
  )
  SELECT
    ops.seller_id,
    p.name AS seller_name,
    COALESCE(pr.role, 'consultant') AS seller_role,
    f.nome AS filial,
    ops.visitas, ops.ligacoes, ops.checklists, ops.total_atividades, ops.clientes_atendidos,
    COALESCE(comm.oportunidade_gerada, 0) AS oportunidade_gerada,
    COALESCE(comm.valor_convertido, 0) AS valor_convertido,
    CASE WHEN COALESCE(comm.oportunidade_gerada, 0) > 0
      THEN ROUND(comm.valor_convertido / comm.oportunidade_gerada * 100, 2)
      ELSE 0 END AS taxa_conversao,
    ops.ultima_atividade
  FROM ops
  LEFT JOIN comm ON comm.seller_id = ops.seller_id
  LEFT JOIN profiles p ON p.user_id = ops.seller_id
  LEFT JOIN filiais f ON f.id = ops.filial_id
  LEFT JOIN primary_role pr ON pr.user_id = ops.seller_id
  WHERE (p_seller_role IS NULL OR COALESCE(pr.role, 'consultant') = p_seller_role)
  ORDER BY COALESCE(comm.valor_convertido, 0) DESC, ops.total_atividades DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_management_seller_summary(date, date, uuid, text, uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_management_seller_summary(date, date, uuid, text, uuid, text[]) TO authenticated;

-- =====================================================
-- get_management_client_details
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_management_client_details(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL,
  p_seller_role text DEFAULT NULL,
  p_seller_id uuid DEFAULT NULL,
  p_task_types text[] DEFAULT NULL
)
RETURNS TABLE(
  client_name text, seller_id uuid, seller_name text, seller_role text, filial text,
  total_atividades bigint, visitas bigint, ligacoes bigint, checklists bigint,
  oportunidade_gerada numeric, valor_convertido numeric,
  status_cliente text, ultima_atividade timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_supervisor boolean;
  v_supervisor_filial uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  v_is_admin := has_role(v_user_id, 'admin'::app_role);
  v_is_manager := has_role(v_user_id, 'manager'::app_role);
  v_is_supervisor := has_role(v_user_id, 'supervisor'::app_role);
  IF v_is_supervisor THEN v_supervisor_filial := get_supervisor_filial_id(v_user_id); END IF;

  RETURN QUERY
  WITH ops AS (
    SELECT
      COALESCE(NULLIF(tf.client_code,''), LOWER(TRIM(tf.client_name))) AS client_key,
      MAX(tf.client_name) AS client_name,
      tf.responsible_user_id AS seller_id,
      tf.filial_id,
      COUNT(*) AS total_atividades,
      COUNT(*) FILTER (WHERE tf.activity_type::text IN ('visita','prospection')) AS visitas,
      COUNT(*) FILTER (WHERE tf.activity_type::text = 'ligacao') AS ligacoes,
      COUNT(*) FILTER (WHERE tf.activity_type::text = 'checklist') AS checklists,
      MAX(tf.activity_date) AS ultima_atividade
    FROM task_followups tf
    WHERE
      (p_start_date IS NULL OR tf.activity_date::date >= p_start_date)
      AND (p_end_date IS NULL OR tf.activity_date::date <= p_end_date)
      AND (p_filial_id IS NULL OR tf.filial_id = p_filial_id)
      AND (p_seller_id IS NULL OR tf.responsible_user_id = p_seller_id)
      AND (p_task_types IS NULL OR tf.activity_type::text = ANY(p_task_types))
      AND (
        v_is_admin OR v_is_manager
        OR (v_is_supervisor AND tf.filial_id = v_supervisor_filial)
        OR tf.responsible_user_id = v_user_id
      )
    GROUP BY client_key, tf.responsible_user_id, tf.filial_id
  ),
  comm AS (
    SELECT
      COALESCE(NULLIF(t.clientcode,''), LOWER(TRIM(t.client))) AS client_key,
      t.created_by AS seller_id,
      COALESCE(SUM(o.valor_total_oportunidade), 0) AS oportunidade_gerada,
      COALESCE(SUM(o.valor_venda_fechada), 0) AS valor_convertido,
      bool_or(o.status = 'Perdido') AS has_perdido
    FROM tasks t
    LEFT JOIN opportunities o ON o.task_id = t.id
    WHERE
      (p_start_date IS NULL OR t.start_date >= p_start_date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date)
    GROUP BY client_key, t.created_by
  ),
  primary_role AS (
    SELECT ur.user_id,
    (ARRAY_AGG(ur.role::text ORDER BY
      CASE ur.role::text WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'supervisor' THEN 3 WHEN 'rac' THEN 4 ELSE 5 END
    ))[1] AS role
    FROM user_roles ur GROUP BY ur.user_id
  )
  SELECT
    ops.client_name,
    ops.seller_id,
    p.name AS seller_name,
    COALESCE(pr.role, 'consultant') AS seller_role,
    f.nome AS filial,
    ops.total_atividades, ops.visitas, ops.ligacoes, ops.checklists,
    COALESCE(comm.oportunidade_gerada, 0) AS oportunidade_gerada,
    COALESCE(comm.valor_convertido, 0) AS valor_convertido,
    CASE
      WHEN COALESCE(comm.valor_convertido, 0) > 0 THEN 'Ganho'
      WHEN COALESCE(comm.has_perdido, false) THEN 'Perdido'
      WHEN COALESCE(comm.oportunidade_gerada, 0) > 0 THEN 'Prospect'
      ELSE 'Sem Oportunidade'
    END AS status_cliente,
    ops.ultima_atividade
  FROM ops
  LEFT JOIN comm ON comm.client_key = ops.client_key AND comm.seller_id = ops.seller_id
  LEFT JOIN profiles p ON p.user_id = ops.seller_id
  LEFT JOIN filiais f ON f.id = ops.filial_id
  LEFT JOIN primary_role pr ON pr.user_id = ops.seller_id
  WHERE (p_seller_role IS NULL OR COALESCE(pr.role, 'consultant') = p_seller_role)
  ORDER BY COALESCE(comm.valor_convertido, 0) DESC, ops.total_atividades DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_management_client_details(date, date, uuid, text, uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_management_client_details(date, date, uuid, text, uuid, text[]) TO authenticated;

-- =====================================================
-- get_management_product_analysis
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_management_product_analysis(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL,
  p_task_types text[] DEFAULT NULL,
  p_product text DEFAULT NULL
)
RETURNS TABLE(
  produto text, clientes_ofertados bigint, qtd_atividades bigint,
  oportunidade_gerada numeric, valor_convertido numeric,
  taxa_conversao numeric, ticket_medio numeric, ultima_oferta timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_supervisor boolean;
  v_supervisor_filial uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  v_is_admin := has_role(v_user_id, 'admin'::app_role);
  v_is_manager := has_role(v_user_id, 'manager'::app_role);
  v_is_supervisor := has_role(v_user_id, 'supervisor'::app_role);
  IF NOT (v_is_admin OR v_is_manager OR v_is_supervisor) THEN RETURN; END IF;
  IF v_is_supervisor THEN v_supervisor_filial := get_supervisor_filial_id(v_user_id); END IF;

  RETURN QUERY
  WITH product_data AS (
    SELECT
      oi.produto AS product_name,
      o.cliente_nome,
      t.id AS task_id,
      (oi.qtd_ofertada * oi.preco_unit) AS valor_oportunidade,
      (oi.qtd_vendida * oi.preco_unit) AS valor_venda,
      t.task_type,
      t.created_at AS activity_date
    FROM opportunity_items oi
    JOIN opportunities o ON o.id = oi.opportunity_id
    JOIN tasks t ON t.id = o.task_id
    JOIN profiles pp ON pp.user_id = t.created_by
    WHERE (p_start_date IS NULL OR t.start_date >= p_start_date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date)
      AND (p_filial_id IS NULL OR pp.filial_id = p_filial_id)
      AND (p_task_types IS NULL OR t.task_type = ANY(p_task_types))
      AND (p_product IS NULL OR oi.produto ILIKE '%' || p_product || '%')
      AND (v_is_admin OR v_is_manager OR (v_is_supervisor AND pp.filial_id = v_supervisor_filial))
    UNION ALL
    SELECT
      pr.name, t.client, t.id,
      CASE WHEN pr.selected THEN COALESCE(pr.quantity,0)*COALESCE(pr.price,0) ELSE 0 END,
      CASE WHEN t.sales_type IN ('ganho','parcial') AND pr.selected THEN COALESCE(pr.quantity,0)*COALESCE(pr.price,0) ELSE 0 END,
      t.task_type, t.created_at
    FROM products pr
    JOIN tasks t ON t.id = pr.task_id
    JOIN profiles pp ON pp.user_id = t.created_by
    WHERE pr.selected = true
      AND NOT EXISTS (SELECT 1 FROM opportunities o2 JOIN opportunity_items oi2 ON oi2.opportunity_id = o2.id WHERE o2.task_id = t.id AND oi2.produto = pr.name)
      AND (p_start_date IS NULL OR t.start_date >= p_start_date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date)
      AND (p_filial_id IS NULL OR pp.filial_id = p_filial_id)
      AND (p_task_types IS NULL OR t.task_type = ANY(p_task_types))
      AND (p_product IS NULL OR pr.name ILIKE '%' || p_product || '%')
      AND (v_is_admin OR v_is_manager OR (v_is_supervisor AND pp.filial_id = v_supervisor_filial))
    UNION ALL
    SELECT
      t.family_product, t.client, t.id,
      COALESCE(t.sales_value,0),
      CASE WHEN t.sales_type IN ('ganho','parcial') THEN COALESCE(t.sales_value,0) ELSE 0 END,
      t.task_type, t.created_at
    FROM tasks t
    JOIN profiles pp ON pp.user_id = t.created_by
    WHERE t.family_product IS NOT NULL AND t.family_product != ''
      AND NOT EXISTS (SELECT 1 FROM products pr WHERE pr.task_id = t.id AND pr.selected = true)
      AND NOT EXISTS (SELECT 1 FROM opportunities o3 WHERE o3.task_id = t.id)
      AND (p_start_date IS NULL OR t.start_date >= p_start_date)
      AND (p_end_date IS NULL OR t.start_date <= p_end_date)
      AND (p_filial_id IS NULL OR pp.filial_id = p_filial_id)
      AND (p_task_types IS NULL OR t.task_type = ANY(p_task_types))
      AND (p_product IS NULL OR t.family_product ILIKE '%' || p_product || '%')
      AND (v_is_admin OR v_is_manager OR (v_is_supervisor AND pp.filial_id = v_supervisor_filial))
  )
  SELECT
    pd.product_name,
    COUNT(DISTINCT pd.cliente_nome)::bigint,
    COUNT(DISTINCT pd.task_id)::bigint,
    COALESCE(SUM(pd.valor_oportunidade),0)::numeric,
    COALESCE(SUM(pd.valor_venda),0)::numeric,
    CASE WHEN SUM(pd.valor_oportunidade) > 0
      THEN ROUND((SUM(pd.valor_venda)/SUM(pd.valor_oportunidade))*100,1) ELSE 0 END::numeric,
    CASE WHEN COUNT(DISTINCT pd.cliente_nome) > 0
      THEN ROUND(SUM(pd.valor_venda)/COUNT(DISTINCT pd.cliente_nome),2) ELSE 0 END::numeric,
    MAX(pd.activity_date)
  FROM product_data pd
  WHERE pd.product_name IS NOT NULL AND pd.product_name != ''
  GROUP BY pd.product_name
  ORDER BY SUM(pd.valor_oportunidade) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_management_product_analysis(date, date, uuid, text[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_management_product_analysis(date, date, uuid, text[], text) TO authenticated;
