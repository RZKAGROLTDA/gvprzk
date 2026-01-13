-- 1) Índices para performance de filtros/paginação
CREATE INDEX IF NOT EXISTS idx_tasks_created_at_desc
  ON public.tasks (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_created_by_created_at_desc
  ON public.tasks (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_filial_created_at_desc
  ON public.tasks (filial, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_task_type_created_at_desc
  ON public.tasks (task_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_opportunities_task_id
  ON public.opportunities (task_id);

CREATE INDEX IF NOT EXISTS idx_opportunities_filial_data_criacao_desc
  ON public.opportunities (filial, data_criacao DESC);

-- 2) RPC paginada com filtros no BACKEND (para o 1º carregamento já vir filtrado)
--    RLS continua valendo (função INVOKER por padrão) e garante supervisor = apenas sua filial.
CREATE OR REPLACE FUNCTION public.get_secure_tasks_paginated_filtered(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_filial text DEFAULT NULL,
  p_task_types text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  client text,
  filial text,
  responsible text,
  task_type text,
  status text,
  is_prospect boolean,
  sales_confirmed boolean,
  sales_type text,
  sales_value numeric,
  partial_sales_value numeric,
  start_date date,
  end_date date,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  total_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    t.id,
    t.client,
    t.filial,
    t.responsible,
    t.task_type,
    t.status,
    COALESCE(t.is_prospect, false) AS is_prospect,
    COALESCE(t.sales_confirmed, false) AS sales_confirmed,
    t.sales_type,
    t.sales_value,
    t.partial_sales_value,
    t.start_date,
    t.end_date,
    t.created_at,
    t.updated_at,
    t.created_by,
    count(*) OVER() AS total_count
  FROM public.tasks t
  WHERE
    (p_start_date IS NULL OR t.created_at >= p_start_date)
    AND (p_end_date IS NULL OR t.created_at <= p_end_date)
    AND (p_created_by IS NULL OR t.created_by = p_created_by)
    AND (p_filial IS NULL OR t.filial = p_filial)
    AND (p_task_types IS NULL OR t.task_type = ANY(p_task_types))
  ORDER BY t.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;