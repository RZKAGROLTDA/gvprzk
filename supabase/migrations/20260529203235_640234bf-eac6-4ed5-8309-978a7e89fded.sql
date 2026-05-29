CREATE OR REPLACE FUNCTION public.search_client_equipment(
  p_client_code text DEFAULT NULL,
  p_client_name text DEFAULT NULL,
  p_serial text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  client_code text,
  client_name text,
  filial_id uuid,
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
  import_batch_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_code text := NULLIF(trim(p_client_code), '');
  v_client_name text := NULLIF(trim(p_client_name), '');
  v_serial text := NULLIF(trim(p_serial), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_client_code IS NULL AND v_client_name IS NULL AND v_serial IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH code_match AS (
    SELECT
      ce.id,
      ce.client_code,
      ce.client_name,
      ce.filial_id,
      ce.model,
      ce.serial_chassis,
      ce.hours,
      ce.year,
      ce.observation,
      ce.machine_type,
      ce.product_raw,
      ce.puk_status,
      ce.machine_status,
      ce.last_validation_at,
      ce.validated_by,
      ce.import_batch_id,
      ce.created_at,
      ce.updated_at
    FROM public.client_equipment ce
    WHERE v_client_code IS NOT NULL
      AND trim(ce.client_code::text) = trim(v_client_code::text)
  ),
  fallback_name AS (
    SELECT
      ce.id,
      ce.client_code,
      ce.client_name,
      ce.filial_id,
      ce.model,
      ce.serial_chassis,
      ce.hours,
      ce.year,
      ce.observation,
      ce.machine_type,
      ce.product_raw,
      ce.puk_status,
      ce.machine_status,
      ce.last_validation_at,
      ce.validated_by,
      ce.import_batch_id,
      ce.created_at,
      ce.updated_at
    FROM public.client_equipment ce
    WHERE v_client_name IS NOT NULL
      AND ce.client_name ILIKE '%' || v_client_name || '%'
  ),
  serial_match AS (
    SELECT
      ce.id,
      ce.client_code,
      ce.client_name,
      ce.filial_id,
      ce.model,
      ce.serial_chassis,
      ce.hours,
      ce.year,
      ce.observation,
      ce.machine_type,
      ce.product_raw,
      ce.puk_status,
      ce.machine_status,
      ce.last_validation_at,
      ce.validated_by,
      ce.import_batch_id,
      ce.created_at,
      ce.updated_at
    FROM public.client_equipment ce
    WHERE v_serial IS NOT NULL
      AND ce.serial_chassis ILIKE '%' || v_serial || '%'
  )
  SELECT * FROM code_match
  UNION
  SELECT * FROM fallback_name WHERE NOT EXISTS (SELECT 1 FROM code_match)
  UNION
  SELECT * FROM serial_match
  ORDER BY updated_at DESC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_client_equipment(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_client_equipment(text, text, text) TO service_role;