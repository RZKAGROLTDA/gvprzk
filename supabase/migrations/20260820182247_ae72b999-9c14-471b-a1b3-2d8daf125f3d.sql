-- ============================================================
-- ETAPA 3A — get_equipment_validation_summary em passada única
-- Mesmo contrato (nomes/tipos de retorno) e mesma semântica.
-- Continua STABLE e SEM SECURITY DEFINER (universo visível inalterado).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_equipment_validation_summary()
 RETURNS TABLE(total_validated bigint, priority_validated bigint, non_priority_validated bigint, distinct_validated_clients bigint, by_filial jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH resolved AS (
    SELECT
      ce.validation_priority,
      CASE
        WHEN nullif(trim(ce.client_code), '') IS NOT NULL THEN 'c:' || lower(trim(ce.client_code))
        WHEN nullif(trim(ce.client_name), '') IS NOT NULL THEN 'n:' || lower(trim(ce.client_name))
        ELSE NULL
      END AS client_key,
      COALESCE(fp.nome, fh.nome, fe.nome, '—') AS filial_nome
    FROM public.client_equipment ce
    LEFT JOIN public.profiles p          ON p.user_id = ce.validated_by
    LEFT JOIN public.historical_users h  ON h.user_id = ce.validated_by
    LEFT JOIN public.filiais fp ON fp.id = p.filial_id
    LEFT JOIN public.filiais fh ON fh.id = h.filial_id
    LEFT JOIN public.filiais fe ON fe.id = ce.filial_id
    WHERE ce.last_validation_at IS NOT NULL
  ), agg AS (
    -- Uma única passada: ROLLUP produz as linhas por filial + a linha total
    SELECT
      GROUPING(filial_nome) AS is_total,
      filial_nome,
      count(*)::bigint AS validated_count,
      count(*) FILTER (WHERE validation_priority IS TRUE)::bigint AS priority_count,
      count(*) FILTER (WHERE validation_priority IS DISTINCT FROM TRUE)::bigint AS non_priority_count,
      (count(DISTINCT client_key) FILTER (WHERE client_key IS NOT NULL))::bigint AS client_count
    FROM resolved
    GROUP BY ROLLUP(filial_nome)
  )
  SELECT
    COALESCE((SELECT a.validated_count    FROM agg a WHERE a.is_total = 1), 0)::bigint,
    COALESCE((SELECT a.priority_count     FROM agg a WHERE a.is_total = 1), 0)::bigint,
    COALESCE((SELECT a.non_priority_count FROM agg a WHERE a.is_total = 1), 0)::bigint,
    COALESCE((SELECT a.client_count       FROM agg a WHERE a.is_total = 1), 0)::bigint,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'filial_nome', a.filial_nome,
               'validated_count', a.validated_count,
               'priority_count', a.priority_count,
               'non_priority_count', a.non_priority_count,
               'client_count', a.client_count)
             ORDER BY a.validated_count DESC)
      FROM agg a WHERE a.is_total = 0
    ), '[]'::jsonb);
$function$;

-- ============================================================
-- ETAPA 3B — get_equipment_park_paginated cobre todos os filtros da UI
-- Novos parâmetros: p_machine_type, p_validated_by, p_client_code, p_client_name.
-- DROP + CREATE para evitar overloading da RPC.
-- ============================================================
DROP FUNCTION IF EXISTS public.get_equipment_park_paginated(text, uuid, text, text, boolean, integer, integer);

CREATE OR REPLACE FUNCTION public.get_equipment_park_paginated(
  p_search text DEFAULT NULL::text,
  p_filial_id uuid DEFAULT NULL::uuid,
  p_machine_status text DEFAULT NULL::text,
  p_puk_status text DEFAULT NULL::text,
  p_validation_priority boolean DEFAULT NULL::boolean,
  p_machine_type text DEFAULT NULL::text,
  p_validated_by uuid[] DEFAULT NULL::uuid[],
  p_client_code text DEFAULT NULL::text,
  p_client_name text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
 RETURNS TABLE(id uuid, client_code text, client_name text, filial_id uuid, filial_nome text, model text, serial_chassis text, hours numeric, year integer, observation text, machine_type text, product_raw text, puk_status text, machine_status text, last_validation_at timestamp with time zone, validated_by uuid, validation_priority boolean, validation_source text, validation_priority_reason text, validation_priority_updated_at timestamp with time zone, previous_client_code text, previous_client_name text, transferred_by uuid, transferred_at timestamp with time zone, transfer_observation text, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
  v_machine_type text := NULLIF(BTRIM(COALESCE(p_machine_type, '')), '');
  v_client_code text := NULLIF(BTRIM(COALESCE(p_client_code, '')), '');
  v_client_name text := NULLIF(BTRIM(COALESCE(p_client_name, '')), '');
  v_validated_by uuid[] := CASE
    WHEN p_validated_by IS NULL OR array_length(p_validated_by, 1) IS NULL THEN NULL
    ELSE p_validated_by
  END;
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
      AND (v_machine_type IS NULL OR ce.machine_type = v_machine_type)
      AND (v_validated_by IS NULL OR ce.validated_by = ANY (v_validated_by))
      AND (v_client_code IS NULL OR ce.client_code = v_client_code)
      AND (v_client_name IS NULL OR ce.client_name ILIKE '%' || v_client_name || '%')
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
$function$;

REVOKE ALL ON FUNCTION public.get_equipment_park_paginated(text, uuid, text, text, boolean, text, uuid[], text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_equipment_park_paginated(text, uuid, text, text, boolean, text, uuid[], text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_equipment_park_paginated(text, uuid, text, text, boolean, text, uuid[], text, text, integer, integer) TO service_role;

-- Índices de suporte aos novos filtros (não alteram dados nem permissões)
CREATE INDEX IF NOT EXISTS idx_client_equipment_machine_type ON public.client_equipment (machine_type);
CREATE INDEX IF NOT EXISTS idx_client_equipment_validated_by ON public.client_equipment (validated_by) WHERE validated_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_equipment_client_code ON public.client_equipment (client_code);
CREATE INDEX IF NOT EXISTS idx_client_equipment_last_validation_at ON public.client_equipment (last_validation_at) WHERE last_validation_at IS NOT NULL;
