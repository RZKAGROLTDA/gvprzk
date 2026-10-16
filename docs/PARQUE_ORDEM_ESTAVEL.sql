-- =============================================================================
-- Validação de Máquinas — ordenação estável da listagem paginada
-- Única mudança: f.id como último critério de ORDER BY (desempate), mantendo
-- prioridade e data de atualização. Mesma assinatura e retorno: CREATE OR
-- REPLACE preserva as permissões atuais. Filtros, escopo e totais inalterados.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_equipment_park_paginated(
  p_search text DEFAULT NULL, p_filial_id uuid DEFAULT NULL, p_machine_status text DEFAULT NULL,
  p_puk_status text DEFAULT NULL, p_validation_priority boolean DEFAULT NULL, p_machine_type text DEFAULT NULL,
  p_validated_by uuid[] DEFAULT NULL, p_client_code text DEFAULT NULL, p_client_name text DEFAULT NULL,
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_filial_ids uuid[] DEFAULT NULL, p_include_sem_filial boolean DEFAULT false
) RETURNS TABLE(id uuid, client_code text, client_name text, filial_id uuid, filial_nome text, model text,
  serial_chassis text, hours numeric, year integer, observation text, machine_type text, product_raw text,
  puk_status text, machine_status text, last_validation_at timestamptz, validated_by uuid,
  validation_priority boolean, validation_source text, validation_priority_reason text,
  validation_priority_updated_at timestamptz, previous_client_code text, previous_client_name text,
  transferred_by uuid, transferred_at timestamptz, transfer_observation text, created_at timestamptz,
  updated_at timestamptz, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
  v_machine_type text := NULLIF(BTRIM(COALESCE(p_machine_type, '')), '');
  v_client_code text := NULLIF(BTRIM(COALESCE(p_client_code, '')), '');
  v_client_name text := NULLIF(BTRIM(COALESCE(p_client_name, '')), '');
  v_validated_by uuid[] := CASE WHEN p_validated_by IS NULL OR array_length(p_validated_by, 1) IS NULL THEN NULL ELSE p_validated_by END;
  s record;
BEGIN
  IF NOT public.can_view_equipment_park() THEN
    RAISE EXCEPTION 'Acesso nao autorizado ao parque de maquinas';
  END IF;
  SELECT * INTO s FROM public.equipment_park_scope(p_filial_id, p_filial_ids, p_include_sem_filial);
  RETURN QUERY
  WITH filtered AS (
    SELECT ce.* FROM public.client_equipment ce
    WHERE (s.all_filiais OR ce.filial_id = ANY (s.ids) OR (s.include_null AND ce.filial_id IS NULL))
      AND (p_machine_status IS NULL OR ce.machine_status = p_machine_status)
      AND (p_puk_status IS NULL OR ce.puk_status = p_puk_status)
      AND (p_validation_priority IS NULL OR ce.validation_priority = p_validation_priority)
      AND (v_machine_type IS NULL OR ce.machine_type = v_machine_type)
      AND (v_validated_by IS NULL OR ce.validated_by = ANY (v_validated_by))
      AND (v_client_code IS NULL OR ce.client_code = v_client_code)
      AND (v_client_name IS NULL OR ce.client_name ILIKE '%' || v_client_name || '%')
      AND (v_search IS NULL
        OR ce.client_name ILIKE '%' || v_search || '%'
        OR ce.client_code ILIKE '%' || v_search || '%'
        OR ce.model ILIKE '%' || v_search || '%'
        OR ce.serial_chassis ILIKE '%' || v_search || '%')
  ), counted AS (SELECT COUNT(*)::bigint AS total FROM filtered)
  SELECT f.id, f.client_code, f.client_name, f.filial_id, fi.nome, f.model, f.serial_chassis,
    f.hours, f.year, f.observation, f.machine_type, f.product_raw, f.puk_status,
    f.machine_status, f.last_validation_at, f.validated_by, f.validation_priority,
    f.validation_source, f.validation_priority_reason, f.validation_priority_updated_at,
    f.previous_client_code, f.previous_client_name, f.transferred_by, f.transferred_at,
    f.transfer_observation, f.created_at, f.updated_at, c.total
  FROM filtered f CROSS JOIN counted c
  LEFT JOIN public.filiais fi ON fi.id = f.filial_id
  ORDER BY f.validation_priority DESC, f.updated_at DESC, f.id
  LIMIT v_limit OFFSET v_offset;
END $$;
