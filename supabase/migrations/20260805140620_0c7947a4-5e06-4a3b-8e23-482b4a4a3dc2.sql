CREATE OR REPLACE FUNCTION public.search_client_equipment(p_client_code text DEFAULT NULL::text, p_client_name text DEFAULT NULL::text, p_serial text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, client_code text, client_name text, filial_id uuid, model text, serial_chassis text, hours numeric, year integer, observation text, machine_type text, product_raw text, puk_status text, machine_status text, last_validation_at timestamp with time zone, validated_by uuid, import_batch_id uuid, validation_priority boolean, validation_source text, validation_priority_reason text, validation_priority_updated_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_code text := NULLIF(trim(p_client_code), '');
  v_client_name text := NULLIF(trim(p_client_name), '');
  v_serial text := NULLIF(trim(p_serial), '');
  v_uid uuid := auth.uid();
  v_approval text;
  v_employment public.employment_status;
  v_is_privileged boolean;
  v_filial uuid;
  v_sup_filial uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT p.approval_status, p.employment_status
    INTO v_approval, v_employment
  FROM public.profiles p
  WHERE p.user_id = v_uid
  LIMIT 1;

  IF v_approval IS DISTINCT FROM 'approved' OR v_employment IS DISTINCT FROM 'active'::public.employment_status THEN
    RAISE EXCEPTION 'User not authorized';
  END IF;

  IF v_client_code IS NULL AND v_client_name IS NULL AND v_serial IS NULL THEN
    RETURN;
  END IF;

  v_is_privileged := public.has_role(v_uid, 'admin'::public.app_role) OR public.has_role(v_uid, 'manager'::public.app_role);
  v_filial := public.get_user_filial_id();
  v_sup_filial := public.get_supervisor_filial_id(v_uid);

  RETURN QUERY
  WITH code_match AS (
    SELECT ce.id, ce.client_code, ce.client_name, ce.filial_id, ce.model,
           ce.serial_chassis, ce.hours, ce.year, ce.observation, ce.machine_type,
           ce.product_raw, ce.puk_status, ce.machine_status, ce.last_validation_at,
           ce.validated_by, ce.import_batch_id,
           ce.validation_priority, ce.validation_source,
           ce.validation_priority_reason, ce.validation_priority_updated_at,
           ce.created_at, ce.updated_at
    FROM public.client_equipment ce
    WHERE v_client_code IS NOT NULL
      AND ltrim(trim(ce.client_code::text), '0') = ltrim(trim(v_client_code::text), '0')
      AND (
        v_is_privileged
        OR ce.created_by = v_uid
        OR ce.validated_by = v_uid
        OR ce.filial_id IS NULL
        OR ce.filial_id = v_filial
        OR ce.filial_id = v_sup_filial
      )
  ),
  fallback_name AS (
    SELECT ce.id, ce.client_code, ce.client_name, ce.filial_id, ce.model,
           ce.serial_chassis, ce.hours, ce.year, ce.observation, ce.machine_type,
           ce.product_raw, ce.puk_status, ce.machine_status, ce.last_validation_at,
           ce.validated_by, ce.import_batch_id,
           ce.validation_priority, ce.validation_source,
           ce.validation_priority_reason, ce.validation_priority_updated_at,
           ce.created_at, ce.updated_at
    FROM public.client_equipment ce
    WHERE v_client_name IS NOT NULL
      AND ce.client_name ILIKE '%' || v_client_name || '%'
      AND (
        v_is_privileged
        OR ce.created_by = v_uid
        OR ce.validated_by = v_uid
        OR ce.filial_id IS NULL
        OR ce.filial_id = v_filial
        OR ce.filial_id = v_sup_filial
      )
  ),
  serial_match AS (
    SELECT ce.id, ce.client_code, ce.client_name, ce.filial_id, ce.model,
           ce.serial_chassis, ce.hours, ce.year, ce.observation, ce.machine_type,
           ce.product_raw, ce.puk_status, ce.machine_status, ce.last_validation_at,
           ce.validated_by, ce.import_batch_id,
           ce.validation_priority, ce.validation_source,
           ce.validation_priority_reason, ce.validation_priority_updated_at,
           ce.created_at, ce.updated_at
    FROM public.client_equipment ce
    WHERE v_serial IS NOT NULL
      AND ce.serial_chassis ILIKE '%' || v_serial || '%'
      AND (
        v_is_privileged
        OR ce.created_by = v_uid
        OR ce.validated_by = v_uid
        OR ce.filial_id IS NULL
        OR ce.filial_id = v_filial
        OR ce.filial_id = v_sup_filial
      )
  )
  SELECT * FROM code_match
  UNION
  SELECT * FROM fallback_name WHERE NOT EXISTS (SELECT 1 FROM code_match)
  UNION
  SELECT * FROM serial_match
  ORDER BY validation_priority DESC NULLS LAST, updated_at DESC
  LIMIT 200;
END;
$function$;

REVOKE ALL ON FUNCTION public.search_client_equipment(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_client_equipment(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_client_equipment(text, text, text) TO service_role;