-- Adicionar filial_atendida ao retorno da função get_secure_tasks_paginated_filtered
CREATE OR REPLACE FUNCTION public.get_secure_tasks_paginated_filtered(
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0,
    p_start_date text DEFAULT NULL,
    p_end_date text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL,
    p_filial text DEFAULT NULL,
    p_task_types text[] DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    client text,
    created_by uuid,
    created_at timestamptz,
    updated_at timestamptz,
    start_date text,
    end_date text,
    filial text,
    filial_atendida text,
    responsible text,
    task_type text,
    status text,
    is_prospect boolean,
    sales_confirmed boolean,
    sales_type text,
    sales_value numeric,
    partial_sales_value numeric,
    total_count bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_total_count bigint;
BEGIN
    -- Primeiro contar o total de registros que passam pelos filtros
    SELECT COUNT(*)
    INTO v_total_count
    FROM tasks t
    WHERE (p_start_date IS NULL OR t.created_at >= p_start_date::timestamptz)
      AND (p_end_date IS NULL OR t.created_at <= (p_end_date || 'T23:59:59')::timestamptz)
      AND (p_created_by IS NULL OR t.created_by = p_created_by)
      AND (p_filial IS NULL OR t.filial = p_filial)
      AND (p_task_types IS NULL OR t.task_type = ANY(p_task_types));

    RETURN QUERY
    SELECT 
        t.id,
        t.client,
        t.created_by,
        t.created_at,
        t.updated_at,
        t.start_date,
        t.end_date,
        t.filial,
        t.filial_atendida,
        t.responsible,
        t.task_type,
        t.status,
        t.is_prospect,
        t.sales_confirmed,
        t.sales_type,
        t.sales_value,
        t.partial_sales_value,
        v_total_count as total_count
    FROM tasks t
    WHERE (p_start_date IS NULL OR t.created_at >= p_start_date::timestamptz)
      AND (p_end_date IS NULL OR t.created_at <= (p_end_date || 'T23:59:59')::timestamptz)
      AND (p_created_by IS NULL OR t.created_by = p_created_by)
      AND (p_filial IS NULL OR t.filial = p_filial)
      AND (p_task_types IS NULL OR t.task_type = ANY(p_task_types))
    ORDER BY t.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;