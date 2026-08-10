-- 1. Authorization gate for the Equipment Park tab (read-only)
CREATE OR REPLACE FUNCTION public.can_view_equipment_park()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.approval_status = 'approved'
      AND p.employment_status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_equipment_park() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_equipment_park() TO authenticated;

-- 2. Sort index for the park listing
CREATE INDEX IF NOT EXISTS idx_client_equipment_priority_updated
  ON public.client_equipment (validation_priority DESC, updated_at DESC);

-- 3. Paginated listing of the full equipment park (no filial restriction)
CREATE OR REPLACE FUNCTION public.get_equipment_park_paginated(
  p_search text DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL,
  p_machine_status text DEFAULT NULL,
  p_puk_status text DEFAULT NULL,
  p_validation_priority boolean DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  client_code text,
  client_name text,
  filial_id uuid,
  filial_nome text,
  model text,
  serial_chassis text,
  hours numeric,
  year integer,
  observation text,
  machine_type text,
  product_raw text,
  puk_status text,
  machine_status text,
  last_validation_at timestamptz,
  validated_by uuid,
  validation_priority boolean,
  validation_source text,
  validation_priority_reason text,
  validation_priority_updated_at timestamptz,
  previous_client_code text,
  previous_client_name text,
  transferred_by uuid,
  transferred_at timestamptz,
  transfer_observation text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
BEGIN
  IF NOT public.can_view_equipment_park() THEN
    RAISE EXCEPTION 'Acesso não autorizado ao parque de máquinas';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT ce.*
    FROM public.client_equipment ce
    WHERE (p_filial_id IS NULL OR ce.filial_id = p_filial_id)
      AND (p_machine_status IS NULL OR ce.machine_status = p_machine_status)
      AND (p_puk_status IS NULL OR ce.puk_status = p_puk_status)
      AND (p_validation_priority IS NULL OR ce.validation_priority = p_validation_priority)
      AND (
        v_search IS NULL
        OR ce.client_name ILIKE '%' || v_search || '%'
        OR ce.client_code ILIKE '%' || v_search || '%'
        OR ce.model ILIKE '%' || v_search || '%'
        OR ce.serial_chassis ILIKE '%' || v_search || '%'
      )
  ), counted AS (
    SELECT COUNT(*)::bigint AS total FROM filtered
  )
  SELECT
    f.id,
    f.client_code,
    f.client_name,
    f.filial_id,
    fi.nome,
    f.model,
    f.serial_chassis,
    f.hours,
    f.year,
    f.observation,
    f.machine_type,
    f.product_raw,
    f.puk_status,
    f.machine_status,
    f.last_validation_at,
    f.validated_by,
    f.validation_priority,
    f.validation_source,
    f.validation_priority_reason,
    f.validation_priority_updated_at,
    f.previous_client_code,
    f.previous_client_name,
    f.transferred_by,
    f.transferred_at,
    f.transfer_observation,
    f.created_at,
    f.updated_at,
    c.total
  FROM filtered f
  CROSS JOIN counted c
  LEFT JOIN public.filiais fi ON fi.id = f.filial_id
  ORDER BY f.validation_priority DESC, f.updated_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_equipment_park_paginated(text, uuid, text, text, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_equipment_park_paginated(text, uuid, text, text, boolean, integer, integer) TO authenticated;

-- 4. Consolidated KPIs over the exact same universe as the listing
CREATE OR REPLACE FUNCTION public.get_equipment_park_kpis(
  p_search text DEFAULT NULL,
  p_filial_id uuid DEFAULT NULL,
  p_machine_status text DEFAULT NULL,
  p_puk_status text DEFAULT NULL,
  p_validation_priority boolean DEFAULT NULL
)
RETURNS TABLE (
  total bigint,
  total_validadas bigint,
  prioridades bigint,
  nao_prioridades bigint,
  clientes bigint,
  pendentes bigint,
  validacoes_7d bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
BEGIN
  IF NOT public.can_view_equipment_park() THEN
    RAISE EXCEPTION 'Acesso não autorizado ao parque de máquinas';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT ce.client_code, ce.validation_priority, ce.last_validation_at
    FROM public.client_equipment ce
    WHERE (p_filial_id IS NULL OR ce.filial_id = p_filial_id)
      AND (p_machine_status IS NULL OR ce.machine_status = p_machine_status)
      AND (p_puk_status IS NULL OR ce.puk_status = p_puk_status)
      AND (p_validation_priority IS NULL OR ce.validation_priority = p_validation_priority)
      AND (
        v_search IS NULL
        OR ce.client_name ILIKE '%' || v_search || '%'
        OR ce.client_code ILIKE '%' || v_search || '%'
        OR ce.model ILIKE '%' || v_search || '%'
        OR ce.serial_chassis ILIKE '%' || v_search || '%'
      )
  )
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE last_validation_at IS NOT NULL)::bigint,
    COUNT(*) FILTER (WHERE validation_priority)::bigint,
    COUNT(*) FILTER (WHERE NOT validation_priority)::bigint,
    COUNT(DISTINCT client_code)::bigint,
    COUNT(*) FILTER (WHERE last_validation_at IS NULL)::bigint,
    COUNT(*) FILTER (WHERE last_validation_at >= now() - interval '7 days')::bigint
  FROM filtered;
END;
$$;

REVOKE ALL ON FUNCTION public.get_equipment_park_kpis(text, uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_equipment_park_kpis(text, uuid, text, text, boolean) TO authenticated;