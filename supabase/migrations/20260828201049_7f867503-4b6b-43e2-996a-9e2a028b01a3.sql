-- R2: painel de pendências da Regularização do Parque (somente leitura)

-- Helper interno: 'sucata' (UI) -> 'sucateada' (armazenado)
CREATE OR REPLACE FUNCTION public.equipment_regularization_situation_norm(p_situation text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_situation = 'sucata' THEN 'sucateada'
    WHEN p_situation IN ('vendida', 'inativa') THEN p_situation
    ELSE NULL
  END
$$;

-- 1) KPIs com os mesmos filtros do painel
CREATE OR REPLACE FUNCTION public.equipment_regularization_pending_kpis(
  p_filial_id uuid DEFAULT NULL,
  p_without_filial boolean DEFAULT false,
  p_client text DEFAULT NULL,
  p_situation text DEFAULT NULL,
  p_chassis text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_situation text := public.equipment_regularization_situation_norm(p_situation);
  v_client text := NULLIF(TRIM(p_client), '');
  v_chassis text := NULLIF(TRIM(p_chassis), '');
BEGIN
  IF NOT public.can_view_equipment_park() THEN RAISE EXCEPTION 'not allowed'; END IF;

  RETURN (
    WITH pending AS (
      SELECT ce.filial_id, ce.client_code, ce.client_name, ce.machine_status
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND NOT EXISTS (
          SELECT 1
          FROM public.equipment_regularization_items i
          JOIN public.equipment_regularization_batches b ON b.id = i.batch_id
          WHERE i.equipment_id = ce.id AND b.status = 'enviado'
        )
        AND (p_filial_id IS NULL OR ce.filial_id = p_filial_id)
        AND (NOT p_without_filial OR ce.filial_id IS NULL)
        AND (v_client IS NULL
             OR unaccent(ce.client_name) ILIKE '%' || unaccent(v_client) || '%'
             OR LTRIM(ce.client_code, '0') = LTRIM(v_client, '0'))
        AND (v_situation IS NULL OR ce.machine_status = v_situation)
        AND (v_chassis IS NULL OR ce.serial_chassis ILIKE '%' || v_chassis || '%')
    ),
    regularized AS (
      SELECT DISTINCT ce.id
      FROM public.client_equipment ce
      JOIN public.equipment_regularization_items i ON i.equipment_id = ce.id
      JOIN public.equipment_regularization_batches b ON b.id = i.batch_id
      WHERE b.status = 'enviado'
        AND ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND (p_filial_id IS NULL OR ce.filial_id = p_filial_id)
        AND (NOT p_without_filial OR ce.filial_id IS NULL)
        AND (v_client IS NULL
             OR unaccent(ce.client_name) ILIKE '%' || unaccent(v_client) || '%'
             OR LTRIM(ce.client_code, '0') = LTRIM(v_client, '0'))
        AND (v_situation IS NULL OR ce.machine_status = v_situation)
        AND (v_chassis IS NULL OR ce.serial_chassis ILIKE '%' || v_chassis || '%')
    )
    SELECT jsonb_build_object(
      'total_pending', (SELECT COUNT(*) FROM pending),
      'total_clients', (SELECT COUNT(DISTINCT (
        COALESCE(NULLIF(TRIM(client_code), ''), UPPER(TRIM(client_name)))
        || '|' || COALESCE(filial_id::text, 'SEM_FILIAL'))) FROM pending),
      'total_regularized', (SELECT COUNT(*) FROM regularized),
      'by_situation', jsonb_build_object(
        'vendida', (SELECT COUNT(*) FROM pending WHERE machine_status = 'vendida'),
        'inativa', (SELECT COUNT(*) FROM pending WHERE machine_status = 'inativa'),
        'sucata',  (SELECT COUNT(*) FROM pending WHERE machine_status = 'sucateada')
      )
    )
  );
END;
$$;

-- 2) Clientes pendentes, agrupados por (cliente normalizado + filial), paginado por grupo
CREATE OR REPLACE FUNCTION public.equipment_regularization_pending_clients(
  p_filial_id uuid DEFAULT NULL,
  p_without_filial boolean DEFAULT false,
  p_client text DEFAULT NULL,
  p_situation text DEFAULT NULL,
  p_chassis text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_situation text := public.equipment_regularization_situation_norm(p_situation);
  v_client text := NULLIF(TRIM(p_client), '');
  v_chassis text := NULLIF(TRIM(p_chassis), '');
BEGIN
  IF NOT public.can_view_equipment_park() THEN RAISE EXCEPTION 'not allowed'; END IF;

  RETURN (
    WITH pending AS (
      SELECT ce.filial_id, ce.client_code, ce.client_name, ce.machine_status, ce.last_validation_at
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND NOT EXISTS (
          SELECT 1
          FROM public.equipment_regularization_items i
          JOIN public.equipment_regularization_batches b ON b.id = i.batch_id
          WHERE i.equipment_id = ce.id AND b.status = 'enviado'
        )
        AND (p_filial_id IS NULL OR ce.filial_id = p_filial_id)
        AND (NOT p_without_filial OR ce.filial_id IS NULL)
        AND (v_client IS NULL
             OR unaccent(ce.client_name) ILIKE '%' || unaccent(v_client) || '%'
             OR LTRIM(ce.client_code, '0') = LTRIM(v_client, '0'))
        AND (v_situation IS NULL OR ce.machine_status = v_situation)
        AND (v_chassis IS NULL OR ce.serial_chassis ILIKE '%' || v_chassis || '%')
    ),
    grouped AS (
      SELECT
        COALESCE(NULLIF(TRIM(client_code), ''), UPPER(TRIM(client_name)))
          || '|' || COALESCE(filial_id::text, 'SEM_FILIAL') AS client_key,
        MAX(client_code) AS client_code,
        MAX(client_name) AS client_name,
        filial_id,
        MAX(last_validation_at) AS last_validation_at,
        COUNT(*) AS total_pending,
        COUNT(*) FILTER (WHERE machine_status = 'vendida') AS vendida,
        COUNT(*) FILTER (WHERE machine_status = 'inativa') AS inativa,
        COUNT(*) FILTER (WHERE machine_status = 'sucateada') AS sucata
      FROM pending
      GROUP BY 1, filial_id
    ),
    total AS (SELECT COUNT(*) AS total_groups FROM grouped)
    SELECT jsonb_build_object(
      'total_groups', (SELECT total_groups FROM total),
      'page', p_page,
      'page_size', p_page_size,
      'clients', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'client_key', g.client_key,
          'client_code', g.client_code,
          'client_name', g.client_name,
          'filial_id', g.filial_id,
          'filial_nome', f.nome,
          'total_pending', g.total_pending,
          'last_validation_at', g.last_validation_at,
          'by_situation', jsonb_build_object(
            'vendida', g.vendida, 'inativa', g.inativa, 'sucata', g.sucata)
        ) ORDER BY g.total_pending DESC, g.client_name)
        FROM (
          SELECT * FROM grouped
          ORDER BY total_pending DESC, client_name
          LIMIT p_page_size OFFSET (p_page - 1) * p_page_size
        ) g
        LEFT JOIN public.filiais f ON f.id = g.filial_id
      ), '[]'::jsonb)
    )
  );
END;
$$;

-- 3) Máquinas de um agrupamento (cliente + filial)
CREATE OR REPLACE FUNCTION public.equipment_regularization_pending_machines(
  p_client_key text,
  p_filial_id uuid DEFAULT NULL,
  p_without_filial boolean DEFAULT false,
  p_client text DEFAULT NULL,
  p_situation text DEFAULT NULL,
  p_chassis text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_situation text := public.equipment_regularization_situation_norm(p_situation);
  v_client text := NULLIF(TRIM(p_client), '');
  v_chassis text := NULLIF(TRIM(p_chassis), '');
BEGIN
  IF NOT public.can_view_equipment_park() THEN RAISE EXCEPTION 'not allowed'; END IF;

  RETURN (
    WITH pending AS (
      SELECT ce.id, ce.client_code, ce.client_name, ce.filial_id,
             ce.model, ce.serial_chassis, ce.year, ce.machine_status,
             ce.last_validation_at, ce.validation_source
      FROM public.client_equipment ce
      WHERE ce.machine_status IN ('vendida', 'inativa', 'sucateada')
        AND NOT EXISTS (
          SELECT 1
          FROM public.equipment_regularization_items i
          JOIN public.equipment_regularization_batches b ON b.id = i.batch_id
          WHERE i.equipment_id = ce.id AND b.status = 'enviado'
        )
        AND (
          COALESCE(NULLIF(TRIM(ce.client_code), ''), UPPER(TRIM(ce.client_name)))
            || '|' || COALESCE(ce.filial_id::text, 'SEM_FILIAL')
        ) = p_client_key
        AND (p_filial_id IS NULL OR ce.filial_id = p_filial_id)
        AND (NOT p_without_filial OR ce.filial_id IS NULL)
        AND (v_client IS NULL
             OR unaccent(ce.client_name) ILIKE '%' || unaccent(v_client) || '%'
             OR LTRIM(ce.client_code, '0') = LTRIM(v_client, '0'))
        AND (v_situation IS NULL OR ce.machine_status = v_situation)
        AND (v_chassis IS NULL OR ce.serial_chassis ILIKE '%' || v_chassis || '%')
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'equipment_id', id,
      'client_code', client_code,
      'client_name', client_name,
      'filial_id', filial_id,
      'model', model,
      'serial_chassis', serial_chassis,
      'year', year,
      'machine_situation', CASE WHEN machine_status = 'sucateada' THEN 'sucata' ELSE machine_status END,
      'last_validation_at', last_validation_at,
      'validation_source', validation_source
    ) ORDER BY client_name, serial_chassis), '[]'::jsonb)
    FROM pending
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.equipment_regularization_situation_norm(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_pending_kpis(uuid, boolean, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_pending_clients(uuid, boolean, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_regularization_pending_machines(text, uuid, boolean, text, text, text) TO authenticated;