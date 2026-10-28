-- Exportação do Parque em lotes (keyset por id). Somente leitura; mesmas regras
-- de acesso e filtros de get_equipment_park_paginated. Sem COUNT, sem OFFSET.
CREATE OR REPLACE FUNCTION public.get_equipment_park_export(
  p_search text DEFAULT NULL, p_filial_id uuid DEFAULT NULL,
  p_machine_status text DEFAULT NULL, p_puk_status text DEFAULT NULL,
  p_validation_priority boolean DEFAULT NULL, p_machine_type text DEFAULT NULL,
  p_validated_by uuid[] DEFAULT NULL, p_client_code text DEFAULT NULL,
  p_client_name text DEFAULT NULL, p_filial_ids uuid[] DEFAULT NULL,
  p_include_sem_filial boolean DEFAULT false,
  p_after_id uuid DEFAULT NULL, p_limit integer DEFAULT 1000)
RETURNS TABLE(id uuid, client_code text, client_name text, filial_id uuid, filial_nome text,
  model text, serial_chassis text, hours numeric, year integer, machine_type text,
  machine_status text, last_validation_at timestamptz, validated_by uuid,
  validation_priority boolean, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 2000);
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
  SELECT ce.id, ce.client_code, ce.client_name, ce.filial_id, fi.nome, ce.model, ce.serial_chassis,
    ce.hours, ce.year, ce.machine_type, ce.machine_status, ce.last_validation_at, ce.validated_by,
    ce.validation_priority, ce.updated_at
  FROM public.client_equipment ce
  LEFT JOIN public.filiais fi ON fi.id = ce.filial_id
  WHERE (p_after_id IS NULL OR ce.id > p_after_id)
    AND (s.all_filiais OR ce.filial_id = ANY (s.ids) OR (s.include_null AND ce.filial_id IS NULL))
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
  ORDER BY ce.id
  LIMIT v_limit;
END $function$;

REVOKE ALL ON FUNCTION public.get_equipment_park_export(text,uuid,text,text,boolean,text,uuid[],text,text,uuid[],boolean,uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_equipment_park_export(text,uuid,text,text,boolean,text,uuid[],text,text,uuid[],boolean,uuid,integer) TO authenticated, service_role;
