-- Fix return type mismatches + add aggregated stats RPC for Reports

CREATE OR REPLACE FUNCTION public.get_secure_tasks_paginated(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  name text,
  client text,
  clientcode text,
  property text,
  propertyhectares numeric,
  responsible text,
  start_date text,
  start_time text,
  end_date text,
  end_time text,
  priority text,
  status text,
  task_type text,
  filial text,
  created_by uuid,
  created_at text,
  updated_at text,
  observations text,
  email text,
  phone text,
  sales_value numeric,
  sales_type text,
  sales_confirmed boolean,
  partial_sales_value numeric,
  is_prospect boolean,
  prospect_notes text,
  initial_km numeric,
  final_km numeric,
  family_product text,
  equipment_quantity integer,
  equipment_list jsonb,
  check_in_location jsonb,
  photos text[],
  documents text[],
  access_level text,
  is_customer_data_protected boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- Manager/Admin: all tasks
  IF v_user_role IN ('manager', 'admin') THEN
    RETURN QUERY
    SELECT
      t.id,
      t.name,
      t.client,
      t.clientcode,
      t.property,
      t.propertyhectares::numeric,
      t.responsible,
      t.start_date::TEXT,
      t.start_time::TEXT,
      t.end_date::TEXT,
      t.end_time::TEXT,
      t.priority,
      t.status,
      t.task_type,
      t.filial,
      t.created_by,
      t.created_at::TEXT,
      t.updated_at::TEXT,
      t.observations,
      t.email,
      t.phone,
      t.sales_value::numeric,
      t.sales_type,
      t.sales_confirmed,
      t.partial_sales_value::numeric,
      t.is_prospect,
      t.prospect_notes,
      t.initial_km::numeric,
      t.final_km::numeric,
      t.family_product,
      t.equipment_quantity::integer,
      t.equipment_list,
      t.check_in_location,
      t.photos,
      t.documents,
      'full'::TEXT,
      FALSE
    FROM tasks t
    ORDER BY t.created_at DESC
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  -- Supervisor: own tasks + filial tasks (using UNION ALL for performance)
  IF v_user_role = 'supervisor' AND v_user_filial_id IS NOT NULL THEN
    RETURN QUERY
    WITH filial_users AS (
      SELECT p.user_id
      FROM profiles p
      WHERE p.filial_id = v_user_filial_id
        AND p.approval_status = 'approved'
    ),
    combined_tasks AS (
      -- Own tasks
      SELECT t.*, 'full'::TEXT AS al, FALSE AS ip
      FROM tasks t
      WHERE t.created_by = v_user_id

      UNION ALL

      -- Filial tasks (excluding own to avoid duplicates)
      SELECT t.*, 'filial'::TEXT AS al, TRUE AS ip
      FROM tasks t
      WHERE t.created_by IN (SELECT fu.user_id FROM filial_users fu)
        AND t.created_by != v_user_id
    )
    SELECT
      ct.id,
      ct.name,
      ct.client,
      ct.clientcode,
      ct.property,
      ct.propertyhectares::numeric,
      ct.responsible,
      ct.start_date::TEXT,
      ct.start_time::TEXT,
      ct.end_date::TEXT,
      ct.end_time::TEXT,
      ct.priority,
      ct.status,
      ct.task_type,
      ct.filial,
      ct.created_by,
      ct.created_at::TEXT,
      ct.updated_at::TEXT,
      CASE WHEN ct.ip THEN NULL ELSE ct.observations END,
      CASE WHEN ct.ip THEN '***@***.***' ELSE ct.email END,
      CASE WHEN ct.ip THEN '(**) *****-****' ELSE ct.phone END,
      ct.sales_value::numeric,
      ct.sales_type,
      ct.sales_confirmed,
      ct.partial_sales_value::numeric,
      ct.is_prospect,
      CASE WHEN ct.ip THEN NULL ELSE ct.prospect_notes END,
      ct.initial_km::numeric,
      ct.final_km::numeric,
      ct.family_product,
      ct.equipment_quantity::integer,
      ct.equipment_list,
      ct.check_in_location,
      ct.photos,
      ct.documents,
      ct.al,
      ct.ip
    FROM combined_tasks ct
    ORDER BY ct.created_at DESC
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  -- Regular users: own tasks only
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.client,
    t.clientcode,
    t.property,
    t.propertyhectares::numeric,
    t.responsible,
    t.start_date::TEXT,
    t.start_time::TEXT,
    t.end_date::TEXT,
    t.end_time::TEXT,
    t.priority,
    t.status,
    t.task_type,
    t.filial,
    t.created_by,
    t.created_at::TEXT,
    t.updated_at::TEXT,
    t.observations,
    t.email,
    t.phone,
    t.sales_value::numeric,
    t.sales_type,
    t.sales_confirmed,
    t.partial_sales_value::numeric,
    t.is_prospect,
    t.prospect_notes,
    t.initial_km::numeric,
    t.final_km::numeric,
    t.family_product,
    t.equipment_quantity::integer,
    t.equipment_list,
    t.check_in_location,
    t.photos,
    t.documents,
    'full'::TEXT,
    FALSE
  FROM tasks t
  WHERE t.created_by = v_user_id
  ORDER BY t.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;


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
  WITH filial_users AS (
    SELECT p.user_id
    FROM profiles p
    WHERE p.filial_id = v_user_filial_id
      AND p.approval_status = 'approved'
  ),
  accessible_tasks AS (
    SELECT t.*
    FROM tasks t
    WHERE (
      v_user_role IN ('manager', 'admin')
      OR (
        v_user_role = 'supervisor'
        AND v_user_filial_id IS NOT NULL
        AND (
          t.created_by = v_user_id
          OR t.created_by IN (SELECT fu.user_id FROM filial_users fu)
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
  products_sum AS (
    SELECT
      pr.task_id,
      SUM(COALESCE(pr.quantity, 0)::numeric * COALESCE(pr.price, 0)::numeric) AS selected_total
    FROM products pr
    WHERE pr.selected IS TRUE
    GROUP BY pr.task_id
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
      COALESCE(
        SUM(
          CASE
            WHEN COALESCE(t.is_prospect, FALSE) = TRUE
             AND COALESCE(t.sales_confirmed, FALSE) = FALSE
            THEN COALESCE(t.sales_value, 0)::numeric
            ELSE 0::numeric
          END
        ),
        0::numeric
      ) AS prospects_value,
      COALESCE(
        SUM(
          CASE
            WHEN COALESCE(t.sales_confirmed, FALSE) = TRUE THEN
              CASE
                WHEN t.sales_type = 'parcial' THEN
                  COALESCE(t.partial_sales_value::numeric, ps.selected_total, 0::numeric)
                ELSE
                  COALESCE(t.sales_value, 0)::numeric
              END
            ELSE 0::numeric
          END
        ),
        0::numeric
      ) AS sales_value
    FROM accessible_tasks t
    LEFT JOIN products_sum ps ON ps.task_id = t.id
  ),
  accessible_opportunities AS (
    SELECT o.*
    FROM opportunities o
    JOIN accessible_tasks t ON t.id = o.task_id
    WHERE (p_filial IS NULL OR o.filial = p_filial)
      AND (p_start_date IS NULL OR o.data_criacao::date >= p_start_date)
      AND (p_end_date IS NULL OR o.data_criacao::date <= p_end_date)
  ),
  opp_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE o.status = 'Prospect')::int AS opp_prospects,
      COALESCE(
        SUM(
          CASE WHEN o.status = 'Prospect'
            THEN COALESCE(o.valor_total_oportunidade, 0)::numeric
            ELSE 0::numeric
          END
        ),
        0::numeric
      ) AS opp_prospects_value,
      COALESCE(
        SUM(
          CASE
            WHEN o.status = 'Venda Total'
              THEN COALESCE(o.valor_venda_fechada, o.valor_total_oportunidade, 0)::numeric
            WHEN o.status = 'Venda Parcial'
              THEN COALESCE(o.valor_venda_fechada, 0)::numeric
            ELSE 0::numeric
          END
        ),
        0::numeric
      ) AS opp_sales_value
    FROM accessible_opportunities o
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